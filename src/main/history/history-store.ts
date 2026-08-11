import ElectronStore from 'electron-store';
import { z } from 'zod';
import { historyEntrySchema, type HistoryEntry } from '../../shared/types/ipc.js';

const MAX_ENTRIES = 5000;
const entriesSchema = z.array(historyEntrySchema);

/**
 * Local browsing history, in its own file rather than the settings blob so it
 * can grow without rewriting settings on every navigation.
 *
 * Never records a private window, and never leaves this machine — the only
 * things that read it are the address bar and the command palette.
 */
export class HistoryStore {
  private readonly store: ElectronStore<{ entries: unknown }>;
  private entries: HistoryEntry[];

  constructor(name = 'vela-history') {
    this.store = new ElectronStore<{ entries: unknown }>({ name });
    const parsed = entriesSchema.safeParse(this.store.get('entries'));
    this.entries = parsed.success ? parsed.data : [];
  }

  get size(): number {
    return this.entries.length;
  }

  /**
   * Records a visit. Revisiting a page moves it up and bumps its count rather
   * than adding a duplicate row.
   */
  record(url: string, title: string, now = Date.now()): void {
    if (!isRecordable(url)) return;

    const existing = this.entries.findIndex((entry) => entry.url === url);
    if (existing !== -1) {
      const previous = this.entries.at(existing);
      if (previous === undefined) return;
      this.entries.splice(existing, 1);
      this.entries.unshift({
        url,
        title: title === '' ? previous.title : title,
        visitedAt: now,
        visits: previous.visits + 1,
      });
    } else {
      this.entries.unshift({ url, title, visitedAt: now, visits: 1 });
    }

    if (this.entries.length > MAX_ENTRIES) this.entries.length = MAX_ENTRIES;
    this.persist();
  }

  /**
   * Ranks by how well the query matches, then by how often and how recently
   * the page was visited — a site you open daily should beat one you saw once.
   */
  search(query: string, limit = 20): HistoryEntry[] {
    const needle = query.trim().toLowerCase();
    const now = Date.now();

    const scored = this.entries
      .map((entry) => ({ entry, rank: rankEntry(entry, needle, now) }))
      .filter((candidate) => candidate.rank !== null)
      .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));

    return scored.slice(0, limit).map((candidate) => candidate.entry);
  }

  clear(): void {
    this.entries = [];
    this.persist();
  }

  private persist(): void {
    this.store.set('entries', this.entries);
  }
}

/** Vela's own pages and local files are not worth remembering. */
export function isRecordable(url: string): boolean {
  if (url === '' || url === 'about:blank') return false;
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** Higher is better. Null means the entry does not match at all. */
export function rankEntry(entry: HistoryEntry, needle: string, now: number): number | null {
  const haystack = `${entry.title} ${entry.url}`.toLowerCase();

  let match = 0;
  if (needle !== '') {
    const index = haystack.indexOf(needle);
    if (index === -1) return null;
    // An early match — usually the title or the host — beats one deep in a path.
    match = index === 0 ? 60 : Math.max(0, 40 - index);
  }

  const ageDays = Math.max(0, (now - entry.visitedAt) / 86_400_000);
  const recency = 30 / (1 + ageDays);
  const frequency = Math.min(30, entry.visits * 3);

  return match + recency + frequency;
}
