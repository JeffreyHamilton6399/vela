/**
 * Bang shortcuts, resolved on this machine.
 *
 * DuckDuckGo's `!bangs` work by sending your query to DuckDuckGo first and
 * being redirected. Vela resolves them locally instead, so `!gh electron`
 * reaches GitHub without telling anyone else what you searched for.
 */
export interface Bang {
  readonly bang: string;
  readonly name: string;
  /** `{query}` is replaced with the percent-encoded terms. */
  readonly template: string;
  /** Where a bare bang with no query goes. */
  readonly home: string;
}

export const BANGS: readonly Bang[] = [
  {
    bang: 'yt',
    name: 'YouTube',
    template: 'https://www.youtube.com/results?search_query={query}',
    home: 'https://www.youtube.com/',
  },
  {
    bang: 'gh',
    name: 'GitHub',
    template: 'https://github.com/search?q={query}',
    home: 'https://github.com/',
  },
  {
    bang: 'w',
    name: 'Wikipedia',
    template: 'https://en.wikipedia.org/w/index.php?search={query}',
    home: 'https://en.wikipedia.org/',
  },
  {
    bang: 'mdn',
    name: 'MDN',
    template: 'https://developer.mozilla.org/en-US/search?q={query}',
    home: 'https://developer.mozilla.org/',
  },
  {
    bang: 'npm',
    name: 'npm',
    template: 'https://www.npmjs.com/search?q={query}',
    home: 'https://www.npmjs.com/',
  },
  {
    bang: 'so',
    name: 'Stack Overflow',
    template: 'https://stackoverflow.com/search?q={query}',
    home: 'https://stackoverflow.com/',
  },
  {
    bang: 'ddg',
    name: 'DuckDuckGo',
    template: 'https://duckduckgo.com/?q={query}',
    home: 'https://duckduckgo.com/',
  },
  {
    bang: 'a',
    name: 'Archive',
    template: 'https://web.archive.org/web/*/{query}',
    home: 'https://web.archive.org/',
  },
];

export interface BangMatch {
  bang: Bang;
  query: string;
  url: string;
}

/** The bang in `input`, if it starts with one. Case-insensitive. */
export function findBang(input: string): Bang | null {
  const match = /^!([a-z0-9]+)(?:\s|$)/i.exec(input.trim());
  const keyword = match?.[1]?.toLowerCase();
  if (keyword === undefined) return null;

  return BANGS.find((bang) => bang.bang === keyword) ?? null;
}

/**
 * Resolves `!gh electron` into a GitHub search. Returns null when the input
 * does not start with a bang Vela knows, so the caller falls back to search.
 */
export function resolveBang(input: string): BangMatch | null {
  const trimmed = input.trim();
  const bang = findBang(trimmed);
  if (bang === null) return null;

  const query = trimmed.slice(bang.bang.length + 1).trim();

  return {
    bang,
    query,
    url: query === '' ? bang.home : bang.template.replace('{query}', encodeURIComponent(query)),
  };
}
