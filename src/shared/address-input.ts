import { buildSearchUrl, findSearchEngine } from './search-engines.js';

/**
 * Turns whatever the user typed into either a URL to navigate to or a search.
 * Pure, and shared with the renderer so the address bar can show what will
 * happen before the user commits.
 */
export type AddressIntent =
  | { kind: 'navigate'; url: string }
  | { kind: 'search'; query: string; url: string }
  | { kind: 'empty' };

/** Schemes Vela will hand straight to the view. */
const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'file:', 'about:', 'vela:']);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const HOST_WITH_TLD = /^[\w-]+(\.[\w-]+)+$/;
const LOCALHOST = /^localhost(:\d+)?$/i;

function hasScheme(input: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(input);
}

/** `example.com`, `example.com/path`, `localhost:3000`, `127.0.0.1:8080`. */
function looksLikeHost(input: string): boolean {
  if (input.includes(' ')) return false;

  const [authority = ''] = input.split(/[/?#]/, 1);
  const host = authority.replace(/:\d+$/, '');

  if (LOCALHOST.test(authority)) return true;
  if (IPV4.test(host)) return true;
  return HOST_WITH_TLD.test(host);
}

/**
 * Bare hosts are upgraded to https, never http — the plain-http path exists
 * only when the user types the scheme themselves.
 */
export function resolveAddressInput(rawInput: string, searchEngineId: string): AddressIntent {
  const input = rawInput.trim();
  if (input === '') return { kind: 'empty' };

  // Host-shape is checked first: `localhost:5173` would otherwise be read as a
  // URL whose scheme is `localhost:`.
  if (looksLikeHost(input)) {
    try {
      return { kind: 'navigate', url: new URL(`https://${input}`).toString() };
    } catch {
      // Fall through to search.
    }
  } else if (hasScheme(input)) {
    try {
      const parsed = new URL(input);
      if (ALLOWED_SCHEMES.has(parsed.protocol)) {
        return { kind: 'navigate', url: parsed.toString() };
      }
    } catch {
      // Not a parseable URL after all; fall through to search.
    }
  }

  return {
    kind: 'search',
    query: input,
    url: buildSearchUrl(findSearchEngine(searchEngineId), input),
  };
}

/** What the address bar shows for a given page URL: readable, not raw. */
export function displayUrl(url: string): string {
  if (url === '' || url === 'about:blank') return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'vela:') return '';
    const trimmedHost = parsed.host.replace(/^www\./, '');
    const rest = `${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}${parsed.hash}`;
    return `${trimmedHost}${rest}`;
  } catch {
    return url;
  }
}

/** The origin shown next to the security indicator. */
export function originLabel(url: string): { host: string; secure: boolean } | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return { host: parsed.host, secure: parsed.protocol === 'https:' };
  } catch {
    return null;
  }
}
