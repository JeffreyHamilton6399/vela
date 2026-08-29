import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  ACCEPT_LANGUAGES,
  alignBrandListWithChrome,
  allowsPermission,
  applyClientHints,
  buildBrowserSurfaceScript,
  buildUserAgent,
  chromeBrandList,
  categorizeRequest,
  decideHttpsUpgrade,
  defaultClientHints,
  languageTags,
  trimCrossOriginReferer,
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

describe('alignBrandListWithChrome', () => {
  const CHROMIUM = '"Not;A=Brand";v="8", "Chromium";v="150"';

  it('adds the Chrome brand an Electron embedder never advertises', () => {
    expect(alignBrandListWithChrome(CHROMIUM)).toBe(
      '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
    );
  });

  it('takes the version from the Chromium entry, so the two can never disagree', () => {
    const aligned = alignBrandListWithChrome('"Chromium";v="151"');
    expect(aligned).toBe('"Chromium";v="151", "Google Chrome";v="151"');
  });

  it('leaves a list that already claims Chrome alone', () => {
    const already = '"Chromium";v="150", "Google Chrome";v="150"';
    expect(alignBrandListWithChrome(already)).toBe(already);
  });

  it('leaves a list with no Chromium entry alone', () => {
    expect(alignBrandListWithChrome('"Firefox";v="140"')).toBe('"Firefox";v="140"');
  });

  it('passes through anything it cannot parse rather than mangling it', () => {
    expect(alignBrandListWithChrome('')).toBe('');
    expect(alignBrandListWithChrome('garbage')).toBe('garbage');
  });

  it('keeps every install identical', () => {
    expect(alignBrandListWithChrome(CHROMIUM)).toBe(alignBrandListWithChrome(CHROMIUM));
  });
});

describe('applyClientHints', () => {
  const IDENTITY = { platform: 'win32', chromeMajorVersion: '150' };
  const SECURE = 'https://accounts.example/signin';

  it('adds the hints Electron never sends, so the UA is not alone in claiming Chrome', () => {
    const headers = applyClientHints({ Accept: 'text/html' }, SECURE, IDENTITY);

    expect(headers['Sec-CH-UA']).toBe(
      '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
    );
    expect(headers['Sec-CH-UA-Mobile']).toBe('?0');
    expect(headers['Sec-CH-UA-Platform']).toBe('"Windows"');
    expect(headers['Accept']).toBe('text/html');
  });

  it('names each platform the way Chrome does', () => {
    const platform = (name: string): unknown =>
      applyClientHints({}, SECURE, { platform: name, chromeMajorVersion: '150' })[
        'Sec-CH-UA-Platform'
      ];

    expect(platform('darwin')).toBe('"macOS"');
    expect(platform('win32')).toBe('"Windows"');
    expect(platform('freebsd')).toBe('"Linux"');
  });

  it('volunteers nothing to a plain-http origin, as Chrome does not', () => {
    expect(applyClientHints({ Accept: '*/*' }, 'http://example.com/', IDENTITY)).toEqual({
      Accept: '*/*',
    });
  });

  it('still sends them to loopback, which Chromium counts as secure', () => {
    const headers = applyClientHints({}, 'http://localhost:5273/', IDENTITY);
    expect(headers['Sec-CH-UA-Mobile']).toBe('?0');
  });

  it('aligns a brand list Chromium did send rather than adding a second one', () => {
    const headers = applyClientHints(
      {
        'sec-ch-ua': '"Chromium";v="150"',
        'sec-ch-ua-full-version-list': '"Chromium";v="150.0.7871.212"',
      },
      SECURE,
      IDENTITY,
    );

    expect(headers['sec-ch-ua']).toBe('"Chromium";v="150", "Google Chrome";v="150"');
    expect(headers['sec-ch-ua-full-version-list']).toBe(
      '"Chromium";v="150.0.7871.212", "Google Chrome";v="150.0.7871.212"',
    );
    expect(headers['Sec-CH-UA']).toBeUndefined();
  });

  it('never contradicts a hint the request already carried', () => {
    const headers = applyClientHints({ 'sec-ch-ua-platform': '"Android"' }, SECURE, IDENTITY);
    expect(headers['sec-ch-ua-platform']).toBe('"Android"');
    expect(headers['Sec-CH-UA-Platform']).toBeUndefined();
  });

  it('keeps every install identical', () => {
    expect(applyClientHints({}, SECURE, IDENTITY)).toEqual(applyClientHints({}, SECURE, IDENTITY));
  });
});

describe('trimCrossOriginReferer', () => {
  it('cuts a cross-origin referer back to its origin, keeping the path private', () => {
    const headers = { Referer: 'https://private.example/secret', Accept: '*/*' };
    expect(trimCrossOriginReferer(headers, 'https://tracker.example/pixel')).toEqual({
      Accept: '*/*',
      Referer: 'https://private.example/',
    });
  });

  it('leaves an origin for a cross-origin login POST to check, so CSRF passes', () => {
    const headers = { Referer: 'https://app.example/login' };
    expect(trimCrossOriginReferer(headers, 'https://auth.example/session')).toEqual({
      Referer: 'https://app.example/',
    });
  });

  it('keeps a same-origin referer whole, which leaks nothing new', () => {
    const headers = { Referer: 'https://example.com/a', Accept: '*/*' };
    expect(trimCrossOriginReferer(headers, 'https://example.com/b')).toEqual(headers);
  });

  it('sends nothing at all when https drops to http', () => {
    const headers = { Referer: 'https://example.com/a' };
    expect(trimCrossOriginReferer(headers, 'http://example.com/b')).toEqual({});
  });

  it('matches the header name case-insensitively and keeps that spelling', () => {
    expect(
      trimCrossOriginReferer({ referer: 'https://a.example/x' }, 'https://b.example/'),
    ).toEqual({ referer: 'https://a.example/' });
  });

  it('leaves headers alone when there is no referer', () => {
    const headers = { Accept: '*/*' };
    expect(trimCrossOriginReferer(headers, 'https://example.com/')).toBe(headers);
  });

  it('passes a referer it cannot parse through untouched', () => {
    const headers = { Referer: 'not a url' };
    expect(trimCrossOriginReferer(headers, 'https://example.com/')).toBe(headers);
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

describe('the browser surface script', () => {
  const IDENTITY = { platform: 'win32', chromeMajorVersion: '150' };

  it('is valid JavaScript', () => {
    expect(() => new Script(buildBrowserSurfaceScript(IDENTITY))).not.toThrow();
  });

  /**
   * The one that matters. An empty `window.chrome` beside a Chrome user agent
   * is what Google's sign-in reads, and filling these three in is what takes
   * accounts.google.com from a refusal to the ordinary password step.
   */
  it('defines the three members Chrome hangs off window.chrome', () => {
    const source = buildBrowserSurfaceScript(IDENTITY);
    for (const member of ['loadTimes', 'csi', 'app']) {
      expect(source).toContain(`chrome.${member} =`);
    }
  });

  /**
   * The header and the script are two halves of one claim. If they can drift
   * apart, the disagreement between them becomes the identifying bit — which
   * is the thing the brand alignment exists to avoid.
   */
  it('claims exactly the brands the client-hint header claims', () => {
    const header = defaultClientHints(IDENTITY)['Sec-CH-UA'];
    const source = buildBrowserSurfaceScript(IDENTITY);

    for (const entry of chromeBrandList(IDENTITY)) {
      expect(header).toContain(`"${entry.brand}";v="${entry.version}"`);
      expect(source).toContain(JSON.stringify(entry.brand));
    }
  });

  it('asks for the languages the session asks for', () => {
    expect(ACCEPT_LANGUAGES).toBe('en-US,en');
    expect(buildBrowserSurfaceScript(IDENTITY)).toContain(JSON.stringify(languageTags()));
  });

  it('carries no install, session, or machine identifier', () => {
    const source = buildBrowserSurfaceScript(IDENTITY);
    expect(source).toBe(buildBrowserSurfaceScript(IDENTITY));
    expect(source.toLowerCase()).not.toContain('vela');
    expect(source.toLowerCase()).not.toContain('electron');
  });
});

describe('permissions', () => {
  /**
   * These four change how a page uses the window it already has, and Chrome
   * grants every one of them off a user gesture without a prompt. A blanket
   * deny did not make Vela safer, it made fullscreen video impossible:
   * `requestFullscreen()` returned a promise that never settled at all.
   */
  it('allows what only changes how a page uses its own window', () => {
    for (const permission of [
      'fullscreen',
      'pointerLock',
      'keyboardLock',
      'clipboard-sanitized-write',
      'mediaKeySystem',
    ]) {
      expect(allowsPermission(permission)).toBe(true);
    }
  });

  it('refuses everything that reaches past the page', () => {
    for (const permission of [
      'geolocation',
      'media',
      'notifications',
      'midi',
      'midiSysex',
      'usb',
      'serial',
      'hid',
      'display-capture',
      'idle-detection',
      'clipboard-read',
      'deprecated-sync-clipboard-read',
      'storage-access',
      'top-level-storage-access',
      'window-management',
      'speaker-selection',
      'openExternal',
      'fileSystem',
      'unknown',
    ]) {
      expect(allowsPermission(permission)).toBe(false);
    }
  });

  it('refuses a permission it has never heard of', () => {
    expect(allowsPermission('some-capability-a-later-electron-adds')).toBe(false);
  });
});
