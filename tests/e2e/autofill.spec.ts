import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchVela, startFixtureServer, type FixtureServer } from './launch-app.js';

interface Bridge {
  settings: { set: (patch: Record<string, unknown>) => void };
  account: {
    create: (email: string, masterPassword: string) => Promise<{ ok: boolean }>;
    save: (host: string, username: string, password: string) => Promise<{ ok: boolean }>;
  };
  tabs: {
    create: (options: { url: string }) => void;
    close: (id: string) => void;
    getState: () => Promise<{ tabs: { id: string; url: string }[] }>;
  };
}

const USERNAME = 'jeff@example.com';
// Full of characters that mean something to a regular-expression replacement,
// because the fill script embeds the credential into a string literal.
const PASSWORD = 'p$&ssw0rd!$1';

// One test at a time: they share a window, and each asserts on the login page
// the previous one closed.
test.describe.configure({ mode: 'serial' });

let app: ElectronApplication;
let closeApp: () => Promise<void>;
let chrome: Page;
let fixtures: FixtureServer;

interface Fields {
  username: string;
  password: string;
  search: string;
}

/** Reads the fixture's fields out of the tab, which is a WebContentsView. */
async function fieldValues(application: ElectronApplication): Promise<Fields | null> {
  return application.evaluate(async ({ webContents }) => {
    const page = webContents
      .getAllWebContents()
      .find((contents) => contents.getURL().includes('login.html'));
    if (page === undefined) return null;

    const read: unknown = await page.executeJavaScript(
      `({
         username: document.getElementById('username').value,
         password: document.getElementById('password').value,
         search: document.getElementById('search').value,
       })`,
      true,
    );
    return read as Fields;
  });
}

/** Opens the login fixture in a fresh tab and waits for it to be readable. */
async function openLoginPage(): Promise<void> {
  await chrome.evaluate((url) => {
    (window as unknown as { vela: Bridge }).vela.tabs.create({ url });
  }, `${fixtures.origin}/login.html`);

  await expect.poll(async () => fieldValues(app), { timeout: 15_000 }).not.toBeNull();
}

async function closeLoginTabs(): Promise<void> {
  await chrome.evaluate(async () => {
    const bridge = (window as unknown as { vela: Bridge }).vela;
    const state = await bridge.tabs.getState();
    for (const tab of state.tabs) {
      if (tab.url.includes('login.html')) bridge.tabs.close(tab.id);
    }
  });
  await expect.poll(async () => fieldValues(app), { timeout: 15_000 }).toBeNull();
}

test.beforeAll(async () => {
  fixtures = await startFixtureServer();
  const launched = await launchVela();
  app = launched.app;
  closeApp = launched.close;
  chrome = await app.firstWindow();
  await chrome.waitForSelector('[role="tablist"]');

  // A local account — creating it leaves the vault unlocked — holding one
  // credential for the fixture origin. `host` carries the port, which is what
  // a tab's URL reports.
  const host = new URL(fixtures.origin).host;
  await chrome.evaluate(
    async (saved: { host: string; username: string; password: string }) => {
      const bridge = (window as unknown as { vela: Bridge }).vela;
      await bridge.account.create('e2e@example.com', 'master-password');
      await bridge.account.save(saved.host, saved.username, saved.password);
    },
    { host, username: USERNAME, password: PASSWORD },
  );
});

test.afterAll(async () => {
  await closeApp();
  await fixtures.close();
});

test('fills a saved login as the page loads, and leaves the search box alone', async () => {
  await chrome.evaluate(() => {
    (window as unknown as { vela: Bridge }).vela.settings.set({ loginAutofill: 'fill' });
  });

  await openLoginPage();

  await expect
    .poll(async () => (await fieldValues(app))?.password, { timeout: 15_000 })
    .toBe(PASSWORD);

  const values = await fieldValues(app);
  expect(values?.username).toBe(USERNAME);
  // The search box sits outside the form and says nothing about being a
  // username, so it scores too low to be filled. If this ever fails, Vela is
  // typing the user's email into arbitrary text boxes.
  expect(values?.search).toBe('');

  await closeLoginTabs();
});

test('fills nothing when the setting is off', async () => {
  await chrome.evaluate(() => {
    (window as unknown as { vela: Bridge }).vela.settings.set({ loginAutofill: 'off' });
  });

  await openLoginPage();

  // The automatic fill would have happened by now if it were going to: the
  // page is loaded and readable. Give the script's own wait a moment anyway.
  await new Promise((resolve) => setTimeout(resolve, 1_500));

  const values = await fieldValues(app);
  expect(values?.username).toBe('');
  expect(values?.password).toBe('');

  await closeLoginTabs();
});

test('signs in for you when the setting says to', async () => {
  await chrome.evaluate(() => {
    (window as unknown as { vela: Bridge }).vela.settings.set({ loginAutofill: 'submit' });
  });

  await openLoginPage();

  // The fixture's form handler sets `__submitted` rather than navigating, so
  // the page stays put and the flag is readable.
  await expect
    .poll(
      async () =>
        app.evaluate(async ({ webContents }) => {
          const page = webContents
            .getAllWebContents()
            .find((contents) => contents.getURL().includes('login.html'));
          if (page === undefined) return false;
          const submitted: unknown = await page.executeJavaScript(
            'window.__submitted === true',
            true,
          );
          return submitted === true;
        }),
      { timeout: 15_000 },
    )
    .toBe(true);

  await closeLoginTabs();
});
