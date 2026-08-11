import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchVela, startFixtureServer, type FixtureServer } from './launch-app.js';

interface Bridge {
  settings: { get: () => Promise<Record<string, unknown>> };
  tabs: {
    getState: () => Promise<{
      tabs: { id: string; zoomPercent: number }[];
      activeTabId: string | null;
      privateSession: boolean;
    }>;
    navigate: (id: string, input: string) => void;
  };
  history: { search: (query: string, limit?: number) => Promise<{ url: string }[]> };
}

test.describe('first run', () => {
  let app: ElectronApplication;
  let closeApp: () => Promise<void>;

  test.afterAll(async () => {
    await closeApp();
  });

  test('asks which search engine to use, then gets out of the way', async () => {
    const launched = await launchVela({ firstRun: true });
    app = launched.app;
    closeApp = launched.close;

    const chrome = await app.firstWindow();
    await expect(chrome.getByRole('heading', { name: 'Welcome to Vela' })).toBeVisible();

    // Google is offered alongside the private engines, and labelled honestly.
    await expect(chrome.getByRole('button', { name: /^Google/ })).toBeVisible();
    await chrome.getByRole('button', { name: /^Google/ }).click();
    await chrome.getByRole('button', { name: 'Start browsing' }).click();

    await expect(chrome.getByRole('heading', { name: 'Welcome to Vela' })).toBeHidden();

    const settings = await chrome.evaluate(() =>
      (globalThis as unknown as { vela: Bridge }).vela.settings.get(),
    );
    expect(settings['searchEngineId']).toBe('google');
    expect(settings['onboardingComplete']).toBe(true);
  });
});

test.describe('browser features', () => {
  let app: ElectronApplication;
  let closeApp: () => Promise<void>;
  let chrome: Page;
  let fixtures: FixtureServer;
  let fixtureUrl: string;

  const state = async (): Promise<Awaited<ReturnType<Bridge['tabs']['getState']>>> =>
    chrome.evaluate(() => (globalThis as unknown as { vela: Bridge }).vela.tabs.getState());

  const activeTab = async (): Promise<{ zoomPercent: number } | undefined> => {
    const current = await state();
    return current.tabs.find((tab) => tab.id === current.activeTabId);
  };

  test.beforeAll(async () => {
    fixtures = await startFixtureServer();
    fixtureUrl = `${fixtures.origin}/find.html`;

    const launched = await launchVela();
    app = launched.app;
    closeApp = launched.close;
    chrome = await app.firstWindow();
    await chrome.waitForSelector('[role="tablist"]');

    await chrome.evaluate((url) => {
      const current = (globalThis as unknown as { vela: Bridge }).vela;
      void current.tabs.getState().then((s) => {
        if (s.activeTabId !== null) current.tabs.navigate(s.activeTabId, url);
      });
    }, fixtureUrl);

    await expect
      .poll(async () =>
        app.evaluate(({ webContents }) => webContents.getAllWebContents().map((wc) => wc.getURL())),
      )
      .toContain(fixtureUrl);
  });

  test.afterAll(async () => {
    await closeApp();
    await fixtures.close();
  });

  test('zoom steps, sticks, and resets', async () => {
    await chrome.keyboard.press('Control+=');
    await expect.poll(async () => (await activeTab())?.zoomPercent).toBe(120);

    await chrome.keyboard.press('Control+=');
    await expect.poll(async () => (await activeTab())?.zoomPercent).toBe(144);

    // The zoom badge appears once the page is not at 100%.
    await expect(chrome.getByRole('button', { name: /Reset zoom/ })).toBeVisible();

    await chrome.keyboard.press('Control+0');
    await expect.poll(async () => (await activeTab())?.zoomPercent).toBe(100);
  });

  test('bookmarking a page puts it on the bookmarks bar', async () => {
    await chrome.getByRole('button', { name: 'Bookmark this page' }).click();

    const bar = chrome.getByRole('navigation', { name: 'Bookmarks' });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('button')).toHaveCount(1);

    // The star reflects that the page is saved, and un-saves it.
    await chrome.getByRole('button', { name: 'Remove bookmark' }).click();
    await expect(bar).toBeHidden();
  });

  test('history records the visit and the palette finds it', async () => {
    await expect
      .poll(
        async () =>
          chrome.evaluate(() =>
            (globalThis as unknown as { vela: Bridge }).vela.history.search('find', 5),
          ),
        { timeout: 10_000 },
      )
      .not.toHaveLength(0);
  });

  test('a private window is never recorded in history', async () => {
    const before = await chrome.evaluate(() =>
      (globalThis as unknown as { vela: Bridge }).vela.history.search('', 200),
    );

    await chrome.evaluate(() => {
      (
        globalThis as unknown as { vela: { window: { openPrivate: () => void } } }
      ).vela.window.openPrivate();
    });
    // Poll: the new window needs a moment before its bridge answers.
    const findPrivateWindow = async (): Promise<Page | undefined> => {
      for (const candidate of app.windows()) {
        const isPrivate = await candidate
          .evaluate(() => {
            const b = (globalThis as { vela?: Bridge }).vela;
            if (b === undefined) return null;
            return b.tabs.getState().then((s) => s.privateSession);
          })
          .catch(() => null);
        if (isPrivate === true) return candidate;
      }
      return undefined;
    };

    await expect
      .poll(async () => (await findPrivateWindow()) !== undefined, { timeout: 20_000 })
      .toBe(true);
    const privateWindow = await findPrivateWindow();
    await privateWindow?.evaluate((url) => {
      const current = (globalThis as unknown as { vela: Bridge }).vela;
      void current.tabs.getState().then((s) => {
        if (s.activeTabId !== null) current.tabs.navigate(s.activeTabId, url);
      });
    }, fixtureUrl);

    await privateWindow?.waitForTimeout(1500);

    const after = await chrome.evaluate(() =>
      (globalThis as unknown as { vela: Bridge }).vela.history.search('', 200),
    );
    expect(after).toHaveLength(before.length);
  });
});
