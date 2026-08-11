import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchVela, startFixtureServer, type FixtureServer } from './launch-app.js';

interface Bridge {
  settings: { set: (patch: Record<string, unknown>) => void };
  tabs: {
    getState: () => Promise<{
      tabs: { id: string; blockedCount: number }[];
      activeTabId: string | null;
    }>;
    create: (options: { url: string }) => void;
  };
}

let app: ElectronApplication;
let closeApp: () => Promise<void>;
let chrome: Page;
let fixtures: FixtureServer;

test.beforeAll(async () => {
  fixtures = await startFixtureServer();
  const launched = await launchVela();
  app = launched.app;
  closeApp = launched.close;
  chrome = await app.firstWindow();
  await chrome.waitForSelector('[role="tablist"]');
});

test.afterAll(async () => {
  await closeApp();
  await fixtures.close();
});

/**
 * Regression test for a real defect found in an ordinary session.
 *
 * Enabling blocking clears the adblocker's global cosmetic-filter IPC handlers
 * before re-registering them. The library returns early for a session it has
 * already set up, so a second `enableFor` on the same session used to strip the
 * handlers and never restore them — element hiding silently stopped working
 * after the first settings change, and every page logged
 * "No handler registered for '@ghostery/adblocker/inject-cosmetic-filters'".
 */
test('cosmetic filter handlers survive repeated settings changes', async () => {
  const handlersPresent = async (): Promise<boolean> =>
    app.evaluate(({ ipcMain }) =>
      // `handle` throws if a handler is already registered, which is exactly
      // the signal we want: present means blocking is still wired up.
      ['@ghostery/adblocker/inject-cosmetic-filters'].every((channel) => {
        try {
          ipcMain.handle(channel, () => null);
          ipcMain.removeHandler(channel);
          return false;
        } catch {
          return true;
        }
      }),
    );

  expect(await handlersPresent(), 'handlers missing before any change').toBe(true);

  // Toggling any unrelated setting used to be enough to break it.
  for (let round = 0; round < 3; round += 1) {
    await chrome.evaluate(
      (value) => {
        (globalThis as unknown as { vela: Bridge }).vela.settings.set({ showBookmarksBar: value });
      },
      round % 2 === 0,
    );
    await chrome.waitForTimeout(150);
  }

  expect(await handlersPresent(), 'handlers were stripped by a settings change').toBe(true);
});

test('requests are still blocked after those changes', async () => {
  await chrome.evaluate((url) => {
    (globalThis as unknown as { vela: Bridge }).vela.tabs.create({ url });
  }, `${fixtures.origin}/trackers.html`);

  await expect
    .poll(
      async () => {
        const state = await chrome.evaluate(() =>
          (globalThis as unknown as { vela: Bridge }).vela.tabs.getState(),
        );
        return state.tabs.find((tab) => tab.id === state.activeTabId)?.blockedCount ?? 0;
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
});
