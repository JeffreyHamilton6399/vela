import { describe, expect, it } from 'vitest';
import { backfillIcons } from '../../src/main/favicons/icon-backfill.js';
import type { Bookmark, SpeedDialTile, WebPanel } from '../../src/shared/settings.js';

const ICON = 'data:image/png;base64,hn';
const OTHER = 'data:image/png;base64,already';

function saved(): { bookmarks: Bookmark[]; speedDial: SpeedDialTile[]; webPanels: WebPanel[] } {
  return {
    bookmarks: [
      { id: 'b1', url: 'https://news.ycombinator.com/', title: 'Hacker News', icon: null },
      { id: 'b2', url: 'https://example.com/', title: 'Example', icon: null },
    ],
    speedDial: [
      { id: 't1', url: 'https://news.ycombinator.com/newest', title: 'Newest', icon: null },
      { id: 't2', url: 'https://news.ycombinator.com/', title: 'HN', icon: OTHER },
    ],
    webPanels: [{ id: 'p1', url: 'https://news.ycombinator.com/', title: 'HN', icon: null }],
  };
}

describe('backfillIcons', () => {
  it('fills every list that had something saved for the site', () => {
    const patch = backfillIcons(saved(), 'https://news.ycombinator.com', ICON);

    expect(patch?.bookmarks?.[0]?.icon).toBe(ICON);
    expect(patch?.speedDial?.[0]?.icon).toBe(ICON);
    expect(patch?.webPanels?.[0]?.icon).toBe(ICON);
  });

  /** A path is not an origin: every page on the site shares one icon. */
  it('matches on the origin, whatever the path', () => {
    const patch = backfillIcons(saved(), 'https://news.ycombinator.com', ICON);
    expect(patch?.speedDial?.[0]?.url).toBe('https://news.ycombinator.com/newest');
  });

  it('leaves other sites alone', () => {
    const patch = backfillIcons(saved(), 'https://news.ycombinator.com', ICON);
    expect(patch?.bookmarks?.[1]?.icon).toBeNull();
  });

  /**
   * An icon already stored is one the site announced for itself. Filling gaps is
   * the job; overruling the site is not.
   */
  it('never overwrites an icon that is already there', () => {
    const patch = backfillIcons(saved(), 'https://news.ycombinator.com', ICON);
    expect(patch?.speedDial?.[1]?.icon).toBe(OTHER);
  });

  /**
   * The caller writes settings with whatever comes back, and every browsing
   * session caches icons for sites nothing has saved. Those must not each
   * rewrite the settings file.
   */
  it('returns null when nothing is saved for the site', () => {
    expect(backfillIcons(saved(), 'https://nobody.example', ICON)).toBeNull();
  });

  it('omits the lists that did not change', () => {
    const only = {
      bookmarks: [{ id: 'b', url: 'https://a.example/', title: 'A', icon: null }],
      speedDial: [],
      webPanels: [],
    };
    const patch = backfillIcons(only, 'https://a.example', ICON);

    expect(patch).not.toBeNull();
    expect(Object.keys(patch ?? {})).toEqual(['bookmarks']);
  });

  it('ignores entries whose address is not a URL', () => {
    const broken = {
      bookmarks: [{ id: 'b', url: 'not a url', title: 'Broken', icon: null }],
      speedDial: [],
      webPanels: [],
    };
    expect(backfillIcons(broken, 'https://a.example', ICON)).toBeNull();
  });
});
