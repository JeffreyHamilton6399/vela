import type { WebPanel } from '../../shared/settings.js';

/**
 * The docked-site list with one site's icon replaced, or null when nothing
 * would change.
 *
 * Two things resolve a panel's icon — the site announcing one while the panel
 * is open, and Vela asking for one when the site is first docked — and both
 * land here. Returning null for "no change" is what keeps either of them from
 * writing the settings file, and waking every listener on it, to store the icon
 * that is already there.
 */
export function panelsWithIcon(
  panels: readonly WebPanel[],
  id: string,
  icon: string,
): WebPanel[] | null {
  const existing = panels.find((panel) => panel.id === id);
  if (existing === undefined || existing.icon === icon) return null;
  return panels.map((panel) => (panel.id === id ? { ...panel, icon } : panel));
}
