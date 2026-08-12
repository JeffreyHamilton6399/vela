import { createServer, type Server } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchVela } from './launch-app.js';

interface Bridge {
  tabs: {
    create: (options: { url: string }) => void;
    activate: (id: string) => void;
    getState: () => Promise<{ tabs: { id: string }[]; activeTabId: string | null }>;
  };
  downloads: { list: () => Promise<{ id: string; filename: string; state: string }[]> };
}

let app: ElectronApplication;
let closeApp: () => Promise<void>;
let chrome: Page;
let server: Server;
let origin: string;

test.beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url?.startsWith('/file.txt') === true) {
      response
        .writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-disposition': 'attachment; filename="file.txt"',
        })
        .end('vela download fixture');
      return;
    }
    response
      .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      .end('<!doctype html><title>dl</title><body><a id="get" href="/file.txt">get</a></body>');
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  origin = `http://localhost:${String(typeof address === 'object' && address !== null ? address.port : 0)}`;

  const launched = await launchVela();
  app = launched.app;
  closeApp = launched.close;
  chrome = await app.firstWindow();
  await chrome.waitForSelector('[role="tablist"]');

  // Give every download a destination up front, so a native Save As dialog
  // cannot block the run. This is the test's own listener; whether the app
  // needs one of its own is exactly what is under test below.
  const into = mkdtempSync(path.join(tmpdir(), 'vela-dl-'));
  await app.evaluate(({ session }, directory) => {
    const counter = { fired: 0 };
    (globalThis as unknown as { __dl: typeof counter }).__dl = counter;
    session.defaultSession.on('will-download', (_event, item) => {
      counter.fired += 1;
      const separator = directory.includes('\\') ? '\\' : '/';
      item.setSavePath(`${directory}${separator}${item.getFilename()}`);
    });
    // A native path: Chromium validates the download target, and a Windows
    // path written with forward slashes is refused outright.
  }, into);
});

test.afterAll(async () => {
  await closeApp();
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
});

test('a download shows up in the downloads list', async () => {
  await chrome.evaluate((url) => {
    (window as unknown as { vela: Bridge }).vela.tabs.create({ url });
  }, `${origin}/file.txt`);

  // Did Chromium start a download at all, before asking why the list is empty?
  await expect
    .poll(
      async () =>
        app.evaluate(() => (globalThis as unknown as { __dl: { fired: number } }).__dl.fired),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);

  await expect
    .poll(
      async () =>
        chrome.evaluate(async () =>
          (await (window as unknown as { vela: Bridge }).vela.downloads.list()).map(
            (item) => item.filename,
          ),
        ),
      { timeout: 15_000 },
    )
    .toContain('file.txt');
});

test('it reaches a finished state rather than sitting at 0%', async () => {
  await expect
    .poll(
      async () =>
        chrome.evaluate(async () =>
          JSON.stringify(await (window as unknown as { vela: Bridge }).vela.downloads.list()),
        ),
      { timeout: 15_000 },
    )
    .toContain('"state":"completed"');
});

/**
 * Where the bubble is, in the only terms that matter.
 *
 * Everything Vela's React draws inside the content region is behind the page:
 * a `WebContentsView` always paints above the window's own web contents, which
 * is why the settings dialog and the palette hide the page while they are up.
 * The bubble cannot do that — it appears on its own — so it is its own view,
 * and this reads the native layout rather than the DOM to say so.
 */
async function bubbleLayout(): Promise<{
  found: boolean;
  fromRight: number;
  fromTop: number;
  aboveThePage: boolean;
} | null> {
  return app.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();
    if (window === undefined) return null;

    const children = window.contentView.children;
    const index = children.findIndex((child) => {
      // Only a WebContentsView has one, and only the bubble's is at #downloads.
      const contents = (child as { webContents?: { getURL: () => string } }).webContents;
      return contents?.getURL().includes('#downloads') === true;
    });
    if (index === -1) return { found: false, fromRight: -1, fromTop: -1, aboveThePage: false };

    const bounds = children[index]?.getBounds() ?? { x: 0, y: 0, width: 0, height: 0 };
    const [width = 0] = window.getContentSize();

    return {
      found: true,
      fromRight: width - (bounds.x + bounds.width),
      fromTop: bounds.y,
      aboveThePage: index === children.length - 1,
    };
  });
}

test('a finished download raises a bubble over the top right of the page', async () => {
  await expect.poll(async () => (await bubbleLayout())?.found, { timeout: 15_000 }).toBe(true);

  const layout = await bubbleLayout();
  expect(layout?.aboveThePage).toBe(true);
  // Tucked into the corner rather than centred or full width.
  expect(layout?.fromRight).toBeLessThan(40);
  expect(layout?.fromTop).toBeLessThan(200);
});

test('the bubble withdraws on its own, leaving the page uncovered', async () => {
  await expect.poll(async () => (await bubbleLayout())?.found, { timeout: 20_000 }).toBe(false);
});

test('the toolbar button opens and closes it again', async () => {
  const button = chrome.locator('button[aria-label^="Downloads"]');

  await button.click();
  await expect.poll(async () => (await bubbleLayout())?.found, { timeout: 10_000 }).toBe(true);

  await button.click();
  await expect.poll(async () => (await bubbleLayout())?.found, { timeout: 10_000 }).toBe(false);
});

/**
 * Child views stack in the order they were added, and attaching a tab's view
 * appends it — so a tab switch while the bubble is up would bury the bubble
 * under the page that just arrived unless it is put back on top.
 */
test('switching tabs does not bury it under the page', async () => {
  await chrome.locator('button[aria-label^="Downloads"]').click();
  await expect.poll(async () => (await bubbleLayout())?.found, { timeout: 10_000 }).toBe(true);

  await chrome.evaluate((url) => {
    (window as unknown as { vela: Bridge }).vela.tabs.create({ url });
  }, `${origin}/`);

  // Back to a tab that already had a view, which is the case that re-attaches.
  await chrome.evaluate(async () => {
    const { tabs } = (window as unknown as { vela: Bridge }).vela;
    const state = await tabs.getState();
    const first = state.tabs[0];
    if (first !== undefined) tabs.activate(first.id);
  });

  await expect
    .poll(async () => (await bubbleLayout())?.aboveThePage, { timeout: 10_000 })
    .toBe(true);
});
