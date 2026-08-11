import path from 'node:path';
import { BrowserWindow, app, ipcMain, nativeTheme, shell } from 'electron';
import { EVENT_CHANNELS, type AppInfo } from '../shared/types/ipc.js';
import { resolvePlatform } from '../shared/platform.js';
import { createWindowOptions, SURFACE } from './window-options.js';
import { registerWindowIpc, readWindowState } from './ipc/register-window-ipc.js';
import type { IpcContractError } from './ipc/contract-guard.js';

const PLATFORM = resolvePlatform(process.platform);
const IS_DEV = !app.isPackaged;

/** Build output root. Resolves identically in dev and inside the packaged asar. */
const OUT_DIR = path.join(app.getAppPath(), 'out');
const PRELOAD_PATH = path.join(OUT_DIR, 'preload', 'index.cjs');
const RENDERER_HTML = path.join(OUT_DIR, 'renderer', 'index.html');
const DEV_SERVER_URL = process.env['VELA_DEV_SERVER_URL'];

app.setName('Vela');

let mainWindow: BrowserWindow | null = null;

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
  return nativeTheme.shouldUseDarkColors ? SURFACE.dark : SURFACE.light;
}

/**
 * The chrome renderer draws UI only — it never navigates and never opens
 * windows. Anything that tries goes to the user's real browser instead.
 * (Web content gets its own WebContentsView in stage 2.)
 */
function lockDownChrome(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    const current = window.webContents.getURL();
    if (url !== current) {
      event.preventDefault();
    }
  });

  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
}

/** Pushes window state to the renderer so the titlebar can redraw. */
function broadcastWindowState(window: BrowserWindow): void {
  if (window.isDestroyed() || window.webContents.isDestroyed()) return;
  window.webContents.send(EVENT_CHANNELS.windowStateChanged, readWindowState(window));
}

function watchWindowState(window: BrowserWindow): void {
  const push = (): void => {
    broadcastWindowState(window);
  };

  window.on('maximize', push);
  window.on('unmaximize', push);
  window.on('minimize', push);
  window.on('restore', push);
  window.on('enter-full-screen', push);
  window.on('leave-full-screen', push);
  window.on('focus', push);
  window.on('blur', push);
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow(
    createWindowOptions({
      platform: PLATFORM,
      preloadPath: PRELOAD_PATH,
      backgroundColor: backgroundColor(),
    }),
  );

  lockDownChrome(window);
  watchWindowState(window);

  window.once('ready-to-show', () => {
    window.show();
  });
  window.on('closed', () => {
    mainWindow = null;
  });

  if (DEV_SERVER_URL !== undefined && DEV_SERVER_URL !== '') {
    void window.loadURL(DEV_SERVER_URL);
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    void window.loadFile(RENDERER_HTML);
  }

  return window;
}

function onIpcViolation(error: IpcContractError): void {
  // A violation means the renderer sent something the contract forbids.
  // In development that is a bug worth failing loudly on.
  console.error(error.message);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow === null) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(() => {
    registerWindowIpc({
      ipcMain,
      isTrustedSender: (event) =>
        mainWindow !== null && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents,
      onViolation: onIpcViolation,
      getWindow: () => mainWindow,
      getAppInfo,
    });

    nativeTheme.on('updated', () => {
      mainWindow?.setBackgroundColor(backgroundColor());
    });

    mainWindow = createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (PLATFORM !== 'darwin') {
      app.quit();
    }
  });
}
