import type { Bookmark } from './settings.js';
import { normalizeUrl } from './url.js';

const MAX_BOOKMARKS = 500;

/**
 * Bookmark list operations, pure and shared.
 *
 * `makeId` is a parameter rather than an import so this module stays free of
 * Node APIs: the renderer imports it too, to tell whether the page in front of
 * you is already saved.
 */
export function addBookmark(
  bookmarks: readonly Bookmark[],
  url: string,
  title: string,
  icon: string | null,
  makeId: () => string,
): Bookmark[] {
  const normalized = normalizeUrl(url);
  if (normalized === null) return [...bookmarks];

  // Bookmarking a page you already saved updates it rather than duplicating it.
  const existing = bookmarks.findIndex((mark) => mark.url === normalized);
  if (existing !== -1) {
    return bookmarks.map((mark, index) =>
      index === existing
        ? { ...mark, title: title.trim() === '' ? mark.title : title, icon: icon ?? mark.icon }
        : mark,
    );
  }

  if (bookmarks.length >= MAX_BOOKMARKS) return [...bookmarks];

  return [
    ...bookmarks,
    { id: makeId(), url: normalized, title: title.trim() === '' ? normalized : title, icon },
  ];
}

export function removeBookmark(bookmarks: readonly Bookmark[], id: string): Bookmark[] {
  return bookmarks.filter((mark) => mark.id !== id);
}

export function moveBookmark(
  bookmarks: readonly Bookmark[],
  id: string,
  toIndex: number,
): Bookmark[] {
  const from = bookmarks.findIndex((mark) => mark.id === id);
  if (from === -1) return [...bookmarks];

  const moving = bookmarks.at(from);
  if (moving === undefined) return [...bookmarks];

  const target = Math.min(Math.max(toIndex, 0), bookmarks.length - 1);
  if (target === from) return [...bookmarks];

  const rest = bookmarks.filter((mark) => mark.id !== id);
  return [...rest.slice(0, target), moving, ...rest.slice(target)];
}

/** The saved bookmark for a page, if there is one. */
export function findBookmark(bookmarks: readonly Bookmark[], url: string): Bookmark | null {
  const normalized = normalizeUrl(url);
  if (normalized === null) return null;
  return bookmarks.find((mark) => mark.url === normalized) ?? null;
}
