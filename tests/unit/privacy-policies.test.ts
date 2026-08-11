import { describe, expect, it } from 'vitest';
import {
  buildUserAgent,
  categorizeRequest,
  decideHttpsUpgrade,
  stripCrossOriginReferer,
  UPDATE_FEED_URL,
} from '../../src/main/privacy/policies.js';

describe('user agent', () => {
  it('is identical for every install on a platform', () => {
    expect(buildUserAgent('win32', '140')).toBe(buildUserAgent('win32', '140'));
  });

  it('does not name Vela — an unusual token is itself a fingerprint', () => {
    for (const platform of ['darwin', 'win32', 'linux']) {
      expect(buildUserAgent(platform, '140').toLowerCase()).not.toContain('vela');
      expect(buildUserAgent(platform, '140').toLowerCase()).not.toContain('electron');
    }
  });

  it('reports the platform it actually runs on', () => {
    expect(buildUserAgent('darwin', '140')).toContain('Macintosh');
    expect(buildUserAgent('win32', '140')).toContain('Windows NT');
    expect(buildUserAgent('linux', '140')).toContain('X11; Linux');
  });

  it('carries no build, install, or session identifier', () => {
    expect(buildUserAgent('win32', '140')).toBe(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    );
  });
});

describe('stripCrossOriginReferer', () => {
  it('removes a referer pointing at another origin', () => {
    const headers = { Referer: 'https://private.example/secret', Accept: '*/*' };
    expect(stripCrossOriginReferer(headers, 'https://tracker.example/pixel')).toEqual({
      Accept: '*/*',
    });
  });

  it('keeps a same-origin referer, which leaks nothing new', () => {
    const headers = { Referer: 'https://example.com/a', Accept: '*/*' };
    expect(stripCrossOriginReferer(headers, 'https://example.com/b')).toEqual(headers);
  });

  it('treats a scheme change as cross-origin', () => {
    const headers = { Referer: 'https://example.com/a' };
    expect(stripCrossOriginReferer(headers, 'http://example.com/b')).toEqual({});
  });

  it('matches the header name case-insensitively', () => {
    expect(
      stripCrossOriginReferer({ referer: 'https://a.example/' }, 'https://b.example/'),
    ).toEqual({});
  });

  it('leaves headers alone when there is no referer', () => {
    const headers = { Accept: '*/*' };
    expect(stripCrossOriginReferer(headers, 'https://example.com/')).toBe(headers);
  });
});

describe('decideHttpsUpgrade', () => {
  const on = { enabled: true, allowlist: [] as string[] };

  it('leaves https alone', () => {
    expect(decideHttpsUpgrade('https://example.com/', on)).toEqual({ action: 'continue' });
  });

  it('upgrades plain http', () => {
    expect(decideHttpsUpgrade('http://example.com/a?b=1', on)).toEqual({
      action: 'upgrade',
      url: 'https://example.com/a?b=1',
    });
  });

  it('preserves the port, path, query and hash when upgrading', () => {
    const decision = decideHttpsUpgrade('http://example.com:8080/a/b?c=d#e', on);
    expect(decision).toEqual({ action: 'upgrade', url: 'https://example.com:8080/a/b?c=d#e' });
  });

  it('warns instead of silently downgrading for an allowlisted host', () => {
    const decision = decideHttpsUpgrade('http://legacy.example/', {
      enabled: true,
      allowlist: ['legacy.example'],
    });
    expect(decision).toEqual({ action: 'interstitial', url: 'http://legacy.example/' });
  });

  it('scopes the allowlist to host and port', () => {
    const decision = decideHttpsUpgrade('http://legacy.example:8080/', {
      enabled: true,
      allowlist: ['legacy.example'],
    });
    expect(decision.action).toBe('upgrade');
  });

  it.each(['http://localhost:5173/', 'http://127.0.0.1:8080/', 'http://dev.local/'])(
    'leaves local development address %s alone',
    (url) => {
      expect(decideHttpsUpgrade(url, on).action).toBe('continue');
    },
  );

  it('does nothing when the user has turned the policy off', () => {
    expect(decideHttpsUpgrade('http://example.com/', { enabled: false, allowlist: [] })).toEqual({
      action: 'continue',
    });
  });

  it('ignores addresses it cannot parse', () => {
    expect(decideHttpsUpgrade('not a url', on).action).toBe('continue');
  });
});

describe('categorizeRequest', () => {
  it('recognises a page the user navigated to', () => {
    expect(categorizeRequest({ url: 'https://example.com/', fromWebContents: true })).toBe('page');
  });

  it('recognises the update check', () => {
    expect(categorizeRequest({ url: UPDATE_FEED_URL, fromWebContents: false })).toBe('update');
  });

  it('recognises the assistant, which only runs on a key the user supplied', () => {
    expect(
      categorizeRequest({
        url: 'https://api.groq.com/openai/v1/chat/completions',
        fromWebContents: false,
      }),
    ).toBe('assistant');
  });

  it('flags anything else as a bug', () => {
    expect(
      categorizeRequest({ url: 'https://analytics.example/collect', fromWebContents: false }),
    ).toBe('unexpected');
  });
});
