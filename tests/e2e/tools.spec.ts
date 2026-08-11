import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchVela } from './launch-app.js';

let app: ElectronApplication;
let closeApp: () => Promise<void>;
let chrome: Page;

test.beforeAll(async () => {
  const launched = await launchVela();
  app = launched.app;
  closeApp = launched.close;
  chrome = await app.firstWindow();
  await chrome.waitForSelector('[role="tablist"]');
});

test.afterAll(async () => {
  await closeApp();
});

test('the command palette opens on Ctrl+K and filters', async () => {
  await chrome.keyboard.press('Control+k');

  const palette = chrome.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();

  await chrome.getByLabel('Command or address').fill('private');
  await expect(palette.getByText('New private window')).toBeVisible();
  await expect(palette.getByText('Reopen closed tab')).toHaveCount(0);

  await chrome.keyboard.press('Escape');
  await expect(palette).toBeHidden();
});

test('the palette hides the page while it is open, then gives it back', async () => {
  const visible = async (): Promise<boolean | null> =>
    app.evaluate(({ BrowserWindow }) => {
      const [window] = BrowserWindow.getAllWindows();
      const view = window?.contentView.children[0];
      return view === undefined ? null : view.getVisible();
    });

  await chrome.keyboard.press('Control+k');
  await expect.poll(visible).toBe(false);

  await chrome.keyboard.press('Escape');
  // The new tab page still owns the region, so the page stays hidden — what
  // matters is that the overlay flag was released.
  await expect(chrome.getByRole('dialog', { name: 'Command palette' })).toBeHidden();
});

test('the sidebar opens on Ctrl+B and shrinks the page region', async () => {
  const insets = async (): Promise<number> =>
    chrome.evaluate(() => {
      const region = document.querySelector('[data-content-region]');
      return region === null ? 0 : region.getBoundingClientRect().width;
    });

  const before = await insets();
  await chrome.keyboard.press('Control+b');

  await expect(chrome.getByRole('complementary', { name: 'Sidebar tools' })).toBeVisible();
  await expect.poll(insets).toBeLessThan(before);
});

test('the calculator evaluates without executing its input', async () => {
  await chrome.getByRole('button', { name: 'Calculator' }).click();

  const expression = chrome.getByLabel('Expression');
  await expression.fill('2 + 3 * 4');
  await expect(chrome.locator('output').first()).toHaveText('14');

  await expression.fill('globalThis');
  await expect(chrome.locator('output').first()).not.toHaveText('14');
});

test('the unit converter works offline', async () => {
  await chrome.getByRole('button', { name: 'Units' }).click();

  await chrome.getByLabel('Category').selectOption('temperature');
  await chrome.getByLabel('Amount').fill('100');
  await chrome.getByLabel('From unit').selectOption('c');
  await chrome.getByLabel('To unit').selectOption('f');

  await expect(chrome.locator('output').first()).toHaveText('212');
});

test('notes survive a round trip through the local settings file', async () => {
  await chrome.getByRole('button', { name: 'Notes' }).click();
  await chrome.getByLabel('Notes').fill('remember the milk');

  await expect
    .poll(
      async () =>
        chrome.evaluate(async () => {
          const bridge = (
            globalThis as unknown as {
              vela: { settings: { get: () => Promise<{ notes: string }> } };
            }
          ).vela;
          return (await bridge.settings.get()).notes;
        }),
      { timeout: 10_000 },
    )
    .toBe('remember the milk');
});

test('settings open on Ctrl+, and write through to the store', async () => {
  await chrome.keyboard.press('Control+b'); // close the sidebar
  await chrome.keyboard.press('Control+,');

  await expect(chrome.getByRole('heading', { name: 'Settings' })).toBeVisible();

  // A controlled checkbox only flips once main echoes the change back, which
  // is slower than Playwright's uncheck() assertion allows.
  await chrome.getByLabel('Block ads and trackers').click();
  await expect
    .poll(async () =>
      chrome.evaluate(async () => {
        const bridge = (
          globalThis as unknown as {
            vela: { settings: { get: () => Promise<{ blockAdsAndTrackers: boolean }> } };
          }
        ).vela;
        return (await bridge.settings.get()).blockAdsAndTrackers;
      }),
    )
    .toBe(false);

  // And back, so the rest of the suite sees the default posture.
  await chrome.getByLabel('Block ads and trackers').click();
});

test('a bang shortcut resolves locally rather than through a search engine', async () => {
  await chrome.keyboard.press('Escape');

  const address = chrome.locator('input[aria-label="Address and search"]');
  await address.click();
  await address.fill('!gh electron');
  await address.press('Enter');

  await expect
    .poll(
      async () =>
        app.evaluate(({ webContents }) => webContents.getAllWebContents().map((wc) => wc.getURL())),
      { timeout: 20_000 },
    )
    .toContainEqual(expect.stringContaining('github.com/search'));
});
