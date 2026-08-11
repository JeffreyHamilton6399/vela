import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchVela } from './launch-app.js';

const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const FIXTURE_URL = pathToFileURL(
  path.join(PROJECT_ROOT, 'tests', 'e2e', 'fixtures', 'page.html'),
).href;

let app: ElectronApplication;
let closeApp: () => Promise<void>;
let chrome: Page;

interface TabState {
  id: string;
  pinned: boolean;
  internal: string | null;
}

/** Reads tab state through the same bridge the UI uses. */
async function tabs(): Promise<{ tabs: TabState[]; activeTabId: string | null }> {
  return chrome.evaluate(() =>
    (
      globalThis as unknown as {
        vela: {
          tabs: { getState: () => Promise<{ tabs: TabState[]; activeTabId: string | null }> };
        };
      }
    ).vela.tabs.getState(),
  );
}

async function newTab(): Promise<void> {
  await chrome.getByRole('button', { name: 'Open new tab' }).click();
}

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

test('opens tabs and activates the newest', async () => {
  await newTab();
  await newTab();

  await expect(chrome.getByRole('tab')).toHaveCount(3);

  const state = await tabs();
  expect(state.activeTabId).toBe(state.tabs.at(-1)?.id);
});

test('the active tab is the only one marked selected', async () => {
  await expect(chrome.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
});

test('closes a tab from its close button', async () => {
  const before = await tabs();
  const target = before.tabs[0];
  expect(target).toBeDefined();

  await chrome.locator(`[data-tab-id="${target?.id ?? ''}"] button`).click();

  await expect(chrome.getByRole('tab')).toHaveCount(2);
  const after = await tabs();
  expect(after.tabs.map((tab) => tab.id)).not.toContain(target?.id);
});

test('reopens the last closed tab', async () => {
  // A real URL: the new tab page is not something worth "reopening".
  await chrome.evaluate((url) => {
    (globalThis as unknown as { vela: { tabs: { create: (o: object) => void } } }).vela.tabs.create(
      {
        url,
      },
    );
  }, FIXTURE_URL);
  await expect(chrome.getByRole('tab')).toHaveCount(3);

  const state = await tabs();
  const victim = state.activeTabId ?? '';
  await chrome.evaluate((id) => {
    (globalThis as unknown as { vela: { tabs: { close: (id: string) => void } } }).vela.tabs.close(
      id,
    );
  }, victim);
  await expect(chrome.getByRole('tab')).toHaveCount(2);

  await chrome.evaluate(() => {
    (
      globalThis as unknown as { vela: { tabs: { restoreClosed: () => void } } }
    ).vela.tabs.restoreClosed();
  });
  await expect(chrome.getByRole('tab')).toHaveCount(3);
});

test('pinning moves a tab to the front of the strip and shrinks it', async () => {
  const state = await tabs();
  const last = state.tabs.at(-1);
  expect(last).toBeDefined();

  await chrome.evaluate((id) => {
    (
      globalThis as unknown as {
        vela: { tabs: { setPinned: (id: string, pinned: boolean) => void } };
      }
    ).vela.tabs.setPinned(id, true);
  }, last?.id ?? '');

  const after = await tabs();
  expect(after.tabs[0]?.id).toBe(last?.id);
  expect(after.tabs[0]?.pinned).toBe(true);

  const pinnedWidth = await chrome
    .locator(`[data-tab-id="${last?.id ?? ''}"]`)
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(pinnedWidth).toBeLessThan(60);
});

test('reordering respects the pinned run', async () => {
  const before = await tabs();
  const loose = before.tabs.filter((tab) => !tab.pinned);
  const mover = loose.at(-1);
  expect(mover).toBeDefined();

  // Ask for slot 0, which belongs to the pinned run.
  await chrome.evaluate((id) => {
    (
      globalThis as unknown as { vela: { tabs: { move: (id: string, index: number) => void } } }
    ).vela.tabs.move(id, 0);
  }, mover?.id ?? '');

  const after = await tabs();
  expect(after.tabs[0]?.pinned).toBe(true);
  expect(after.tabs[1]?.id).toBe(mover?.id);
});

test('closing the last tab leaves a fresh new tab behind', async () => {
  const state = await tabs();
  for (const tab of state.tabs) {
    await chrome.evaluate((id) => {
      (
        globalThis as unknown as { vela: { tabs: { close: (id: string) => void } } }
      ).vela.tabs.close(id);
    }, tab.id);
  }

  await expect(chrome.getByRole('tab')).toHaveCount(1);
  const after = await tabs();
  expect(after.tabs[0]?.internal).toBe('newtab');
});
