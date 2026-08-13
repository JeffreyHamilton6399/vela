import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { ACCEL, launchVela } from './launch-app.js';

/**
 * The first click on a sidebar tool, on a window that has never opened one.
 *
 * Its own spec file because that is the only way to test it: the sidebar is a
 * lazily imported chunk, and once any other spec has opened it the import is
 * resolved and the interesting moment cannot happen again. A fresh app is the
 * fixture.
 *
 * What went wrong here was a single Suspense boundary wrapped around the whole
 * window. React hides everything inside a boundary while anything in it is
 * loading, so clicking Notes took the rail, the page region and the page view
 * with it: the region measured 0×0, main dutifully resized the page to nothing,
 * and the window went blank until the chunk landed. Every assertion below is
 * about the window staying a window while it waits.
 */
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

const SAMPLE_MS = 1500;

function regionWidth(page: Page): Promise<number> {
  return page.evaluate(
    () => document.querySelector('[data-content-region]')?.getBoundingClientRect().width ?? 0,
  );
}

/**
 * The narrowest the rail or the page region gets over the next second and a
 * half, sampled on a wall clock.
 *
 * Sampled rather than asserted afterwards: the failure is a gap that closes on
 * its own, so a single measurement taken once the chunk has landed passes on the
 * broken build too. `setTimeout` rather than `requestAnimationFrame` because an
 * occluded window on a busy machine stops painting and a test must not hang on
 * that — geometry is readable either way.
 */
function narrowestFrame(page: Page): Promise<number> {
  return page.evaluate(async (ms) => {
    const width = (selector: string): number =>
      document.querySelector(selector)?.getBoundingClientRect().width ?? 0;

    let narrowest = Number.POSITIVE_INFINITY;
    const deadline = performance.now() + ms;
    while (performance.now() < deadline) {
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      narrowest = Math.min(
        narrowest,
        width('[data-content-region]'),
        width('nav[aria-label="Workspaces and tools"]'),
      );
    }
    return narrowest;
  }, SAMPLE_MS);
}

test('the first click on Notes never blanks the window', async () => {
  const before = await regionWidth(chrome);
  expect(before).toBeGreaterThan(0);

  // Started first, so the sampling is already running when the click lands.
  const watching = narrowestFrame(chrome);
  await chrome.getByRole('button', { name: 'Notes' }).click();

  // Zero is the bug: the rail or the page region left the layout while the
  // sidebar's chunk was in flight.
  expect(await watching).toBeGreaterThan(0);

  // And the click did what it was for.
  await expect(chrome.getByRole('textbox', { name: 'Notes' })).toBeVisible();
  await expect.poll(async () => regionWidth(chrome)).toBeLessThan(before);
});

test('the page view is not left resized to nothing', async () => {
  // The visible half of the same bug: insets measured from a hidden region read
  // as "the page fills the window", and the page was resized to fit nothing.
  const bounds = await app.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();
    const view = window?.contentView.children[0];
    return view === undefined ? null : view.getBounds();
  });

  expect(bounds?.width ?? 0).toBeGreaterThan(0);
  expect(bounds?.height ?? 0).toBeGreaterThan(0);
});

test('opening settings for the first time does not blank it either', async () => {
  await chrome.keyboard.press(`${ACCEL}+b`); // close the sidebar
  await expect(chrome.getByRole('complementary', { name: 'Sidebar tools' })).toBeHidden();

  const watching = narrowestFrame(chrome);
  await chrome.keyboard.press(`${ACCEL}+,`);

  expect(await watching).toBeGreaterThan(0);
  await expect(chrome.getByRole('heading', { name: 'Settings' })).toBeVisible();
});
