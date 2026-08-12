import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchVela, startFixtureServer, type FixtureServer } from './launch-app.js';

interface Bridge {
  tabs: {
    create: (options: { url: string }) => void;
    getState: () => Promise<{ tabs: { id: string; url: string }[] }>;
  };
}

let app: ElectronApplication;
let closeApp: () => Promise<void>;
let chrome: Page;
let fixtures: FixtureServer;

const order = async (): Promise<string[]> =>
  chrome.evaluate(async () => {
    const state = await (window as unknown as { vela: Bridge }).vela.tabs.getState();
    return state.tabs.map((tab) => tab.id);
  });

test.beforeAll(async () => {
  fixtures = await startFixtureServer();
  const launched = await launchVela();
  app = launched.app;
  closeApp = launched.close;
  chrome = await app.firstWindow();
  await chrome.waitForSelector('[role="tablist"]');

  for (const name of ['page.html', 'login.html', 'done.html']) {
    await chrome.evaluate((url) => {
      (window as unknown as { vela: Bridge }).vela.tabs.create({ url });
    }, `${fixtures.origin}/${name}`);
  }
  await expect.poll(async () => (await order()).length).toBeGreaterThanOrEqual(4);
});

test.afterAll(async () => {
  await closeApp();
  await fixtures.close();
});

/**
 * Drags with real pointer events rather than calling `tabs.move`, because the
 * gesture is the thing under test: the reorder is a consequence of it.
 */
test('dragging a tab across the strip reorders it', async () => {
  const before = await order();
  const first = before[0];
  const last = before[before.length - 1];
  expect(first).toBeDefined();
  expect(first).not.toBe(last);

  const source = chrome.locator(`[data-tab-id="${String(first)}"]`);
  const target = chrome.locator(`[data-tab-id="${String(last)}"]`);
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  expect(from).not.toBeNull();
  expect(to).not.toBeNull();
  if (from === null || to === null) return;

  await chrome.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await chrome.mouse.down();
  // In steps, so the gesture passes the drag threshold and crosses each slot
  // the way a hand would rather than teleporting.
  await chrome.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 24 });
  await chrome.mouse.up();

  await expect.poll(async () => (await order())[before.length - 1]).toBe(first);
});

test('a drag sends one message per slot crossed, not one per pointer event', async () => {
  const ids = await order();
  const first = ids[0];
  const last = ids[ids.length - 1];
  if (first === undefined || last === undefined || first === last) return;

  // The bridge is frozen, so count what a `tabs.move` produces instead: every
  // one comes back as a full browser-state push, which is the storm the strip
  // actually has to survive.
  await chrome.evaluate(() => {
    const counter = { pushes: 0 };
    (window as unknown as { __pushes: typeof counter }).__pushes = counter;
    (
      window as unknown as { vela: { tabs: { onStateChanged: (fn: () => void) => void } } }
    ).vela.tabs.onStateChanged(() => {
      counter.pushes += 1;
    });
  });

  const source = chrome.locator(`[data-tab-id="${first}"]`);
  const target = chrome.locator(`[data-tab-id="${last}"]`);
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (from === null || to === null) return;

  await chrome.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await chrome.mouse.down();
  await chrome.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 40 });
  await chrome.mouse.up();

  const pushes = await chrome.evaluate(
    () => (window as unknown as { __pushes: { pushes: number } }).__pushes.pushes,
  );

  // Forty pointer events crossing at most three slots. The old gesture sent a
  // move on every one of them, so this counted in the dozens; now a message
  // goes out only when the target slot actually changes.
  expect(pushes).toBeGreaterThan(0);
  expect(pushes).toBeLessThanOrEqual(ids.length);
});

test('the dragged tab is left in the strip, not stranded mid-air', async () => {
  // The drag writes `transform` straight to the node; dropping has to hand it
  // back. A tab still carrying an offset would sit visibly out of line.
  const stranded = await chrome.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-tab-id]')]
      .map((element) => element.style.transform)
      .filter((transform) => transform !== ''),
  );
  expect(stranded).toEqual([]);
});
