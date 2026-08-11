import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import type { IpcMainLike } from '../../src/main/ipc/contract-guard.js';
import { IpcContractError } from '../../src/main/ipc/contract-guard.js';
import {
  readWindowState,
  registerWindowIpc,
  type WindowLike,
} from '../../src/main/ipc/register-window-ipc.js';
import { INVOKE_CHANNELS, SEND_CHANNELS, type AppInfo } from '../../src/shared/types/ipc.js';

const TRUSTED_SENDER = { id: 'vela-chrome' };
const HOSTILE_SENDER = { id: 'somewhere-else' };

type InvokeHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;
type SendListener = (event: IpcMainEvent, ...args: unknown[]) => void;

class FakeIpcMain implements IpcMainLike {
  readonly invokeHandlers = new Map<string, InvokeHandler>();
  readonly sendListeners = new Map<string, SendListener>();

  handle(channel: string, listener: InvokeHandler): void {
    this.invokeHandlers.set(channel, listener);
  }

  on(channel: string, listener: SendListener): void {
    this.sendListeners.set(channel, listener);
  }

  invoke(channel: string, sender: object, ...args: unknown[]): Promise<unknown> {
    const handler = this.invokeHandlers.get(channel);
    if (handler === undefined) throw new Error(`no handler for ${channel}`);
    return Promise.resolve(handler({ sender } as unknown as IpcMainInvokeEvent, ...args));
  }

  emit(channel: string, sender: object, ...args: unknown[]): void {
    const listener = this.sendListeners.get(channel);
    if (listener === undefined) throw new Error(`no listener for ${channel}`);
    listener({ sender } as unknown as IpcMainEvent, ...args);
  }
}

function fakeWindow(overrides: Partial<WindowLike> = {}): WindowLike {
  return {
    isDestroyed: () => false,
    isMaximized: () => false,
    isMinimized: () => false,
    isFullScreen: () => false,
    isFocused: () => true,
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    close: vi.fn(),
    ...overrides,
  };
}

const APP_INFO: AppInfo = {
  name: 'Vela',
  version: '0.1.0',
  electronVersion: '40.0.0',
  chromeVersion: '140.0.0.0',
  platform: 'win32',
  isDev: true,
};

interface Harness {
  ipcMain: FakeIpcMain;
  violations: IpcContractError[];
  privateWindows: boolean[];
  window: WindowLike;
}

function setup(options: { window?: WindowLike | null; appInfo?: AppInfo } = {}): Harness {
  const ipcMain = new FakeIpcMain();
  const violations: IpcContractError[] = [];
  const privateWindows: boolean[] = [];
  const window = options.window === undefined ? fakeWindow() : options.window;

  registerWindowIpc({
    ipcMain,
    isTrustedSender: (event) => event.sender === TRUSTED_SENDER,
    onViolation: (error) => violations.push(error),
    getWindow: () => window,
    openPrivateWindow: () => {
      privateWindows.push(true);
    },
    getAppInfo: () => options.appInfo ?? APP_INFO,
  });

  return { ipcMain, violations, privateWindows, window: window ?? fakeWindow() };
}

describe('readWindowState', () => {
  it('reports a live window', () => {
    const state = readWindowState(fakeWindow({ isMaximized: () => true }));
    expect(state).toEqual({
      maximized: true,
      minimized: false,
      fullScreen: false,
      focused: true,
    });
  });

  it('reports an inert state when there is no window', () => {
    expect(readWindowState(null)).toEqual({
      maximized: false,
      minimized: false,
      fullScreen: false,
      focused: false,
    });
  });

  it('does not touch a destroyed window', () => {
    const isMaximized = vi.fn(() => true);
    readWindowState(fakeWindow({ isDestroyed: () => true, isMaximized }));
    expect(isMaximized).not.toHaveBeenCalled();
  });
});

describe('invoke channels', () => {
  it('returns validated app info', async () => {
    const { ipcMain } = setup();
    await expect(ipcMain.invoke(INVOKE_CHANNELS.appGetInfo, TRUSTED_SENDER)).resolves.toEqual(
      APP_INFO,
    );
  });

  it('returns the current window state', async () => {
    const { ipcMain } = setup({ window: fakeWindow({ isFullScreen: () => true }) });
    await expect(ipcMain.invoke(INVOKE_CHANNELS.windowGetState, TRUSTED_SENDER)).resolves.toEqual({
      maximized: false,
      minimized: false,
      fullScreen: true,
      focused: true,
    });
  });

  it('rejects an untrusted sender', async () => {
    const { ipcMain, violations } = setup();
    await expect(ipcMain.invoke(INVOKE_CHANNELS.appGetInfo, HOSTILE_SENDER)).rejects.toThrow(
      /untrusted sender/,
    );
    expect(violations).toHaveLength(1);
  });

  it('rejects unexpected arguments', async () => {
    const { ipcMain } = setup();
    await expect(
      ipcMain.invoke(INVOKE_CHANNELS.appGetInfo, TRUSTED_SENDER, 'a', 'b'),
    ).rejects.toThrow(/expected at most 1 argument/);
  });

  it('rejects a payload the schema does not allow', async () => {
    const { ipcMain } = setup();
    await expect(
      ipcMain.invoke(INVOKE_CHANNELS.windowGetState, TRUSTED_SENDER, { evil: true }),
    ).rejects.toThrow(/invalid request/);
  });

  it('rejects a malformed response from its own handler', async () => {
    const bad = { ...APP_INFO, version: '' };
    const { ipcMain } = setup({ appInfo: bad });
    await expect(ipcMain.invoke(INVOKE_CHANNELS.appGetInfo, TRUSTED_SENDER)).rejects.toThrow(
      /invalid response/,
    );
  });
});

describe('send channels', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = setup();
  });

  it('minimizes the window', () => {
    harness.ipcMain.emit(SEND_CHANNELS.windowMinimize, TRUSTED_SENDER);
    expect(harness.window.minimize).toHaveBeenCalledOnce();
  });

  it('closes the window', () => {
    harness.ipcMain.emit(SEND_CHANNELS.windowClose, TRUSTED_SENDER);
    expect(harness.window.close).toHaveBeenCalledOnce();
  });

  it('maximizes when restored', () => {
    harness.ipcMain.emit(SEND_CHANNELS.windowToggleMaximize, TRUSTED_SENDER);
    expect(harness.window.maximize).toHaveBeenCalledOnce();
    expect(harness.window.unmaximize).not.toHaveBeenCalled();
  });

  it('unmaximizes when maximized', () => {
    const window = fakeWindow({ isMaximized: () => true });
    const local = setup({ window });
    local.ipcMain.emit(SEND_CHANNELS.windowToggleMaximize, TRUSTED_SENDER);
    expect(window.unmaximize).toHaveBeenCalledOnce();
    expect(window.maximize).not.toHaveBeenCalled();
  });

  it('drops messages from an untrusted sender', () => {
    harness.ipcMain.emit(SEND_CHANNELS.windowClose, HOSTILE_SENDER);
    expect(harness.window.close).not.toHaveBeenCalled();
    expect(harness.violations).toHaveLength(1);
  });

  it('drops a message carrying an unexpected payload', () => {
    harness.ipcMain.emit(SEND_CHANNELS.windowMinimize, TRUSTED_SENDER, { spoof: 1 });
    expect(harness.window.minimize).not.toHaveBeenCalled();
    expect(harness.violations[0]).toBeInstanceOf(IpcContractError);
  });

  it('is a no-op when there is no window', () => {
    const local = setup({ window: null });
    expect(() => {
      local.ipcMain.emit(SEND_CHANNELS.windowClose, TRUSTED_SENDER);
    }).not.toThrow();
  });
});
