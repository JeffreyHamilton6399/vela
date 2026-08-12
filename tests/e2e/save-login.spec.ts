import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchVela, startFixtureServer, type FixtureServer } from './launch-app.js';

interface Captured {
  id: string;
  host: string;
  username: string;
  replacing: boolean;
}

interface Bridge {
  settings: { set: (patch: Record<string, unknown>) => void };
  account: {
    create: (email: string, masterPassword: string) => Promise<{ ok: boolean }>;
    list: () => Promise<{ id: string; host: string; username: string }[]>;
    resolveCapture: (id: string, save: boolean) => Promise<{ ok: boolean }>;
    onCaptured: (listener: (captured: Captured | null) => void) => () => void;
  };
  tabs: {
    create: (options: { url: string }) => void;
    close: (id: string) => void;
    getState: () => Promise<{ tabs: { id: string; url: string }[] }>;
  };
}

const USERNAME = 'jeff@example.com';
const PASSWORD = 'p$&ssw0rd!$1';

test.describe.configure({ mode: 'serial' });

let app: ElectronApplication;
let closeApp: () => Promise<void>;
let chrome: Page;
let fixtures: FixtureServer;

/** Signs in on the fixture by typing, the way a person would. */
async function signInByHand(): Promise<void> {
  await chrome.evaluate((url) => {
    (window as unknown as { vela: Bridge }).vela.tabs.create({ url });
  }, `${fixtures.origin}/signin.html`);

  // Wait for the form, then type into it and submit — all inside the tab,
  // which is a WebContentsView rather than a Playwright page.
  await expect
    .poll(
      async () =>
        app.evaluate(async ({ webContents }) => {
          const page = webContents
            .getAllWebContents()
            .find((contents) => contents.getURL().includes('signin.html'));
          if (page === undefined) return false;
          const ready: unknown = await page.executeJavaScript(
            `document.getElementById('password') !== null`,
            true,
          );
          return ready === true;
        }),
      { timeout: 15_000 },
    )
    .toBe(true);

  await app.evaluate(
    async ({ webContents }, credential) => {
      const page = webContents
        .getAllWebContents()
        .find((contents) => contents.getURL().includes('signin.html'));
      if (page === undefined) return;
      await page.executeJavaScript(
        `(() => {
           const user = document.getElementById('username');
           const pass = document.getElementById('password');
           user.value = ${JSON.stringify(credential.username)};
           pass.value = ${JSON.stringify(credential.password)};
           user.dispatchEvent(new Event('input', { bubbles: true }));
           pass.dispatchEvent(new Event('input', { bubbles: true }));
           document.querySelector('button[type=submit]').click();
         })()`,
        true,
      );
    },
    { username: USERNAME, password: PASSWORD },
  );
}

/** The prompt Vela raised, as the chrome renderer received it. */
async function nextPrompt(): Promise<Captured | null> {
  return chrome.evaluate(
    async () =>
      new Promise<Captured | null>((resolve) => {
        const bridge = (window as unknown as { vela: Bridge }).vela;
        const stop = bridge.account.onCaptured((captured) => {
          stop();
          resolve(captured);
        });
        setTimeout(() => {
          stop();
          resolve(null);
        }, 15_000);
      }),
  );
}

test.beforeAll(async () => {
  fixtures = await startFixtureServer();
  const launched = await launchVela();
  app = launched.app;
  closeApp = launched.close;
  chrome = await app.firstWindow();
  await chrome.waitForSelector('[role="tablist"]');

  await chrome.evaluate(async () => {
    const bridge = (window as unknown as { vela: Bridge }).vela;
    bridge.settings.set({ offerToSaveLogins: true, loginAutofill: 'off' });
    // Creating the account leaves the vault unlocked. The vault starts empty,
    // so this is the "first time at this site" case.
    await bridge.account.create('e2e@example.com', 'master-password');
  });
});

test.afterAll(async () => {
  await closeApp();
  await fixtures.close();
});

test('offers to save a login typed on a site Vela knows nothing about', async () => {
  const prompt = nextPrompt();
  await signInByHand();

  const captured = await prompt;
  expect(captured).not.toBeNull();
  expect(captured?.username).toBe(USERNAME);
  expect(captured?.host).toBe(new URL(fixtures.origin).host);
  expect(captured?.replacing).toBe(false);

  // The prompt carries no password. It stayed in the main process, and the
  // renderer answers by id — this is the assertion that keeps it that way.
  expect(JSON.stringify(captured)).not.toContain(PASSWORD);
});

test('saying yes stores it, password and all', async () => {
  const prompt = nextPrompt();
  await signInByHand();
  const captured = await prompt;
  expect(captured).not.toBeNull();

  const saved = await chrome.evaluate(async (id: string) => {
    const bridge = (window as unknown as { vela: Bridge }).vela;
    await bridge.account.resolveCapture(id, true);
    return bridge.account.list();
  }, String(captured?.id));

  expect(saved).toHaveLength(1);
  expect(saved[0]?.username).toBe(USERNAME);
  expect(saved[0]?.host).toBe(new URL(fixtures.origin).host);
});

test('the stored password is the one that was typed', async () => {
  // Proved by filling it back into a fresh page: the vault never hands a
  // password to the renderer, so this is the honest way to read it.
  await chrome.evaluate((url) => {
    const bridge = (window as unknown as { vela: Bridge }).vela;
    bridge.settings.set({ loginAutofill: 'fill' });
    bridge.tabs.create({ url });
  }, `${fixtures.origin}/signin.html`);

  await expect
    .poll(
      async () =>
        app.evaluate(async ({ webContents }) => {
          const pages = webContents
            .getAllWebContents()
            .filter((contents) => contents.getURL().includes('signin.html'));
          const page = pages[pages.length - 1];
          if (page === undefined) return null;
          const value: unknown = await page.executeJavaScript(
            `document.getElementById('password') ? document.getElementById('password').value : null`,
            true,
          );
          return typeof value === 'string' ? value : null;
        }),
      { timeout: 15_000 },
    )
    .toBe(PASSWORD);
});

test('does not offer again for a login it already holds', async () => {
  const prompt = nextPrompt();
  await signInByHand();

  // Same host, same username, same password: there is nothing to tell the
  // user about, so no prompt should arrive at all.
  await expect(prompt).resolves.toBeNull();
});
