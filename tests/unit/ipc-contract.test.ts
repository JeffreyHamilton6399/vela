import { describe, expect, it } from 'vitest';
import {
  ALL_CHANNELS,
  EVENT_CHANNELS,
  INVOKE_CHANNELS,
  SEND_CHANNELS,
  appInfoSchema,
  eventContract,
  invokeContract,
  platformSchema,
  sendContract,
  windowStateSchema,
} from '../../src/shared/types/ipc.js';
import { resolvePlatform } from '../../src/shared/platform.js';

describe('channel registry', () => {
  it('has no duplicate channel names across the three kinds', () => {
    expect(new Set(ALL_CHANNELS).size).toBe(ALL_CHANNELS.length);
  });

  it('gives every declared channel a schema', () => {
    for (const channel of Object.values(INVOKE_CHANNELS)) {
      expect(invokeContract[channel]).toBeDefined();
    }
    for (const channel of Object.values(SEND_CHANNELS)) {
      expect(sendContract[channel]).toBeDefined();
    }
    for (const channel of Object.values(EVENT_CHANNELS)) {
      expect(eventContract[channel]).toBeDefined();
    }
  });

  it('namespaces every channel', () => {
    for (const channel of ALL_CHANNELS) {
      expect(channel).toMatch(/^[a-z]+:[a-z-]+$/);
    }
  });
});

describe('windowStateSchema', () => {
  it('accepts a complete state', () => {
    const state = { maximized: true, minimized: false, fullScreen: false, focused: true };
    expect(windowStateSchema.parse(state)).toEqual(state);
  });

  it('rejects wrong types and missing fields', () => {
    expect(windowStateSchema.safeParse({ maximized: 'yes' }).success).toBe(false);
    expect(windowStateSchema.safeParse({ maximized: true }).success).toBe(false);
    expect(windowStateSchema.safeParse(null).success).toBe(false);
    expect(windowStateSchema.safeParse(undefined).success).toBe(false);
  });
});

describe('appInfoSchema', () => {
  const valid = {
    name: 'Vela',
    version: '0.1.0',
    electronVersion: '40.0.0',
    chromeVersion: '140.0.0.0',
    platform: 'win32',
    isDev: true,
  };

  it('accepts app info from main', () => {
    expect(appInfoSchema.parse(valid)).toEqual(valid);
  });

  it('rejects a foreign app name', () => {
    expect(appInfoSchema.safeParse({ ...valid, name: 'Chrome' }).success).toBe(false);
  });

  it('rejects an empty version', () => {
    expect(appInfoSchema.safeParse({ ...valid, version: '' }).success).toBe(false);
  });
});

describe('platform', () => {
  it('accepts only the three shipped targets', () => {
    expect(platformSchema.safeParse('darwin').success).toBe(true);
    expect(platformSchema.safeParse('win32').success).toBe(true);
    expect(platformSchema.safeParse('linux').success).toBe(true);
    expect(platformSchema.safeParse('freebsd').success).toBe(false);
  });

  it('falls back to linux for anything else', () => {
    expect(resolvePlatform('freebsd')).toBe('linux');
    expect(resolvePlatform('aix')).toBe('linux');
    expect(resolvePlatform('darwin')).toBe('darwin');
  });
});
