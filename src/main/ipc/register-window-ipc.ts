/**
 * Stage 1 channel registrations: app metadata and window controls.
 * Dependencies are injected so this whole module is unit-testable without
 * booting Electron.
 */
import {
  INVOKE_CHANNELS,
  SEND_CHANNELS,
  type AppInfo,
  type WindowState,
} from '../../shared/types/ipc.js';
import { handleInvoke, handleSend, type GuardOptions } from './contract-guard.js';

/** Structural subset of `BrowserWindow` used by the window channels. */
export interface WindowLike {
  isDestroyed(): boolean;
  isMaximized(): boolean;
  isMinimized(): boolean;
  isFullScreen(): boolean;
  isFocused(): boolean;
  minimize(): void;
  maximize(): void;
  unmaximize(): void;
  close(): void;
}

export interface WindowIpcDeps extends GuardOptions {
  getWindow: () => WindowLike | null;
  getAppInfo: () => AppInfo;
}

export function readWindowState(window: WindowLike | null): WindowState {
  if (window === null || window.isDestroyed()) {
    return { maximized: false, minimized: false, fullScreen: false, focused: false };
  }
  return {
    maximized: window.isMaximized(),
    minimized: window.isMinimized(),
    fullScreen: window.isFullScreen(),
    focused: window.isFocused(),
  };
}

/** Runs the action only when a live window is present. */
function withWindow(deps: WindowIpcDeps, action: (window: WindowLike) => void): () => void {
  return () => {
    const window = deps.getWindow();
    if (window !== null && !window.isDestroyed()) {
      action(window);
    }
  };
}

export function registerWindowIpc(deps: WindowIpcDeps): void {
  handleInvoke(deps, INVOKE_CHANNELS.appGetInfo, () => deps.getAppInfo());
  handleInvoke(deps, INVOKE_CHANNELS.windowGetState, () => readWindowState(deps.getWindow()));

  handleSend(
    deps,
    SEND_CHANNELS.windowMinimize,
    withWindow(deps, (window) => {
      window.minimize();
    }),
  );

  handleSend(
    deps,
    SEND_CHANNELS.windowToggleMaximize,
    withWindow(deps, (window) => {
      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }
    }),
  );

  handleSend(
    deps,
    SEND_CHANNELS.windowClose,
    withWindow(deps, (window) => {
      window.close();
    }),
  );
}
