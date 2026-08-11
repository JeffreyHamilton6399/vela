import { describe, expect, it } from 'vitest';
import { selectTabsToSuspend, type SuspendCandidate } from '../../src/main/tabs/suspension.js';

const MINUTE = 60_000;
const NOW = 1_000 * MINUTE;

function tab(id: string, overrides: Partial<SuspendCandidate> = {}): SuspendCandidate {
  return {
    id,
    suspended: false,
    pinned: false,
    internal: false,
    lastActiveAt: NOW,
    ...overrides,
  };
}

const policy = {
  activeId: 'active',
  now: NOW,
  idleMillis: 5 * MINUTE,
  maxLiveTabs: 10,
};

describe('idle suspension', () => {
  it('suspends a tab that has been idle past the threshold', () => {
    const tabs = [tab('active'), tab('old', { lastActiveAt: NOW - 6 * MINUTE })];
    expect(selectTabsToSuspend(tabs, policy)).toEqual(['old']);
  });

  it('leaves a tab that is still within the threshold', () => {
    const tabs = [tab('active'), tab('recent', { lastActiveAt: NOW - 4 * MINUTE })];
    expect(selectTabsToSuspend(tabs, policy)).toEqual([]);
  });

  it('never suspends the active tab, however long it has been open', () => {
    const tabs = [tab('active', { lastActiveAt: NOW - 600 * MINUTE })];
    expect(selectTabsToSuspend(tabs, policy)).toEqual([]);
  });

  it('suspends pinned tabs for idle time — pinning is not immortality', () => {
    const tabs = [tab('active'), tab('pin', { pinned: true, lastActiveAt: NOW - 60 * MINUTE })];
    expect(selectTabsToSuspend(tabs, policy)).toEqual(['pin']);
  });

  it('ignores tabs that are already suspended', () => {
    const tabs = [tab('active'), tab('gone', { suspended: true, lastActiveAt: 0 })];
    expect(selectTabsToSuspend(tabs, policy)).toEqual([]);
  });

  it('ignores Vela pages, which hold no page process to reclaim', () => {
    const tabs = [tab('active'), tab('newtab', { internal: true, lastActiveAt: 0 })];
    expect(selectTabsToSuspend(tabs, policy)).toEqual([]);
  });
});

describe('live tab cap', () => {
  const busy = (count: number): SuspendCandidate[] =>
    Array.from({ length: count }, (_, index) =>
      // Ascending recency: tab0 is the least recently used.
      tab(`t${String(index)}`, { lastActiveAt: NOW - (count - index) * 1000 }),
    );

  it('suspends the least recently used tabs once the cap is exceeded', () => {
    const tabs = [...busy(13), tab('active')];
    const suspended = selectTabsToSuspend(tabs, { ...policy, maxLiveTabs: 10 });

    // 14 live tabs, cap of 10, and the active one is exempt.
    expect(suspended).toEqual(['t0', 't1', 't2', 't3']);
  });

  it('does not suspend pinned tabs merely to make room', () => {
    const tabs = [
      ...busy(12).map((candidate, index) =>
        index < 3 ? { ...candidate, pinned: true } : candidate,
      ),
      tab('active'),
    ];
    const suspended = selectTabsToSuspend(tabs, { ...policy, maxLiveTabs: 10 });

    expect(suspended).not.toContain('t0');
    expect(suspended).not.toContain('t1');
    expect(suspended).not.toContain('t2');
    expect(suspended).toHaveLength(3);
  });

  it('does nothing when comfortably under the cap', () => {
    expect(selectTabsToSuspend([...busy(4), tab('active')], policy)).toEqual([]);
  });

  it('counts idle suspensions towards the cap before suspending more', () => {
    const tabs = [...busy(11), tab('stale', { lastActiveAt: NOW - 60 * MINUTE }), tab('active')];
    // 13 tabs; suspending the stale one leaves 12 live, which is the cap.
    const suspended = selectTabsToSuspend(tabs, { ...policy, maxLiveTabs: 12 });

    expect(suspended).toEqual(['stale']);
  });

  it('returns ids in strip order, not in the order it decided them', () => {
    const tabs = [
      tab('a', { lastActiveAt: NOW - 60 * MINUTE }),
      tab('b'),
      tab('c', { lastActiveAt: NOW - 60 * MINUTE }),
      tab('active'),
    ];
    expect(selectTabsToSuspend(tabs, policy)).toEqual(['a', 'c']);
  });
});
