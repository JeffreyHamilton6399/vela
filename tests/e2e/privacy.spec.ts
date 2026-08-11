import { readdir, stat } from 'node:fs/promises';
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

interface Bridge {
  window: { openPrivate: () => void };
  tabs: {
    getState: () => Promise<{
      tabs: unknown[];
      activeTabId: string | null;
      privateSession: boolean;
    }>;
    create: (options: { url: string }) => void;
  };
  privacy: {
    getReport: () => Promise<{
      privateSession: boolean;
      userAgent: string;
      updateFeedUrl: string;
      settingsPath: string;
    }>;
  };
}

/** Every file under a directory, with its size and mtime. */
async function snapshotTree(root: string): Promise<Map<string, string>> {
  const seen = new Map<string, string>();

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        try {
          const info = await stat(full);
          seen.set(full, `${String(info.size)}:${String(info.mtimeMs)}`);
        } catch {
          /* raced with the app; ignore */
        }
      }
    }
  }

  await walk(root);
  return seen;
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

test('the normal window reports a non-private session', async () => {
  const report = await chrome.evaluate(() => {
    return (globalThis as unknown as { vela: Bridge }).vela.privacy.getReport();
  });

  expect(report.privateSession).toBe(false);
  expect(report.updateFeedUrl).toMatch(/^https:\/\/api\.github\.com\//);
});

test('every install sends the same user agent, naming neither Vela nor Electron', async () => {
  const { userAgent } = await chrome.evaluate(() =>
    (globalThis as unknown as { vela: Bridge }).vela.privacy.getReport(),
  );

  expect(userAgent.toLowerCase()).not.toContain('vela');
  expect(userAgent.toLowerCase()).not.toContain('electron');
  expect(userAgent).toMatch(/^Mozilla\/5\.0 \(.+\) AppleWebKit\/537\.36 .+ Safari\/537\.36$/);
});

test('a private window browses without writing anything to disk', async () => {
  const partitionsDir = await app.evaluate(({ app: electronApp }) =>
    electronApp.getPath('userData'),
  );

  const before = await snapshotTree(path.join(partitionsDir, 'Partitions'));

  await chrome.evaluate(() => {
    (globalThis as unknown as { vela: Bridge }).vela.window.openPrivate();
  });

  const windows = app.windows();
  await expect
    .poll(() => app.windows().length, { timeout: 15_000 })
    .toBeGreaterThan(windows.length);

  const privateWindow = app.windows().at(-1);
  expect(privateWindow).toBeDefined();
  if (privateWindow === undefined) return;

  await privateWindow.waitForSelector('[role="tablist"]');

  const state = await privateWindow.evaluate(() =>
    (globalThis as unknown as { vela: Bridge }).vela.tabs.getState(),
  );
  expect(state.privateSession).toBe(true);

  // Browse in it, and give the session every chance to flush something.
  await privateWindow.evaluate((url) => {
    (globalThis as unknown as { vela: Bridge }).vela.tabs.create({ url });
  }, FIXTURE_URL);
  await expect
    .poll(
      async () =>
        app.evaluate(({ webContents }) => webContents.getAllWebContents().map((wc) => wc.getURL())),
      { timeout: 15_000 },
    )
    .toContain(FIXTURE_URL);
  await privateWindow.waitForTimeout(1500);

  const after = await snapshotTree(path.join(partitionsDir, 'Partitions'));

  // A memory-only partition never creates a directory on disk in the first
  // place, so nothing under Partitions/ may appear or change.
  const added = [...after.keys()].filter((file) => !before.has(file));
  const changed = [...after.entries()].filter(
    ([file, fingerprint]) => before.has(file) && before.get(file) !== fingerprint,
  );

  expect(added, `private session wrote new files: ${added.join(', ')}`).toEqual([]);
  expect(changed.map(([file]) => file)).toEqual([]);
});

test('blocks ad and tracker requests, and counts them per page', async () => {
  const trackerPage = pathToFileURL(
    path.join(PROJECT_ROOT, 'tests', 'e2e', 'fixtures', 'trackers.html'),
  ).href;

  await chrome.evaluate((url) => {
    (globalThis as unknown as { vela: Bridge }).vela.tabs.create({ url });
  }, trackerPage);

  await expect
    .poll(
      async () => {
        const state = await chrome.evaluate(() =>
          (globalThis as unknown as { vela: Bridge }).vela.tabs.getState(),
        );
        const active = state.tabs.find(
          (tab) => (tab as { id: string }).id === state.activeTabId,
        ) as { blockedCount?: number } | undefined;
        return active?.blockedCount ?? 0;
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);

  await expect(chrome.getByRole('button', { name: /trackers blocked/i })).toBeVisible();
});

test('the private window says so in its chrome', async () => {
  let badge: string | null = null;

  for (const window of app.windows()) {
    // Page targets include the tab WebContentsViews, which have no bridge —
    // that they do not is itself the point of the sandbox.
    const isPrivateChrome = await window.evaluate(() => {
      const bridge = (globalThis as { vela?: Bridge }).vela;
      if (bridge === undefined) return null;
      return bridge.tabs.getState().then((state) => state.privateSession);
    });

    if (isPrivateChrome !== true) continue;
    badge = await window.locator('header').innerText();
  }

  expect(badge, 'no private window found').not.toBeNull();
  expect(badge?.toLowerCase()).toContain('private');
});
