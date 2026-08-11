import { describe, expect, it } from 'vitest';
import {
  addBookmark,
  findBookmark,
  moveBookmark,
  removeBookmark,
} from '../../src/shared/bookmarks.js';
import { normalizeUrl } from '../../src/shared/url.js';
import { isRecordable, rankEntry } from '../../src/main/history/history-store.js';
import type { Bookmark } from '../../src/shared/settings.js';
import type { HistoryEntry } from '../../src/shared/types/ipc.js';

const ids = (marks: readonly Bookmark[]): string[] => marks.map((mark) => mark.id);

function counter(): () => string {
  let n = 0;
  return () => `id${String(++n)}`;
}

describe('normalizeUrl', () => {
  it('assumes https for a bare host and keeps an explicit scheme', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com/');
    expect(normalizeUrl('http://example.com/x')).toBe('http://example.com/x');
  });

  it('refuses anything that is not a web address', () => {
    expect(normalizeUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('   ')).toBeNull();
  });
});

describe('bookmarks', () => {
  it('saves a page with its title', () => {
    const marks = addBookmark([], 'example.com', 'Example', null, counter());
    expect(marks).toEqual([
      { id: 'id1', url: 'https://example.com/', title: 'Example', icon: null },
    ]);
  });

  it('falls back to the address when there is no title', () => {
    const [mark] = addBookmark([], 'example.com', '   ', null, counter());
    expect(mark?.title).toBe('https://example.com/');
  });

  it('updates rather than duplicating an address already saved', () => {
    const existing = addBookmark([], 'example.com', 'Old', null, counter());
    const updated = addBookmark(existing, 'https://example.com/', 'New', 'data:x', counter());

    expect(updated).toHaveLength(1);
    expect(updated[0]?.title).toBe('New');
    expect(updated[0]?.icon).toBe('data:x');
  });

  it('refuses an address it would not open', () => {
    expect(addBookmark([], 'javascript:alert(1)', 'Bad', null, counter())).toEqual([]);
  });

  it('finds a saved page regardless of how the address was typed', () => {
    const marks = addBookmark([], 'https://example.com/', 'Example', null, counter());
    expect(findBookmark(marks, 'example.com')?.title).toBe('Example');
    expect(findBookmark(marks, 'https://other.example/')).toBeNull();
  });

  it('removes and reorders', () => {
    let marks: Bookmark[] = [];
    const nextId = counter();
    for (const host of ['a.example', 'b.example', 'c.example']) {
      marks = addBookmark(marks, host, host, null, nextId);
    }

    expect(ids(removeBookmark(marks, 'id2'))).toEqual(['id1', 'id3']);
    expect(ids(moveBookmark(marks, 'id3', 0))).toEqual(['id3', 'id1', 'id2']);
    expect(ids(moveBookmark(marks, 'id1', 99))).toEqual(['id2', 'id3', 'id1']);
  });
});

describe('history recording rules', () => {
  it('records web pages only', () => {
    expect(isRecordable('https://example.com/')).toBe(true);
    expect(isRecordable('http://example.com/')).toBe(true);
  });

  it('never records Vela pages, blank pages or local files', () => {
    expect(isRecordable('about:blank')).toBe(false);
    expect(isRecordable('')).toBe(false);
    expect(isRecordable('file:///C:/secret.txt')).toBe(false);
    expect(isRecordable('not a url')).toBe(false);
  });
});

describe('history ranking', () => {
  const NOW = 1_000_000_000_000;
  const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
    url: 'https://example.com/',
    title: 'Example Domain',
    visitedAt: NOW,
    visits: 1,
    ...over,
  });

  it('misses when the query is nowhere in the title or address', () => {
    expect(rankEntry(entry(), 'kangaroo', NOW)).toBeNull();
  });

  it('prefers a page visited often over one seen once', () => {
    const frequent = rankEntry(entry({ visits: 20 }), 'example', NOW) ?? 0;
    const once = rankEntry(entry({ visits: 1 }), 'example', NOW) ?? 0;
    expect(frequent).toBeGreaterThan(once);
  });

  it('prefers a recent visit over an old one', () => {
    const fresh = rankEntry(entry(), 'example', NOW) ?? 0;
    const stale = rankEntry(entry({ visitedAt: NOW - 30 * 86_400_000 }), 'example', NOW) ?? 0;
    expect(fresh).toBeGreaterThan(stale);
  });

  it('prefers a match at the start of the title', () => {
    const leading = rankEntry(entry({ title: 'Docs for React' }), 'docs', NOW) ?? 0;
    const buried = rankEntry(entry({ title: 'React reference docs' }), 'docs', NOW) ?? 0;
    expect(leading).toBeGreaterThan(buried);
  });

  it('matches on the address as well as the title', () => {
    expect(rankEntry(entry({ title: '' }), 'example.com', NOW)).not.toBeNull();
  });
});
