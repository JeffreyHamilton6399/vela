import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchVela } from './launch-app.js';

const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const FIXTURE_URL = pathToFileURL(
  path.join(PROJECT_ROOT, 'tests', 'e2e', 'fixtures', 'page.html'),
).href;

interface TabState {
  id: string;
  suspended: boolean;
  workspaceId: string;
}

interface State {
  tabs: TabState[];
  activeTabId: string | null;
  activeWorkspaceId: string;
  workspaces: { id: string; name: string; tabCount: number }[];
}

interface Bridge {
  tabs: { getState: () => Promise<State>; create: (options: { url: string }) => void };
  workspaces: {
    create: (name: string) => void;
    activate: (id: string) => void;
    remove: (id: string) => void;
    moveTab: (id: string, workspaceId: string) => void;
  };
}

let app: ElectronApplication;
let closeApp: () => Promise<void>;
let chrome: Page;

const state = async (): Promise<State> =>
  chrome.evaluate(() => (globalThis as unknown as { vela: Bridge }).vela.tabs.getState());

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

test('starts with a single default workspace', async () => {
  const current = await state();
  expect(current.workspaces).toHaveLength(1);
  expect(current.activeWorkspaceId).toBe(current.workspaces[0]?.id);
});

test('a new workspace starts empty and becomes active', async () => {
  await chrome.evaluate((url) => {
    (globalThis as unknown as { vela: Bridge }).vela.tabs.create({ url });
  }, FIXTURE_URL);
  await expect.poll(async () => (await state()).tabs.length).toBe(2);

  await chrome.evaluate(() => {
    (globalThis as unknown as { vela: Bridge }).vela.workspaces.create('Research');
  });

  await expect.poll(async () => (await state()).workspaces.length).toBe(2);

  const current = await state();
  const active = current.workspaces.find((w) => w.id === current.activeWorkspaceId);
  expect(active?.name).toBe('Research');
  // A fresh workspace gets its own new tab, not the other workspace's tabs.
  expect(current.tabs).toHaveLength(1);
});

test('the tab strip only shows the active workspace', async () => {
  await expect(chrome.getByRole('tab')).toHaveCount(1);

  const current = await state();
  const other = current.workspaces.find((w) => w.id !== current.activeWorkspaceId);
  expect(other?.tabCount).toBe(2);
});

test('leaving a workspace suspends the tabs left behind', async () => {
  const before = await state();
  const other = before.workspaces.find((w) => w.id !== before.activeWorkspaceId);
  expect(other).toBeDefined();

  await chrome.evaluate((id) => {
    (globalThis as unknown as { vela: Bridge }).vela.workspaces.activate(id);
  }, other?.id ?? '');

  await expect.poll(async () => (await state()).tabs.length).toBe(2);

  const after = await state();
  // The active tab is live; the other one gave its renderer process back.
  const suspended = after.tabs.filter((tab) => tab.suspended);
  expect(suspended.length).toBeGreaterThan(0);
  expect(after.tabs.find((tab) => tab.id === after.activeTabId)?.suspended).toBe(false);
});

test('opening a suspended tab brings it back', async () => {
  const current = await state();
  const sleeping = current.tabs.find((tab) => tab.suspended);
  expect(sleeping).toBeDefined();

  await chrome.locator(`[data-tab-id="${sleeping?.id ?? ''}"]`).click();

  await expect
    .poll(async () => (await state()).tabs.find((tab) => tab.id === sleeping?.id)?.suspended)
    .toBe(false);
});

test('deleting a workspace takes its tabs with it', async () => {
  const before = await state();
  const doomed = before.workspaces.find((w) => w.id !== before.activeWorkspaceId);
  expect(doomed).toBeDefined();

  await chrome.evaluate((id) => {
    (globalThis as unknown as { vela: Bridge }).vela.workspaces.remove(id);
  }, doomed?.id ?? '');

  await expect.poll(async () => (await state()).workspaces.length).toBe(1);
});

test('the last workspace cannot be deleted', async () => {
  const before = await state();
  await chrome.evaluate((id) => {
    (globalThis as unknown as { vela: Bridge }).vela.workspaces.remove(id);
  }, before.activeWorkspaceId);

  const after = await state();
  expect(after.workspaces).toHaveLength(1);
  expect(after.tabs.length).toBeGreaterThan(0);
});
