import path from 'node:path';
import { BrowserWindow, app, ipcMain, nativeTheme, session } from 'electron';
import { EVENT_CHANNELS, type AppInfo, type UpdateState } from '../shared/types/ipc.js';
import { resolvePlatform } from '../shared/platform.js';
import { registerWindowIpc } from './ipc/register-window-ipc.js';
import { registerTabIpc } from './ipc/register-tab-ipc.js';
import { registerSettingsIpc } from './ipc/register-settings-ipc.js';
import type { IpcContractError } from './ipc/contract-guard.js';
import { popupTabMenu } from './menus/tab-menu.js';
import { loadBlocker, type BlockerHandle } from './privacy/adblock.js';
import { buildUserAgent, UPDATE_FEED_URL } from './privacy/policies.js';
import { clearBrowsingData } from './privacy/session-hardening.js';
import { SettingsStore } from './settings/store.js';
import { Updater } from './updates/updater.js';
import { FaviconCache } from './favicons/favicon-cache.js';
import { SURFACE } from './window-options.js';
import { VelaWindow } from './vela-window.js';

const PLATFORM = resolvePlatform(process.platform);
const IS_DEV = !app.isPackaged;

/** Build output root. Resolves identically in dev and inside the packaged asar. */
const APP_PATH = app.getAppPath();
const OUT_DIR = path.join(APP_PATH, 'out');
const PRELOAD_PATH = path.join(OUT_DIR, 'preload', 'index.cjs');
const RENDERER_HTML = path.join(OUT_DIR, 'renderer', 'index.html');
/**
 * Where the shipped ad/tracker engine lives. In a packaged build `extraResources`
 * land beside the asar, not inside it, so this is `process.resourcesPath` there
 * and the repo's own `resources/` directory in development.
 */
const RESOURCES_DIR = app.isPackaged ? process.resourcesPath : path.join(APP_PATH, 'resources');
const DEV_SERVER_URL = process.env['VELA_DEV_SERVER_URL'];

const USER_AGENT = buildUserAgent(PLATFORM, process.versions.chrome.split('.')[0] ?? '140');

app.setName('Vela');

// Lets the E2E suite run against a throwaway profile instead of the real one.
// Nothing reads this in a packaged build unless the user sets it themselves.
const USER_DATA_OVERRIDE = process.env['VELA_USER_DATA_DIR'];
if (USER_DATA_OVERRIDE !== undefined && USER_DATA_OVERRIDE !== '') {
  app.setPath('userData', USER_DATA_OVERRIDE);
}

const windows = new Map<number, VelaWindow>();
let settings: SettingsStore | null = null;
let blocker: BlockerHandle | null = null;
let favicons: FaviconCache | null = null;
let updater: Updater | null = null;

function getAppInfo(): AppInfo {
  return {
    name: 'Vela',
    version: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    platform: PLATFORM,
    isDev: IS_DEV,
  };
}

function backgroundColor(): string {
  const preference = settings?.current.theme ?? 'system';
  const dark = preference === 'system' ? nativeTheme.shouldUseDarkColors : preference === 'dark';
  return dark ? SURFACE.dark : SURFACE.light;
}

/** Resolves which window an IPC message came from. */
function windowFor(sender: unknown): VelaWindow | null {
  for (const window of windows.values()) {
    if (window.owns(sender)) return window;
  }
  return null;
}

function onUnexpectedRequest(url: string): void {
  // Vela makes exactly two kinds of request: pages the user navigated to and
  // the update check. Anything else is a bug, caught here in development
  // rather than after shipping.
  console.error(`[privacy] unexpected request from Vela itself: ${url}`);
}

function createWindow(options: { isPrivate: boolean }): VelaWindow {
  if (settings === null) throw new Error('settings store is not ready');

  const window = new VelaWindow({
    platform: PLATFORM,
    preloadPath: PRELOAD_PATH,
    rendererHtml: RENDERER_HTML,
    devServerUrl: DEV_SERVER_URL,
    backgroundColor: backgroundColor(),
    userAgent: USER_AGENT,
    isDev: IS_DEV,
    isPrivate: options.isPrivate,
    settings,
    blocker,
    favicons,
    onClosed: (closed) => windows.delete(closed.id),
    onUnexpectedRequest,
  });

  windows.set(window.id, window);
  return window;
}

/** Pushes update state to every open window. */
function broadcastUpdateState(state: UpdateState): void {
  for (const window of windows.values()) {
    window.send(EVENT_CHANNELS.updateStateChanged, state);
  }
}

function onIpcViolation(error: IpcContractError): void {
  console.error(error.message);
}

/** Honours the clear-on-exit toggle before the app goes away. */
async function clearOnExitIfRequested(): Promise<void> {
  if (settings?.current.clearOnExit !== true) return;
  await clearBrowsingData(session.defaultSession);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [first] = windows.values();
    if (first === undefined) return;
    if (first.window.isMinimized()) first.window.restore();
    first.window.focus();
  });

  void app.whenReady().then(async () => {
    settings = new SettingsStore();
    updater = new Updater({
      isEnabled: () => settings?.current.checkForUpdates ?? false,
      onStateChanged: (state) => {
        broadcastUpdateState(state);
      },
    });

    favicons = new FaviconCache(app.getPath('userData'), true);
    await favicons.load();
    blocker = await loadBlocker(RESOURCES_DIR);

    const guard = {
      ipcMain,
      isTrustedSender: (event: { readonly sender: unknown }) => windowFor(event.sender) !== null,
      onViolation: onIpcViolation,
    };

    registerWindowIpc({
      ...guard,
      getWindow: (sender) => windowFor(sender)?.window ?? null,
      getAppInfo,
      openPrivateWindow: () => {
        createWindow({ isPrivate: true });
      },
    });

    registerTabIpc({
      ...guard,
      getManager: (sender) => windowFor(sender)?.manager ?? null,
      popupTabMenu: (manager, id, sender) => {
        const owner = windowFor(sender);
        if (owner !== null) popupTabMenu(owner.window, manager, id);
      },
    });

    registerSettingsIpc({
      ...guard,
      getStore: () => settings,
      getReport: (sender) => {
        const owner = windowFor(sender);
        return {
          adblockEnabled: blocker !== null && (settings?.current.blockAdsAndTrackers ?? false),
          settingsPath: settings?.path ?? '',
          blockedThisWindow: owner?.blockedCount ?? 0,
          privateSession: owner?.isPrivate ?? false,
          updateFeedUrl: UPDATE_FEED_URL,
          userAgent: USER_AGENT,
        };
      },
      cachedFavicon: (url) => favicons?.get(url) ?? null,
      updater: {
        get current(): UpdateState {
          return updater?.current ?? { status: 'idle', version: null, message: null };
        },
        check: () => updater?.check(),
        download: () => updater?.download(),
        install: () => updater?.install(),
      },
      clearData: async (sender) => {
        const owner = windowFor(sender);
        if (owner === null) return false;
        await clearBrowsingData(owner.session);
        return true;
      },
    });

    nativeTheme.on('updated', () => {
      for (const window of windows.values()) {
        window.window.setBackgroundColor(backgroundColor());
      }
    });

    createWindow({ isPrivate: false });

    // One check, a few seconds after start, so it never competes with the
    // first paint. Nothing is downloaded unless the user asks.
    setTimeout(() => {
      updater?.check();
    }, 5000).unref();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow({ isPrivate: false });
    });
  });

  app.on('window-all-closed', () => {
    if (PLATFORM !== 'darwin') {
      void clearOnExitIfRequested().finally(() => {
        app.quit();
      });
    }
  });
}
