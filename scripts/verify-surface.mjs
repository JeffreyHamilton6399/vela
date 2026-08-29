/**
 * Checks Vela's browser surface the only way it can honestly be checked: in a
 * plain Electron launch, with nothing else driving the browser.
 *
 *   node scripts/verify-surface.mjs
 *
 * This exists because the question it answers has been got wrong before, in
 * both directions, and always for the same reason. The surface is installed
 * over the devtools protocol, and an automation harness — Playwright, or
 * anything else driving Chromium over CDP — attaches to the same targets and
 * speaks the same protocol. Ask a harness whether the surface is there and you
 * are asking about the harness.
 *
 * Two wrong answers have come out of that. Once the surface was measured as
 * absent and the working code deleted on the strength of it; that run had
 * `navigator.webdriver` true throughout, which Google refuses on its own
 * whatever else is on the page. Later the popup path was measured as broken
 * under Playwright when it was not: the harness's own auto-attach supersedes a
 * per-WebContents script registration, so the popup's document is created
 * without it and the result says nothing about Vela.
 *
 * So this launches Electron directly, serves its own pages from two hosts so
 * the popup is a genuinely cross-process one, and asks each document what it
 * could see in its own first inline script. It runs the real modules, bundled
 * from source with the project's own bundler — a verifier that tests its own
 * reimplementation verifies nothing. Nothing here touches the network and
 * nothing here needs an account.
 *
 * Exits non-zero if a tab or either popup is missing the surface.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronBinary from 'electron';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(path.join(tmpdir(), 'vela-verify-'));

// The real module, bundled the same way the app bundles it.
await build({
  configFile: false,
  logLevel: 'error',
  build: {
    outDir: work,
    emptyOutDir: false,
    target: 'node22',
    minify: false,
    lib: {
      entry: path.join(root, 'src/main/privacy/session-hardening.ts'),
      formats: ['es'],
      fileName: () => 'surface.mjs',
    },
    rollupOptions: { external: (id) => id === 'electron' || id.startsWith('node:') },
  },
});

/**
 * The Electron side.
 *
 * A separate process on purpose: the checking half must not be sitting in the
 * same process as the thing it is checking, influencing what the page sees.
 */
const MAIN = String.raw`
const { app, BrowserWindow, WebContentsView, session } = require('electron');
const http = require('node:http');

const PAGE =
  '<!doctype html><script>' +
  'window.__seen = JSON.stringify({' +
  '  chrome: Object.keys(window.chrome || {}).sort().join(","),' +
  '  brands: (((navigator.userAgentData || {}).brands) || []).map(function (b) { return b.brand; }).join(","),' +
  '  langs: navigator.languages.join(",")' +
  '});' +
  '</script><title>probe</title><body>probe</body>';

function serve(handler) {
  return new Promise(function (resolve) {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', function () { resolve(server); });
  });
}

app.whenReady().then(async function () {
  const surfaceModule = await import(process.env.VELA_SURFACE_URL);
  const { hardenSession, applyBrowserSurface, applyBrowserSurfaceToPopup } = surfaceModule;

  let popupOrigin = '';
  let openerOrigin = '';
  const openerServer = await serve(function (req, res) {
    res.writeHead(200, { 'content-type': 'text/html' });
    if (req.url === '/popup') { res.end(PAGE); return; }
    // Two popups: one to another host and one to this one. A cross-process
    // navigation is slow enough to hide a racy install; a same-origin one
    // commits before it and does not.
    res.end(
      PAGE +
      '<script>window.open("' + popupOrigin + '/popup","cross","width=500,height=600");' +
      'window.open("' + openerOrigin + '/popup","same","width=500,height=600");</script>'
    );
  });
  const popupServer = await serve(function (_req, res) {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(PAGE);
  });

  // Two different hosts, so the popup is a cross-process navigation. That is
  // what a sign-in popup always is, and it is the case a same-origin check
  // quietly passes without exercising.
  popupOrigin = 'http://localhost:' + popupServer.address().port;
  openerOrigin = 'http://127.0.0.1:' + openerServer.address().port;
  const openerUrl = openerOrigin + '/opener';

  const ses = session.defaultSession;
  hardenSession(ses, {
    userAgent: ses.getUserAgent().replace(/ Electron\/[^ ]+/, ''),
    identity: {
      platform: process.platform,
      chromeMajorVersion: process.versions.chrome.split('.')[0],
    },
    isDev: false,
    stripReferer: function () { return true; },
    onUnexpectedRequest: function () {},
  });

  const host = new BrowserWindow({ show: false, width: 900, height: 700 });
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      session: ses,
    },
  });
  host.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 900, height: 700 });

  function read(contents) {
    return contents.executeJavaScript('window.__seen');
  }

  // Every finished load, not the first. A popup whose original navigation is
  // held and re-issued finishes twice, and it is the document the user is left
  // looking at -- the last one -- that a sign-in check actually reads.
  const popups = { cross: null, same: null };
  view.webContents.setWindowOpenHandler(function (details) {
    return details.disposition === 'new-window'
      ? { action: 'allow', outlivesOpener: false }
      : { action: 'deny' };
  });
  view.webContents.on('did-create-window', function (win, details) {
    const name = details.frameName;
    applyBrowserSurfaceToPopup(win.webContents, {
      url: details.url,
      referrer: details.referrer,
      postBody: details.postBody,
    });
    win.webContents.on('did-finish-load', function () {
      read(win.webContents).then(function (v) { popups[name] = v; }, function () {});
    });
  });

  const surface = applyBrowserSurface(view.webContents, { prime: true });
  await surface.ready();
  await view.webContents.loadURL(openerUrl);

  const tab = await read(view.webContents);
  // Let both popups open, be held, and be re-issued before reading.
  await new Promise(function (r) { setTimeout(r, 5000); });
  const result = {
    tab: tab,
    'popup (cross-origin)': popups.cross,
    'popup (same-origin)': popups.same,
  };
  console.log('VERIFY_SURFACE ' + JSON.stringify(result));
  openerServer.close();
  popupServer.close();
  app.exit(0);
}).catch(function (error) {
  console.log('VERIFY_SURFACE_ERROR ' + String((error && error.stack) || error));
  app.exit(1);
});
`;

const mainPath = path.join(work, 'main.cjs');
writeFileSync(mainPath, MAIN);

// The binary the `electron` package points at, rather than the `.bin` shim,
// which on Windows is a batch file and would need a shell to run.
const child = spawn(String(electronBinary), [mainPath], {
  env: {
    ...process.env,
    VELA_SURFACE_URL: new URL(`file://${path.join(work, 'surface.mjs').replace(/\\/g, '/')}`).href,
  },
});

let output = '';
for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    output += String(chunk);
  });
}

child.on('close', () => {
  const lines = output.split(/\r?\n/);
  const failure = lines.find((line) => line.startsWith('VERIFY_SURFACE_ERROR '));
  if (failure !== undefined) {
    console.error(failure);
    process.exit(1);
  }

  const line = lines.find((l) => l.startsWith('VERIFY_SURFACE '));
  if (line === undefined) {
    console.error(`the probe produced no result:\n${output}`);
    process.exit(1);
  }

  const seen = JSON.parse(line.slice('VERIFY_SURFACE '.length));
  const WANT = 'app,csi,loadTimes';

  /**
   * Both popups decide the outcome, and the same-origin one is the reason this
   * file is worth running.
   *
   * It failed for a long time and was excused as unfixable, on the reasoning
   * that a "Sign in with ..." popup is cross-origin anyway. The cause was that
   * the first document created after registering the surface never gets it: a
   * cross-origin navigation is slow enough to end up a document further on
   * than it looks, and a same-origin one commits straight into the gap. Vela
   * now puts one deliberate blank document in front of the real page, so the
   * real page is never the first. See `blankHop` for why the page has to be
   * the thing that navigates.
   */
  let bad = false;

  for (const [where, raw] of Object.entries(seen)) {
    const got = raw === null ? null : JSON.parse(raw);
    const ok = got !== null && got.chrome === WANT;
    if (!ok) bad = true;
    const mark = ok ? '✓' : '✗';
    console.log(
      `${mark} ${where.padEnd(21)} window.chrome at document-start: ` +
        `${got === null ? '(never loaded)' : JSON.stringify(got.chrome)}`,
    );
    if (got !== null) {
      console.log(`        brands:    ${JSON.stringify(got.brands)}`);
      console.log(`        languages: ${JSON.stringify(got.langs)}`);
    }
  }

  if (bad) {
    console.error(
      '\nThe surface is missing where it matters. A sign-in popup without it is' +
        '\na sign-in that gets turned away.',
    );
    process.exit(1);
  }
  console.log(
    '\nA tab, and a sign-in popup to either origin, all see Chrome before their' +
      '\nown first script runs.',
  );
});
