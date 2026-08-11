import { describe, expect, it } from 'vitest';
import {
  describeAddress,
  displayUrl,
  originLabel,
  resolveAddressInput,
  searchTermsFor,
} from '../../src/shared/address-input.js';
import { DEFAULT_SEARCH_ENGINE_ID, findSearchEngine } from '../../src/shared/search-engines.js';

const DDG = DEFAULT_SEARCH_ENGINE_ID;

describe('resolveAddressInput', () => {
  it('treats blank input as nothing to do', () => {
    expect(resolveAddressInput('', DDG).kind).toBe('empty');
    expect(resolveAddressInput('   ', DDG).kind).toBe('empty');
  });

  it('keeps an explicit scheme', () => {
    expect(resolveAddressInput('https://example.com/a?b=1', DDG)).toEqual({
      kind: 'navigate',
      url: 'https://example.com/a?b=1',
    });
  });

  it('upgrades a bare host to https, never http', () => {
    const intent = resolveAddressInput('example.com', DDG);
    expect(intent).toEqual({ kind: 'navigate', url: 'https://example.com/' });
  });

  it('honours a plain-http URL the user typed themselves', () => {
    expect(resolveAddressInput('http://neverssl.com', DDG)).toEqual({
      kind: 'navigate',
      url: 'http://neverssl.com/',
    });
  });

  it.each(['localhost:5173', '127.0.0.1:8080', 'sub.domain.co.uk/path'])(
    'recognises %s as a host',
    (input) => {
      expect(resolveAddressInput(input, DDG).kind).toBe('navigate');
    },
  );

  it.each(['how do i center a div', 'vela browser', 'what is 2 + 2'])(
    'searches for %s',
    (input) => {
      const intent = resolveAddressInput(input, DDG);
      expect(intent.kind).toBe('search');
      if (intent.kind !== 'search') return;
      expect(intent.url.startsWith('https://duckduckgo.com/?q=')).toBe(true);
      expect(intent.query).toBe(input);
    },
  );

  it('percent-encodes the query rather than interpolating it raw', () => {
    const intent = resolveAddressInput('a&b=c d', DDG);
    if (intent.kind !== 'search') throw new Error('expected a search');
    expect(intent.url).toBe('https://duckduckgo.com/?q=a%26b%3Dc%20d');
  });

  it('searches for a scheme it will not open', () => {
    expect(resolveAddressInput('javascript:alert(1)', DDG).kind).toBe('search');
    expect(resolveAddressInput('data:text/html,<h1>x</h1>', DDG).kind).toBe('search');
  });

  it('uses the engine the user picked', () => {
    const intent = resolveAddressInput('privacy', 'startpage');
    if (intent.kind !== 'search') throw new Error('expected a search');
    expect(intent.url).toContain('startpage.com');
  });

  it('falls back to DuckDuckGo for an unknown engine id', () => {
    expect(findSearchEngine('nonsense').id).toBe('duckduckgo');
  });
});

describe('displayUrl', () => {
  it('drops the scheme, www, and a bare trailing slash', () => {
    expect(displayUrl('https://www.example.com/')).toBe('example.com');
    expect(displayUrl('https://example.com/docs?x=1')).toBe('example.com/docs?x=1');
  });

  it('shows nothing for a blank page', () => {
    expect(displayUrl('')).toBe('');
    expect(displayUrl('about:blank')).toBe('');
  });
});

describe('originLabel', () => {
  it('marks https as secure and http as not', () => {
    expect(originLabel('https://example.com/x')).toEqual({ host: 'example.com', secure: true });
    expect(originLabel('http://example.com/x')).toEqual({ host: 'example.com', secure: false });
  });

  it('has no opinion about non-web schemes', () => {
    expect(originLabel('about:blank')).toBeNull();
    expect(originLabel('nonsense')).toBeNull();
  });
});

describe('describeAddress', () => {
  it('shows the terms you searched for, not the raw query string', () => {
    expect(describeAddress('https://www.bing.com/search?q=how+to+center+a+div&form=QBLH')).toEqual({
      kind: 'search',
      text: 'how to center a div',
    });
  });

  it('works for every engine Vela offers', () => {
    const cases = [
      'https://duckduckgo.com/?q=privacy',
      'https://www.google.com/search?q=privacy',
      'https://search.brave.com/search?q=privacy',
      'https://www.ecosia.org/search?q=privacy',
      'https://www.startpage.com/sp/search?query=privacy',
    ];
    for (const url of cases) {
      expect(describeAddress(url), url).toEqual({ kind: 'search', text: 'privacy' });
    }
  });

  it('leaves an ordinary page alone', () => {
    expect(describeAddress('https://example.com/docs')).toEqual({
      kind: 'url',
      text: 'example.com/docs',
    });
  });

  it('does not mistake a non-results page on a search host for a search', () => {
    expect(searchTermsFor('https://duckduckgo.com/about')).toBeNull();
    expect(searchTermsFor('https://duckduckgo.com/?q=')).toBeNull();
  });
});
