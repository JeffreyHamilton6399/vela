import { createServer, type Server } from 'node:http';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchVela } from './launch-app.js';

interface Bridge {
  tabs: {
    create: (options: { url: string }) => void;
    getState: () => Promise<{ tabs: unknown[] }>;
  };
}

let app: ElectronApplication;
let closeApp: () => Promise<void>;
let chrome: Page;
let server: Server;
let origin: string;

/** Runs a script in the page currently showing `marker` in its URL. */
async function inPage(marker: string, source: string): Promise<unknown> {
  return app.evaluate(
    ({ webContents }, [needle, script]) => {
      const page = webContents
        .getAllWebContents()
        .find((contents) => contents.getURL().includes(needle));
      if (page === undefined) return null;
      return page.executeJavaScript(script) as unknown;
    },
    [marker, source] as const,
  );
}

test.beforeAll(async () => {
  server = createServer((request, response) => {
    response.setHeader('content-type', 'text/html; charset=utf-8');

    if (request.url?.startsWith('/authorize') === true) {
      // What an identity provider does at the end of the flow.
      response.end(
        `<!doctype html><title>authorize</title><body><script>
           try { window.opener.postMessage('vela-token', '*'); }
           catch { document.title = 'orphaned'; }
         </script></body>`,
      );
      return;
    }

    response.end(
      `<!doctype html><title>signin</title><body>
         <script>
           window.__received = [];
           window.addEventListener('message', (event) => {
             window.__received.push(String(event.data));
           });
         </script>
       </body>`,
    );
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
});

test.afterAll(async () => {
  await closeApp();
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
});

/**
 * The whole of a "Sign in with …" flow, which is the thing that used to be
 * impossible.
 *
 * Every one of those buttons calls `window.open` with window features, keeps
 * the handle it gets back, and waits for the popup to answer through
 * `window.opener`. Denying the open and putting the address in a tab instead
 * breaks both halves at once: the page is handed `null`, which every OAuth
 * client library reports as a blocked popup, and nothing can post back.
 */
test('a sized window.open is a real popup that can answer its opener', async () => {
  await chrome.evaluate((url) => {
    (window as unknown as { vela: Bridge }).vela.tabs.create({ url });
  }, `${origin}/signin`);

  await expect
    .poll(() => inPage('/signin', 'typeof window.__received'), { timeout: 15_000 })
    .toBe('object');

  await inPage(
    '/signin',
    `window.__popup = window.open('/authorize', 'oauth', 'width=500,height=600'); ''`,
  );

  // The page has to be given a window, not null.
  await expect
    .poll(() => inPage('/signin', 'String(window.__popup)'), { timeout: 15_000 })
    .toBe('[object Window]');

  // And the popup has to be able to talk back through window.opener.
  await expect
    .poll(() => inPage('/signin', 'JSON.stringify(window.__received)'), { timeout: 15_000 })
    .toBe('["vela-token"]');
});

/** The other half of Chrome's rule: no features means a tab, as before. */
test('a plain window.open still becomes a tab rather than a window', async () => {
  const before = await chrome.evaluate(
    async () => (await (window as unknown as { vela: Bridge }).vela.tabs.getState()).tabs.length,
  );

  await inPage('/signin', `window.open('/authorize'); ''`);

  await expect
    .poll(
      () =>
        chrome.evaluate(
          async () =>
            (await (window as unknown as { vela: Bridge }).vela.tabs.getState()).tabs.length,
        ),
      { timeout: 15_000 },
    )
    .toBe(before + 1);
});
