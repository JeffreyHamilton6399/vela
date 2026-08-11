import { resolveBang } from './bangs.js';
import { buildSearchUrl, findSearchEngine, SEARCH_ENGINES } from './search-engines.js';

/**
 * Turns whatever the user typed into either a URL to navigate to or a search.
 * Pure, and shared with the renderer so the address bar can show what will
 * happen before the user commits.
 */
export type AddressIntent =
  | { kind: 'navigate'; url: string }
  | { kind: 'search'; query: string; url: string }
  | { kind: 'bang'; bang: string; query: string; url: string }
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

  // Bangs are resolved here rather than by bouncing the query off a search
  // engine, so `!gh electron` never tells DuckDuckGo what you looked for.
  const bang = resolveBang(input);
  if (bang !== null) {
    return { kind: 'bang', bang: bang.bang.bang, query: bang.query, url: bang.url };
  }

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

/**
 * What the address bar should read for a page.
 *
 * On a results page it shows the terms you searched for rather than the
 * engine's raw query string — `bing.com/search?q=how+to+...&form=QBLH&sp=-1`
 * tells you nothing you did not already know, and buries the one part you
 * might want to edit.
 */
export function describeAddress(url: string): { kind: 'search' | 'url'; text: string } {
  const query = searchTermsFor(url);
  if (query !== null) return { kind: 'search', text: query };
  return { kind: 'url', text: displayUrl(url) };
}

/** The search terms in a results URL, if this looks like one. */
export function searchTermsFor(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const engine = SEARCH_ENGINES.find((candidate) => {
    try {
      return new URL(candidate.template.replace('{query}', 'x')).host === parsed.host;
    } catch {
      return false;
    }
  });
  if (engine === undefined) return null;

  // Use the parameter the engine's own template uses, so a host that serves
  // several kinds of page only matches its real results URL.
  let parameter: string | null = null;
  try {
    const templateUrl = new URL(engine.template.replace('{query}', 'VELA_QUERY'));
    for (const [key, value] of templateUrl.searchParams) {
      if (value === 'VELA_QUERY') parameter = key;
    }
  } catch {
    return null;
  }

  if (parameter === null) return null;
  const terms = parsed.searchParams.get(parameter);
  return terms === null || terms.trim() === '' ? null : terms;
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
