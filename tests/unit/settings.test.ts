import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  settingsPatchSchema,
  settingsSchema,
} from '../../src/shared/settings.js';

describe('settings defaults', () => {
  it('defaults every privacy choice to the private one', () => {
    expect(DEFAULT_SETTINGS.blockAdsAndTrackers).toBe(true);
    expect(DEFAULT_SETTINGS.forceHttps).toBe(true);
    expect(DEFAULT_SETTINGS.stripCrossOriginReferer).toBe(true);
    expect(DEFAULT_SETTINGS.httpAllowlist).toEqual([]);
  });

  it('defaults search to DuckDuckGo', () => {
    expect(DEFAULT_SETTINGS.searchEngineId).toBe('duckduckgo');
  });

  it('fills in a completely empty file', () => {
    expect(settingsSchema.parse({})).toEqual(DEFAULT_SETTINGS);
  });
});

describe('settings validation', () => {
  it('rejects a nonsense theme rather than storing it', () => {
    expect(settingsSchema.safeParse({ theme: 'neon' }).success).toBe(false);
  });

  it('keeps the suspension window inside sane bounds', () => {
    expect(settingsSchema.safeParse({ suspendAfterMinutes: 0 }).success).toBe(false);
    expect(settingsSchema.safeParse({ suspendAfterMinutes: 999 }).success).toBe(false);
    expect(settingsSchema.parse({ suspendAfterMinutes: 15 }).suspendAfterMinutes).toBe(15);
  });

  it('drops unknown keys instead of persisting them', () => {
    const parsed = settingsSchema.parse({ trackingId: 'abc123', theme: 'dark' });
    expect(parsed).not.toHaveProperty('trackingId');
    expect(parsed.theme).toBe('dark');
  });

  it('validates speed dial tiles', () => {
    const good = { id: 'a', title: 'Example', url: 'https://example.com', icon: null };
    expect(settingsSchema.parse({ speedDial: [good] }).speedDial).toEqual([good]);
    expect(settingsSchema.safeParse({ speedDial: [{ id: 'a' }] }).success).toBe(false);
  });
});

describe('settings patch', () => {
  it('accepts the panel-editable subset', () => {
    const patch = settingsPatchSchema.parse({ theme: 'dark', clearOnExit: true });
    expect(patch).toEqual({ theme: 'dark', clearOnExit: true });
  });

  it('will not let the renderer rewrite the http allowlist directly', () => {
    const patch = settingsPatchSchema.parse({ httpAllowlist: ['evil.example'] });
    expect(patch).not.toHaveProperty('httpAllowlist');
  });

  it('will not let the renderer inject speed dial tiles through a settings write', () => {
    const patch = settingsPatchSchema.parse({
      speedDial: [{ id: 'x', title: '', url: '', icon: null }],
    });
    expect(patch).not.toHaveProperty('speedDial');
  });
});
