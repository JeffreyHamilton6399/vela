/**
 * Which background tabs should give their renderer process back.
 *
 * Pure, because "when does a tab get suspended" is the kind of rule that is
 * easy to get subtly wrong and impossible to notice by hand.
 */
export interface SuspendCandidate {
  id: string;
  /** Live tabs hold a renderer process; suspended ones do not. */
  suspended: boolean;
  pinned: boolean;
  /** Epoch ms when the tab was last the active one. */
  lastActiveAt: number;
  /** A tab showing Vela's own UI has nothing to suspend. */
  internal: boolean;
}

export interface SuspendPolicy {
  activeId: string | null;
  now: number;
  idleMillis: number;
  /** Roughly how many renderer processes to keep alive at once. */
  maxLiveTabs: number;
}

/**
 * Returns the ids to suspend: everything idle past the threshold, plus the
 * least recently used tabs once the live cap is exceeded.
 *
 * The active tab is never suspended. Pinned tabs are only suspended for idle
 * time, never merely to make room — pinning is a statement that the tab
 * matters.
 */
export function selectTabsToSuspend(
  tabs: readonly SuspendCandidate[],
  policy: SuspendPolicy,
): string[] {
  const eligible = tabs.filter(
    (tab) => !tab.suspended && !tab.internal && tab.id !== policy.activeId,
  );

  const idle = new Set(
    eligible
      .filter((tab) => policy.now - tab.lastActiveAt >= policy.idleMillis)
      .map((tab) => tab.id),
  );

  const liveAfterIdle = tabs.filter(
    (tab) => !tab.suspended && !tab.internal && !idle.has(tab.id),
  ).length;

  const overCap = liveAfterIdle - policy.maxLiveTabs;
  if (overCap > 0) {
    const lru = eligible
      .filter((tab) => !idle.has(tab.id) && !tab.pinned)
      .sort((a, b) => a.lastActiveAt - b.lastActiveAt)
      .slice(0, overCap);

    for (const tab of lru) idle.add(tab.id);
  }

  // Stable order, so the caller's behaviour does not depend on Set iteration.
  return tabs.filter((tab) => idle.has(tab.id)).map((tab) => tab.id);
}
