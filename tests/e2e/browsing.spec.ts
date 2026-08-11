import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchVela } from './launch-app.js';

const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const FIXTURE_URL = pathToFileURL(
  path.join(PROJECT_ROOT, 'tests', 'e2e', 'fixtures', 'page.html'),
).href;

let app: ElectronApplication;
let closeApp: () => Promise<void>;
let chrome: Page;

/** URLs of every live `WebContentsView`, read from the main process. */
async function loadedUrls(): Promise<string[]> {
  return app.evaluate(({ webContents }) =>
    webContents.getAllWebContents().map((wc) => wc.getURL()),
  );
}

test.beforeAll(async () => {
  const launched = await launchVela();
  app = launched.app;
  closeApp = launched.close;
  chrome = await app.firstWindow();
  await chrome.waitForSelector('input[aria-label="Address and search"]');
});

test.afterAll(async () => {
  await closeApp();
});

test('opens on the new tab page with one tab', async () => {
  const state = await chrome.evaluate(() =>
    (
      globalThis as unknown as { vela: { tabs: { getState: () => Promise<unknown> } } }
    ).vela.tabs.getState(),
  );

  expect(state).toMatchObject({ tabs: [{ internal: 'newtab', pinned: false }] });
  await expect(chrome.getByRole('tab')).toHaveCount(1);
});

test('navigating the address bar loads a page into a WebContentsView', async () => {
  const address = chrome.locator('input[aria-label="Address and search"]');
  await address.click();
  await address.fill(FIXTURE_URL);
  await address.press('Enter');

  await expect.poll(loadedUrls, { timeout: 15_000 }).toContain(FIXTURE_URL);

  // The chrome renderer itself never navigated.
  const chromeUrl = chrome.url();
  expect(chromeUrl).not.toContain('fixtures/page.html');
});

test('the toolbar reflects navigation history', async () => {
  const back = chrome.getByRole('button', { name: 'Back' });
  await expect(back).toBeEnabled();
  await expect(chrome.getByRole('button', { name: 'Forward' })).toBeDisabled();

  await back.click();
  await expect(chrome.getByRole('button', { name: 'Forward' })).toBeEnabled({ timeout: 10_000 });
});

test('the address bar shows a readable URL, not the raw one', async () => {
  const address = chrome.locator('input[aria-label="Address and search"]');
  await chrome.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await expect(address).not.toHaveValue(/^https?:\/\//);
});
