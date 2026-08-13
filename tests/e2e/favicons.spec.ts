import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchVela, startFixtureServer, type FixtureServer } from './launch-app.js';

/**
 * Favicons in the formats the web actually uses.
 *
 * `nativeImage.createFromBuffer` reads PNG and JPEG and returns empty for
 * everything else, so an SVG or an ICO favicon — which is most of them — used to
 * be dropped and the tab showed the first letter of the host instead. Measured
 * on ten ordinary sites, six had no icon in Vela and all ten have one in Chrome.
 *
 * The fix hands what nativeImage refuses to Chromium, in a renderer with nothing
 * else in it, and caches the PNG that comes back — so what this spec checks is
 * that an SVG goes in and a locally cached PNG comes out.
 */
let app: ElectronApplication;
let closeApp: () => Promise<void>;
let chrome: Page;
let server: FixtureServer;

test.beforeAll(async () => {
  server = await startFixtureServer();
  const launched = await launchVela();
  app = launched.app;
  closeApp = launched.close;
  chrome = await app.firstWindow();
  await chrome.waitForSelector('[role="tablist"]');
});

test.afterAll(async () => {
  await closeApp();
  await server.close();
});

/** The active tab's icon, as the tab strip would draw it. */
async function activeIcon(): Promise<string | null> {
  return chrome.evaluate(async () => {
    const bridge = (
      globalThis as unknown as {
        vela: {
          tabs: {
            getState: () => Promise<{
              activeTabId: string;
              tabs: { id: string; faviconUrl: string | null }[];
            }>;
          };
        };
      }
    ).vela;
    const state = await bridge.tabs.getState();
    return state.tabs.find((tab) => tab.id === state.activeTabId)?.faviconUrl ?? null;
  });
}

test('an SVG favicon reaches the tab strip as a cached PNG', async () => {
  await chrome.evaluate(async (url) => {
    const bridge = (
      globalThis as unknown as {
        vela: {
          tabs: {
            getState: () => Promise<{ activeTabId: string }>;
            navigate: (id: string, url: string) => void;
          };
        };
      }
    ).vela;
    const state = await bridge.tabs.getState();
    bridge.tabs.navigate(state.activeTabId, url);
  }, `${server.origin}/svg-icon.html`);

  // A data URL, never a remote one: the chrome renderer's CSP is
  // `img-src 'self' data:`, so a URL that had not been cached could not be drawn
  // even if it arrived.
  await expect.poll(activeIcon, { timeout: 15_000 }).toMatch(/^data:image\/png;base64,/);
});
