/**
 * Ordering rules for the tab strip, kept pure so they can be tested without
 * Electron. Pinned tabs always occupy the front of the strip; every operation
 * here preserves that invariant.
 */
export interface OrderedTab {
  readonly id: string;
  readonly pinned: boolean;
}

function partition<T extends OrderedTab>(tabs: readonly T[]): { pinned: T[]; loose: T[] } {
  return {
    pinned: tabs.filter((tab) => tab.pinned),
    loose: tabs.filter((tab) => !tab.pinned),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function indexOfTab(tabs: readonly OrderedTab[], id: string): number {
  return tabs.findIndex((tab) => tab.id === id);
}

/**
 * Inserts a new tab. Unpinned tabs land after `afterId` when given (so a tab
 * opened from a link sits next to its opener) and otherwise at the end.
 */
export function insertTab<T extends OrderedTab>(tabs: readonly T[], tab: T, afterId?: string): T[] {
  const { pinned, loose } = partition(tabs);

  if (tab.pinned) {
    return [...pinned, tab, ...loose];
  }

  const anchor = afterId === undefined ? -1 : loose.findIndex((item) => item.id === afterId);
  const at = anchor === -1 ? loose.length : anchor + 1;

  return [...pinned, ...loose.slice(0, at), tab, ...loose.slice(at)];
}

export function removeTab<T extends OrderedTab>(tabs: readonly T[], id: string): T[] {
  return tabs.filter((tab) => tab.id !== id);
}

/**
 * Which tab takes focus after the one at `closedIndex` goes away: the tab to
 * its right, else the one to its left, else nothing.
 */
export function nextActiveId(remaining: readonly OrderedTab[], closedIndex: number): string | null {
  if (remaining.length === 0) return null;
  const index = clamp(closedIndex, 0, remaining.length - 1);
  return remaining.at(index)?.id ?? null;
}

/** Moves a tab to `toIndex`, clamped into the half of the strip it belongs to. */
export function moveTab<T extends OrderedTab>(
  tabs: readonly T[],
  id: string,
  toIndex: number,
): T[] {
  const from = indexOfTab(tabs, id);
  if (from === -1) return [...tabs];
  const moving = tabs.at(from);
  if (moving === undefined) return [...tabs];

  const pinnedCount = tabs.filter((tab) => tab.pinned).length;
  const lower = moving.pinned ? 0 : pinnedCount;
  const upper = moving.pinned ? pinnedCount - 1 : tabs.length - 1;
  const target = clamp(toIndex, lower, upper);
  if (target === from) return [...tabs];

  const rest = tabs.filter((tab) => tab.id !== id);
  return [...rest.slice(0, target), moving, ...rest.slice(target)];
}

/**
 * Pinning moves a tab to the end of the pinned run; unpinning moves it to the
 * front of the loose run, which is where users expect it to reappear.
 */
export function setPinned<T extends OrderedTab & { pinned: boolean }>(
  tabs: readonly T[],
  id: string,
  pinned: boolean,
  apply: (tab: T, pinned: boolean) => T,
): T[] {
  const existing = tabs.find((tab) => tab.id === id);
  if (existing === undefined || existing.pinned === pinned) return [...tabs];

  const updated = apply(existing, pinned);
  const { pinned: pinnedTabs, loose } = partition(removeTab(tabs, id));

  // The boundary between the two runs is both "end of pinned" and "front of
  // loose", which is exactly where the tab belongs in either direction.
  return [...pinnedTabs, updated, ...loose];
}
