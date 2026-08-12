import { createServer, type Server } from 'node:http';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchVela } from './launch-app.js';

interface Bridge {
  tabs: { create: (options: { url: string }) => void };
}

let app: ElectronApplication;
let closeApp: () => Promise<void>;
let chrome: Page;
let server: Server;
let origin: string;

type Headers = Record<string, string | string[] | undefined>;

/** Headers of the document request, and of a subresource it then fetches. */
let documentHeaders: Headers = {};
let subresourceHeaders: Headers = {};

/** A second origin, so a request between the two is genuinely cross-origin. */
let other: Server;
let otherOrigin: string;

/** Headers of a cross-origin POST, which is the shape a login submit takes. */
let loginHeaders: Headers = {};

test.beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === '/sub') {
      subresourceHeaders = { ...request.headers };
      response.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    documentHeaders = { ...request.headers };
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(
      // Client hints ride on subresource requests, so the page makes one.
      `<!doctype html><title>echo</title><body>echo<script>fetch('/sub')</script></body>`,
    );
  });

  // Stands in for the sign-in host a login form posts across to. Only the POST
  // is recorded: the favicon request that follows it carries no referer and
  // would otherwise overwrite the one under test.
  other = createServer((request, response) => {
    if (request.method === 'POST') loginHeaders = { ...request.headers };
    response
      .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      .end('<title>in</title>');
  });

  for (const listener of [server, other]) {
    await new Promise<void>((resolve) => {
      listener.listen(0, '127.0.0.1', resolve);
    });
  }
  const portOf = (listener: Server): string => {
    const address = listener.address();
    return String(typeof address === 'object' && address !== null ? address.port : 0);
  };
  origin = `http://localhost:${portOf(server)}`;
  otherOrigin = `http://127.0.0.1:${portOf(other)}`;

  const launched = await launchVela();
  app = launched.app;
  closeApp = launched.close;
  chrome = await app.firstWindow();
  await chrome.waitForSelector('[role="tablist"]');

  await chrome.evaluate((url) => {
    (window as unknown as { vela: Bridge }).vela.tabs.create({ url });
  }, `${origin}/echo`);

  await expect.poll(() => subresourceHeaders['sec-ch-ua'], { timeout: 15_000 }).toBeDefined();
});

test.afterAll(async () => {
  await closeApp();
  for (const listener of [server, other]) {
    await new Promise<void>((resolve) => {
      listener.close(() => {
        resolve();
      });
    });
  }
});

/**
 * What a website actually receives, rather than what Vela means to send.
 *
 * The user-agent test in privacy.spec.ts asserts on the string Vela built for
 * itself, which is not the same claim: a `setUserAgent` that never reached page
 * requests would pass that test and still tell every site it is Electron.
 */
test('a real page request carries no Electron token', () => {
  const userAgent = String(documentHeaders['user-agent']);
  expect(userAgent.toLowerCase()).not.toContain('electron');
  expect(userAgent.toLowerCase()).not.toContain('vela');
  expect(userAgent).toMatch(/^Mozilla\/5\.0 \(.+\) AppleWebKit\/537\.36 .+ Safari\/537\.36$/);
});

/**
 * The half that used to disagree. Chromium builds the brand list from what it
 * really is, so an Electron embedder sends `"Chromium"` and no Chrome brand
 * while its user agent claims Chrome — and a sign-in page reads the mismatch
 * as an embedded webview rather than a browser.
 */
test('the client-hint brand list agrees with the user agent', () => {
  const brands = String(subresourceHeaders['sec-ch-ua']);

  expect(brands).toContain('"Google Chrome"');
  expect(brands.toLowerCase()).not.toContain('electron');

  // The claimed Chrome version has to be the build actually rendering the
  // page, or the two halves disagree again in a way that is easy to check.
  const chromium = /"Chromium";v="([^"]+)"/.exec(brands)?.[1];
  const chrome = /"Google Chrome";v="([^"]+)"/.exec(brands)?.[1];
  expect(chromium).toBeDefined();
  expect(chrome).toBe(chromium);

  const userAgent = String(documentHeaders['user-agent']);
  expect(userAgent).toContain(`Chrome/${String(chromium)}.`);
});

/**
 * The hints Chrome sends unprompted have to be there at all.
 *
 * Electron sends none of them, whatever the user agent says, which leaves a
 * browser claiming to be Chrome and sending no `Sec-CH-UA` — a combination no
 * real Chrome produces and a sign-in front end reads as a webview.
 */
test('every low-entropy client hint Chrome sends is present', () => {
  expect(subresourceHeaders['sec-ch-ua']).toBeDefined();
  expect(subresourceHeaders['sec-ch-ua-mobile']).toBe('?0');
  expect(String(subresourceHeaders['sec-ch-ua-platform'])).toMatch(/^"(Windows|macOS|Linux)"$/);
});

/**
 * Signing in usually means a POST to another origin, and the CSRF check on the
 * far side falls back to `Referer` when there is no `Origin` to read. Removing
 * the header outright — which is what "strip" used to mean — makes those
 * requests indistinguishable from a forged one, and Django rejects them.
 *
 * The origin survives; the path never does.
 */
test('a cross-origin login POST still carries an origin to check', async () => {
  await chrome.evaluate((url) => {
    (window as unknown as { vela: Bridge }).vela.tabs.create({ url });
  }, `${origin}/from`);

  // Submitting into a document that is still loading loses the POST to the
  // navigation that finishes after it, so wait for the page to settle first.
  await expect
    .poll(
      () =>
        app.evaluate(({ webContents }) => {
          const page = webContents
            .getAllWebContents()
            .find((contents) => contents.getURL().includes('/from'));
          return page?.executeJavaScript('document.readyState') ?? null;
        }),
      { timeout: 15_000 },
    )
    .toBe('complete');

  await app.evaluate(({ webContents }, action) => {
    const page = webContents
      .getAllWebContents()
      .find((contents) => contents.getURL().includes('/from'));
    return page?.executeJavaScript(`
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = ${JSON.stringify(action)};
      document.body.appendChild(form);
      form.submit();
    `);
  }, `${otherOrigin}/session`);

  await expect.poll(() => loginHeaders['referer'], { timeout: 15_000 }).toBeDefined();

  // The origin the form came from, and nothing after it.
  expect(loginHeaders['referer']).toBe(`${origin}/`);
});
