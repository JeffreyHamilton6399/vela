import { describe, expect, it } from 'vitest';
import {
  addTile,
  defaultTileTitle,
  moveTile,
  normalizeUrl,
  removeTile,
} from '../../src/main/speed-dial.js';
import type { SpeedDialTile } from '../../src/shared/settings.js';

const tile = (id: string, url: string): SpeedDialTile => ({ id, url, title: url, icon: null });
const ids = (tiles: readonly SpeedDialTile[]): string[] => tiles.map((t) => t.id);

/** Deterministic ids, so the tests describe behaviour rather than uuids. */
function counter(): () => string {
  let n = 0;
  return () => `id${String(++n)}`;
}

describe('normalizeUrl', () => {
  it('assumes https for a bare host', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com/');
  });

  it('keeps an explicit scheme', () => {
    expect(normalizeUrl('http://example.com/x')).toBe('http://example.com/x');
  });

  it('refuses anything that is not a web address', () => {
    expect(normalizeUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('  ')).toBeNull();
  });
});

describe('addTile', () => {
  it('appends a tile with a readable default title', () => {
    const tiles = addTile([], { url: 'https://www.example.com/' }, null, counter());
    expect(tiles).toEqual([
      { id: 'id1', url: 'https://www.example.com/', title: 'example.com', icon: null },
    ]);
  });

  it('keeps the path in the default title when there is one', () => {
    expect(defaultTileTitle('https://example.com/docs')).toBe('example.com/docs');
  });

  it('honours a title the user supplied', () => {
    const [added] = addTile([], { url: 'example.com', title: 'Work' }, null, counter());
    expect(added?.title).toBe('Work');
  });

  it('refreshes an existing tile instead of duplicating the address', () => {
    const existing = [tile('a', 'https://example.com/')];
    const tiles = addTile(existing, { url: 'https://example.com/', title: 'Renamed' }, 'data:x');
    expect(tiles).toHaveLength(1);
    expect(tiles[0]?.title).toBe('Renamed');
    expect(tiles[0]?.icon).toBe('data:x');
  });

  it('ignores an address it will not open', () => {
    expect(addTile([], { url: 'javascript:alert(1)' }, null)).toEqual([]);
  });

  it('stops at the grid limit', () => {
    let tiles: SpeedDialTile[] = [];
    const nextId = counter();
    for (let i = 0; i < 40; i += 1) {
      tiles = addTile(tiles, { url: `https://site${String(i)}.example/` }, null, nextId);
    }
    expect(tiles).toHaveLength(24);
  });
});

describe('removeTile / moveTile', () => {
  const tiles = [
    tile('a', 'https://a.example/'),
    tile('b', 'https://b.example/'),
    tile('c', 'https://c.example/'),
  ];

  it('removes by id', () => {
    expect(ids(removeTile(tiles, 'b'))).toEqual(['a', 'c']);
  });

  it('reorders within the grid', () => {
    expect(ids(moveTile(tiles, 'c', 0))).toEqual(['c', 'a', 'b']);
    expect(ids(moveTile(tiles, 'a', 2))).toEqual(['b', 'c', 'a']);
  });

  it('clamps an out-of-range target', () => {
    expect(ids(moveTile(tiles, 'a', 99))).toEqual(['b', 'c', 'a']);
  });

  it('is a no-op for an unknown id', () => {
    expect(ids(moveTile(tiles, 'zz', 0))).toEqual(['a', 'b', 'c']);
  });
});
