import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchVela, startFixtureServer, type FixtureServer } from './launch-app.js';

interface Bridge {
  settings: { get: () => Promise<{ webPanels: { id: string; title: string; url: string }[] }> };
  panels: { add: (url: string, title: string) => void; open: (id: string) => void };
}

let app: ElectronApplication;
let closeApp: () => Promise<void>;
let chrome: Page;
let fixtures: FixtureServer;

const settings = async (): Promise<{ webPanels: { id: string; title: string; url: string }[] }> =>
  chrome.evaluate(() => (globalThis as unknown as { vela: Bridge }).vela.settings.get());

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

test('a site can be docked into the sidebar from the rail', async () => {
  await chrome.getByRole('button', { name: 'Add a site to the sidebar' }).click();
  await chrome.getByRole('menuitem', { name: 'Any other site…' }).click();

  const field = chrome.getByLabel('Site address');
  await expect(field).toBeVisible();
  await field.fill(`${fixtures.origin}/page.html`);
  await field.press('Enter');

  await expect.poll(async () => (await settings()).webPanels.length).toBe(1);
});

test('opening the panel loads the site beside the page', async () => {
  const saved = (await settings()).webPanels[0];
  expect(saved).toBeDefined();

  // Driven through the rail, because opening a panel is renderer state as
  // well as a main-process view. The button appears once the settings change
  // has made its way back to the renderer.
  // Scoped to the rail: the sidebar list names the same panel.
  const railButton = chrome
    .getByRole('navigation', { name: 'Workspaces and tools' })
    .getByRole('button', { name: saved?.title ?? '' });
  await expect(railButton).toBeVisible({ timeout: 15_000 });
  await railButton.click();

  // The docked site is a real WebContentsView on the same hardened session.
  await expect
    .poll(
      async () =>
        app.evaluate(({ webContents }) => webContents.getAllWebContents().map((wc) => wc.getURL())),
      { timeout: 15_000 },
    )
    .toContainEqual(expect.stringContaining('/page.html'));

  await expect(chrome.getByRole('complementary', { name: 'Web panel' })).toBeVisible();
});

test('the panel view is positioned inside the sidebar, not over the page', async () => {
  const [panelBounds, sidebarBox] = await Promise.all([
    app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const views = window?.contentView.children ?? [];
      const last = views.at(-1);
      return last === undefined ? null : last.getBounds();
    }),
    chrome.getByRole('complementary', { name: 'Web panel' }).boundingBox(),
  ]);

  expect(panelBounds).not.toBeNull();
  expect(sidebarBox).not.toBeNull();
  if (panelBounds === null || sidebarBox === null) return;

  // Same column as the sidebar, within a pixel of rounding.
  expect(Math.abs(panelBounds.x - sidebarBox.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(panelBounds.width - sidebarBox.width)).toBeLessThanOrEqual(2);
});

test('a suggested site can be added straight from the menu', async () => {
  await chrome.getByRole('button', { name: 'Add a site to the sidebar' }).click();

  const suggestion = chrome.getByRole('menuitem', { name: 'Telegram' });
  await expect(suggestion).toBeVisible();
  await suggestion.click();

  await expect
    .poll(async () => (await settings()).webPanels.some((panel) => panel.title === 'Telegram'))
    .toBe(true);

  // Removed again, so the next test sees a single panel.
  const added = (await settings()).webPanels.find((panel) => panel.title === 'Telegram');
  await chrome.evaluate((id) => {
    (
      globalThis as unknown as { vela: { panels: { remove: (id: string) => void } } }
    ).vela.panels.remove(id);
  }, added?.id ?? '');
  await expect.poll(async () => (await settings()).webPanels.length).toBe(1);
});

test('removing a panel takes it off the rail', async () => {
  const saved = (await settings()).webPanels[0];

  await chrome.evaluate((id) => {
    (
      globalThis as unknown as { vela: { panels: { remove: (id: string) => void } } }
    ).vela.panels.remove(id);
  }, saved?.id ?? '');

  await expect.poll(async () => (await settings()).webPanels.length).toBe(0);
});
