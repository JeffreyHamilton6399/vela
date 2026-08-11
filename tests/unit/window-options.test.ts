import { describe, expect, it } from 'vitest';
import {
  REQUIRED_WEB_PREFERENCES,
  TITLEBAR_HEIGHT,
  createWindowOptions,
  usesCustomWindowControls,
} from '../../src/main/window-options.js';
import type { Platform } from '../../src/shared/types/ipc.js';

const PLATFORMS: Platform[] = ['darwin', 'win32', 'linux'];

function optionsFor(platform: Platform): ReturnType<typeof createWindowOptions> {
  return createWindowOptions({
    platform,
    preloadPath: '/app/out/preload/index.cjs',
    iconPath: '/app/build/icon.png',
    backgroundColor: '#FAFAFA',
  });
}

describe('security flags', () => {
  it.each(PLATFORMS)('are non-negotiable on %s', (platform) => {
    const { webPreferences } = optionsFor(platform);

    expect(webPreferences?.contextIsolation).toBe(true);
    expect(webPreferences?.nodeIntegration).toBe(false);
    expect(webPreferences?.sandbox).toBe(true);
    expect(webPreferences?.webSecurity).toBe(true);
  });

  it('cannot be mutated at runtime', () => {
    expect(Object.isFrozen(REQUIRED_WEB_PREFERENCES)).toBe(true);
  });

  it.each(PLATFORMS)('carries the app icon on %s', (platform) => {
    expect(optionsFor(platform).icon).toBe('/app/build/icon.png');
  });

  it.each(PLATFORMS)('wires the preload bridge on %s', (platform) => {
    expect(optionsFor(platform).webPreferences?.preload).toBe('/app/out/preload/index.cjs');
  });
});

describe('frameless chrome', () => {
  it('keeps native traffic lights on macOS', () => {
    const options = optionsFor('darwin');
    expect(options.titleBarStyle).toBe('hiddenInset');
    expect(options.trafficLightPosition).toEqual({ x: 16, y: 12 });
    expect(options.frame).toBeUndefined();
    expect(usesCustomWindowControls('darwin')).toBe(false);
  });

  it.each(['win32', 'linux'] as const)('is fully frameless on %s', (platform) => {
    const options = optionsFor(platform);
    expect(options.frame).toBe(false);
    expect(options.titleBarStyle).toBeUndefined();
    expect(usesCustomWindowControls(platform)).toBe(true);
  });
});

describe('window defaults', () => {
  it.each(PLATFORMS)('starts hidden on %s to avoid a paint flash', (platform) => {
    expect(optionsFor(platform).show).toBe(false);
  });

  it('applies the caller-resolved background colour', () => {
    expect(optionsFor('win32').backgroundColor).toBe('#FAFAFA');
  });

  it('keeps the titlebar on the 8px grid', () => {
    expect(TITLEBAR_HEIGHT % 8).toBe(0);
  });
});
