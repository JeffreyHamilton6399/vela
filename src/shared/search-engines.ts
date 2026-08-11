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
}

const DUCKDUCKGO: SearchEngine = {
  id: 'duckduckgo',
  name: 'DuckDuckGo',
  template: 'https://duckduckgo.com/?q={query}',
};

export const SEARCH_ENGINES: readonly SearchEngine[] = [
  DUCKDUCKGO,
  {
    id: 'startpage',
    name: 'Startpage',
    template: 'https://www.startpage.com/sp/search?query={query}',
  },
  { id: 'brave', name: 'Brave Search', template: 'https://search.brave.com/search?q={query}' },
  { id: 'ecosia', name: 'Ecosia', template: 'https://www.ecosia.org/search?q={query}' },
  { id: 'google', name: 'Google', template: 'https://www.google.com/search?q={query}' },
];

export const DEFAULT_SEARCH_ENGINE_ID = DUCKDUCKGO.id;

export function findSearchEngine(id: string): SearchEngine {
  return SEARCH_ENGINES.find((engine) => engine.id === id) ?? DUCKDUCKGO;
}

/** Builds a search URL. The query is the only thing that leaves the machine. */
export function buildSearchUrl(engine: SearchEngine, query: string): string {
  return engine.template.replace('{query}', encodeURIComponent(query));
}
