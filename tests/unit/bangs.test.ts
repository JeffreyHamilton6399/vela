import { describe, expect, it } from 'vitest';
import { BANGS, findBang, resolveBang } from '../../src/shared/bangs.js';
import { resolveAddressInput } from '../../src/shared/address-input.js';

describe('bang shortcuts', () => {
  it('resolves a bang with a query', () => {
    const match = resolveBang('!gh electron');
    expect(match?.bang.name).toBe('GitHub');
    expect(match?.url).toBe('https://github.com/search?q=electron');
  });

  it('sends a bare bang to the site itself', () => {
    expect(resolveBang('!yt')?.url).toBe('https://www.youtube.com/');
  });

  it('is case-insensitive', () => {
    expect(resolveBang('!GH react')?.bang.bang).toBe('gh');
  });

  it('percent-encodes the query', () => {
    expect(resolveBang('!w tim berners-lee')?.url).toContain('tim%20berners-lee');
  });

  it('ignores an unknown bang so it falls through to search', () => {
    expect(resolveBang('!nope hello')).toBeNull();
    expect(findBang('hello !gh')).toBeNull();
  });

  it('is wired into address resolution ahead of search', () => {
    const intent = resolveAddressInput('!gh electron', 'duckduckgo');
    expect(intent.kind).toBe('bang');
    if (intent.kind !== 'bang') return;
    expect(intent.url).toBe('https://github.com/search?q=electron');
  });

  it('every bang points at https', () => {
    for (const bang of BANGS) {
      expect(bang.home.startsWith('https://'), bang.bang).toBe(true);
      expect(bang.template.startsWith('https://'), bang.bang).toBe(true);
    }
  });
});
