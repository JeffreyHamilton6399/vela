import { describe, expect, it } from 'vitest';
import { needsChromeShim } from '../../src/main/tabs/chrome-shim.js';

describe('needsChromeShim', () => {
  it('covers the host that runs the check', () => {
    expect(needsChromeShim('https://accounts.google.com/ServiceLogin')).toBe(true);
    expect(needsChromeShim('https://accounts.google.com/v3/signin/identifier?x=1')).toBe(true);
  });

  /**
   * The narrowness is the point. The shim exists for one gate; every other
   * page on the web sees an unmodified Vela, including the rest of Google.
   */
  it('leaves the rest of Google alone', () => {
    expect(needsChromeShim('https://www.google.com/search?q=hello')).toBe(false);
    expect(needsChromeShim('https://mail.google.com/mail/u/0/')).toBe(false);
    expect(needsChromeShim('https://drive.google.com/')).toBe(false);
  });

  it('leaves the web at large alone', () => {
    expect(needsChromeShim('https://example.com/')).toBe(false);
    expect(needsChromeShim('https://github.com/login')).toBe(false);
  });

  it('is not fooled by a host that merely ends the same way', () => {
    expect(needsChromeShim('https://accounts.google.com.evil.test/')).toBe(false);
    expect(needsChromeShim('https://notaccounts.google.com/')).toBe(false);
  });

  it('treats anything unparseable as not needing it', () => {
    expect(needsChromeShim('')).toBe(false);
    expect(needsChromeShim('not a url')).toBe(false);
    expect(needsChromeShim('about:blank')).toBe(false);
  });
});
