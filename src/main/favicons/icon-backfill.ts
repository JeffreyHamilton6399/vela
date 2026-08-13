import type { Bookmark, Settings, SpeedDialTile, WebPanel } from '../../shared/settings.js';

/** The lists an icon can be filled into. Absent keys are unchanged. */
export interface IconBackfill {
  bookmarks?: Bookmark[];
  speedDial?: SpeedDialTile[];
  webPanels?: WebPanel[];
}

/**
 * Fills a newly cached icon into everything already saved for that site.
 *
 * A bookmark, a Speed Dial tile and a docked site each store the icon that was
 * cached at the moment they were created, and nothing ever went back for it. So
 * anything saved before its site's icon was known kept the first letter of its
 * host for good: bookmark a page while it is still loading, or dock a site that
 * serves no `/favicon.ico`, and that is what you were left with.
 *
 * Icons are cached per origin, and these lists are small, so the cheap fix is to
 * sweep them whenever the cache learns something new. Only entries with no icon
 * at all are touched — an icon already stored is one the site itself announced,
 * and it is not this function's business to argue with it.
 */
export function backfillIcons(
  settings: Pick<Settings, 'bookmarks' | 'speedDial' | 'webPanels'>,
  origin: string,
  icon: string,
): IconBackfill | null {
  const bookmarks = fill(settings.bookmarks, origin, icon);
  const speedDial = fill(settings.speedDial, origin, icon);
  const webPanels = fill(settings.webPanels, origin, icon);

  if (bookmarks === null && speedDial === null && webPanels === null) return null;

  return {
    ...(bookmarks === null ? {} : { bookmarks }),
    ...(speedDial === null ? {} : { speedDial }),
    ...(webPanels === null ? {} : { webPanels }),
  };
}

/** The list with `icon` filled into every iconless entry on `origin`. */
function fill<T extends { url: string; icon: string | null }>(
  entries: readonly T[],
  origin: string,
  icon: string,
): T[] | null {
  const wanted = entries.some((entry) => entry.icon === null && originOf(entry.url) === origin);
  if (!wanted) return null;

  return entries.map((entry) =>
    entry.icon === null && originOf(entry.url) === origin ? { ...entry, icon } : entry,
  );
}

/** Matches FaviconCache's own key: one site, one icon. */
function originOf(url: string): string | null {
  try {
    const { origin } = new URL(url);
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}
