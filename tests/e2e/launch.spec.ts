import { expect, test, type ElectronApplication } from '@playwright/test';
import { launchVela } from './launch-app.js';

let app: ElectronApplication;
let closeApp: () => Promise<void>;

test.beforeAll(async () => {
  const launched = await launchVela();
  app = launched.app;
  closeApp = launched.close;
});

test.afterAll(async () => {
  await closeApp();
});

test('the window launches and renders the chrome', async () => {
  const page = await app.firstWindow();
  await expect(page.getByRole('tablist', { name: 'Tabs' })).toBeVisible();
  await expect(page.locator('input[aria-label="Address and search"]')).toBeVisible();
});

test('the renderer has no Node access', async () => {
  const page = await app.firstWindow();

  const leaks = await page.evaluate(() => ({
    require: typeof Reflect.get(globalThis, 'require'),
    process: typeof Reflect.get(globalThis, 'process'),
    ipcRenderer: typeof Reflect.get(globalThis, 'ipcRenderer'),
  }));

  expect(leaks).toEqual({
    require: 'undefined',
    process: 'undefined',
    ipcRenderer: 'undefined',
  });
});

test('the preload bridge is the only surface exposed', async () => {
  const page = await app.firstWindow();

  const keys = await page.evaluate(() => Object.keys(Reflect.get(globalThis, 'vela') as object));
  expect(keys.sort()).toEqual([
    'app',
    'layout',
    'platform',
    'privacy',
    'settings',
    'speedDial',
    'tabs',
    'window',
    'workspaces',
  ]);
});

test('a typed IPC round trip works', async () => {
  const page = await app.firstWindow();

  const info = await page.evaluate(async () => {
    const bridge = Reflect.get(globalThis, 'vela') as {
      app: { getInfo: () => Promise<{ name: string; version: string }> };
    };
    return bridge.app.getInfo();
  });

  expect(info.name).toBe('Vela');
  expect(info.version).toMatch(/^\d+\.\d+\.\d+$/);
});

test('the chrome ships the locked-down production CSP', async () => {
  const page = await app.firstWindow();

  const policy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');

  expect(policy).toContain("default-src 'none'");
  expect(policy).toContain("connect-src 'none'");
  expect(policy).not.toContain('unsafe-eval');
});

test('exactly one window is open', async () => {
  const count = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  expect(count).toBe(1);
});
