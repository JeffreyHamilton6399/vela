import { randomUUID } from 'node:crypto';
import type { SpeedDialTile } from '../shared/settings.js';
import { normalizeUrl } from '../shared/url.js';
export { normalizeUrl };

const MAX_TILES = 24;

/** A readable label for a tile the user did not name themselves. */
export function defaultTileTitle(url: string): string {
  try {
    const { host, pathname } = new URL(url);
    const bare = host.replace(/^www\./, '');
    return pathname === '/' || pathname === '' ? bare : `${bare}${pathname}`;
  } catch {
    return url;
  }
}

/**
 * Speed Dial list operations, kept pure so the grid's behaviour can be tested
 * without a window.
 */
export function addTile(
  tiles: readonly SpeedDialTile[],
  entry: { url: string; title?: string | undefined },
  icon: string | null,
  makeId: () => string = randomUUID,
): SpeedDialTile[] {
  const normalized = normalizeUrl(entry.url);
  if (normalized === null) return [...tiles];

  // One tile per address: adding an existing one refreshes it instead.
  const existing = tiles.findIndex((tile) => tile.url === normalized);
  if (existing !== -1) {
    return tiles.map((tile, index) =>
      index === existing
        ? { ...tile, title: entry.title ?? tile.title, icon: icon ?? tile.icon }
        : tile,
    );
  }

  if (tiles.length >= MAX_TILES) return [...tiles];

  return [
    ...tiles,
    {
      id: makeId(),
      url: normalized,
      title:
        entry.title?.trim() === ''
          ? defaultTileTitle(normalized)
          : (entry.title ?? defaultTileTitle(normalized)),
      icon,
    },
  ];
}

export function removeTile(tiles: readonly SpeedDialTile[], id: string): SpeedDialTile[] {
  return tiles.filter((tile) => tile.id !== id);
}

export function moveTile(
  tiles: readonly SpeedDialTile[],
  id: string,
  toIndex: number,
): SpeedDialTile[] {
  const from = tiles.findIndex((tile) => tile.id === id);
  if (from === -1) return [...tiles];

  const moving = tiles.at(from);
  if (moving === undefined) return [...tiles];

  const target = Math.min(Math.max(toIndex, 0), tiles.length - 1);
  if (target === from) return [...tiles];

  const rest = tiles.filter((tile) => tile.id !== id);
  return [...rest.slice(0, target), moving, ...rest.slice(target)];
}
