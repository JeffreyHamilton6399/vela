/**
 * Pure window configuration. No runtime electron import lives here on purpose,
 * so the security flags can be asserted by a plain unit test.
 */
import type { BrowserWindowConstructorOptions } from 'electron';
import type { Platform } from '../shared/types/ipc.js';

/** Height of the custom titlebar, in CSS px. 8px grid: 5 units. */
export const TITLEBAR_HEIGHT = 40;

export const WINDOW_DEFAULTS = {
  width: 1280,
  height: 800,
  minWidth: 640,
  minHeight: 480,
} as const;

/** Near-white / near-black. Painted before the renderer loads to avoid a flash. */
export const SURFACE = {
  light: '#FAFAFA',
  dark: '#0A0A0A',
} as const;

/**
 * The four flags in `webPreferences` that the master prompt marks
 * non-negotiable. Frozen so nothing downstream can quietly relax one.
 */
export const REQUIRED_WEB_PREFERENCES = Object.freeze({
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
} as const);

export interface WindowOptionsInput {
  platform: Platform;
  preloadPath: string;
  /** Resolved from the OS theme by the caller. */
  backgroundColor: string;
}

/**
 * macOS keeps its native traffic lights (inset into our custom titlebar);
 * Windows and Linux get a fully frameless window and draw their own controls.
 */
export function createWindowOptions(input: WindowOptionsInput): BrowserWindowConstructorOptions {
  const base: BrowserWindowConstructorOptions = {
    width: WINDOW_DEFAULTS.width,
    height: WINDOW_DEFAULTS.height,
    minWidth: WINDOW_DEFAULTS.minWidth,
    minHeight: WINDOW_DEFAULTS.minHeight,
    backgroundColor: input.backgroundColor,
    show: false,
    title: 'Vela',
    webPreferences: {
      ...REQUIRED_WEB_PREFERENCES,
      preload: input.preloadPath,
      spellcheck: false,
      // Cache compiled bytecode so a second launch skips the parse.
      v8CacheOptions: 'code',
    },
  };

  if (input.platform === 'darwin') {
    return {
      ...base,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 12 },
    };
  }

  return { ...base, frame: false };
}

/** True when the platform draws its own window buttons in the renderer. */
export function usesCustomWindowControls(platform: Platform): boolean {
  return platform !== 'darwin';
}
