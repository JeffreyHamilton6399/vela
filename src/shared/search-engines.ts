/**
 * Search engines Vela can send queries to. DuckDuckGo is the default because
 * it does not log queries or build a profile from them.
 *
 * `{query}` is replaced with the percent-encoded search terms.
 */
export interface SearchEngine {
  readonly id: string;
  readonly name: string;
  readonly template: string;
  /** Shown on the first-run screen, so the choice is an informed one. */
  readonly blurb: string;
  /** True when the engine does not build a profile from your searches. */
  readonly tracks: boolean;
}

const DUCKDUCKGO: SearchEngine = {
  id: 'duckduckgo',
  name: 'DuckDuckGo',
  template: 'https://duckduckgo.com/?q={query}',
  blurb: 'No search history, no profile. Vela’s default.',
  tracks: false,
};

export const SEARCH_ENGINES: readonly SearchEngine[] = [
  DUCKDUCKGO,
  {
    id: 'startpage',
    name: 'Startpage',
    template: 'https://www.startpage.com/sp/search?query={query}',
    blurb: 'Google’s results, fetched on your behalf and stripped of your identity.',
    tracks: false,
  },
  {
    id: 'brave',
    name: 'Brave Search',
    template: 'https://search.brave.com/search?q={query}',
    blurb: 'An independent index. No profiling.',
    tracks: false,
  },
  {
    id: 'ecosia',
    name: 'Ecosia',
    template: 'https://www.ecosia.org/search?q={query}',
    blurb: 'Bing’s results; profits go to planting trees.',
    tracks: true,
  },
  {
    id: 'google',
    name: 'Google',
    template: 'https://www.google.com/search?q={query}',
    blurb: 'The results most people expect. Logs your searches and builds a profile.',
    tracks: true,
  },
  {
    id: 'bing',
    name: 'Bing',
    template: 'https://www.bing.com/search?q={query}',
    blurb: 'Microsoft’s index. Logs your searches and builds a profile.',
    tracks: true,
  },
];

export const DEFAULT_SEARCH_ENGINE_ID = DUCKDUCKGO.id;

export function findSearchEngine(id: string): SearchEngine {
  return SEARCH_ENGINES.find((engine) => engine.id === id) ?? DUCKDUCKGO;
}

/** Builds a search URL. The query is the only thing that leaves the machine. */
export function buildSearchUrl(engine: SearchEngine, query: string): string {
  return engine.template.replace('{query}', encodeURIComponent(query));
}
