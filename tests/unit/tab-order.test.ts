import { describe, expect, it } from 'vitest';
import {
  indexOfTab,
  insertTab,
  moveTab,
  nextActiveId,
  removeTab,
  setPinned,
} from '../../src/main/tabs/tab-order.js';

interface T {
  id: string;
  pinned: boolean;
}

const tab = (id: string, pinned = false): T => ({ id, pinned });
const ids = (tabs: readonly T[]): string[] => tabs.map((t) => t.id);

describe('insertTab', () => {
  it('appends an unpinned tab to the end', () => {
    expect(ids(insertTab([tab('a'), tab('b')], tab('c')))).toEqual(['a', 'b', 'c']);
  });

  it('puts a tab opened from a link next to its opener', () => {
    const tabs = [tab('a'), tab('b'), tab('c')];
    expect(ids(insertTab(tabs, tab('new'), 'a'))).toEqual(['a', 'new', 'b', 'c']);
  });

  it('appends when the opener is gone', () => {
    expect(ids(insertTab([tab('a')], tab('new'), 'missing'))).toEqual(['a', 'new']);
  });

  it('keeps new unpinned tabs behind the pinned run', () => {
    const tabs = [tab('p', true), tab('a')];
    expect(ids(insertTab(tabs, tab('new')))).toEqual(['p', 'a', 'new']);
  });

  it('puts a new pinned tab at the end of the pinned run', () => {
    const tabs = [tab('p', true), tab('a')];
    expect(ids(insertTab(tabs, tab('q', true)))).toEqual(['p', 'q', 'a']);
  });
});

describe('removeTab / indexOfTab', () => {
  it('removes by id and leaves the rest in order', () => {
    expect(ids(removeTab([tab('a'), tab('b'), tab('c')], 'b'))).toEqual(['a', 'c']);
  });

  it('reports -1 for an unknown id', () => {
    expect(indexOfTab([tab('a')], 'zz')).toBe(-1);
  });
});

describe('nextActiveId', () => {
  it('takes the tab that slid into the closed slot', () => {
    expect(nextActiveId([tab('a'), tab('c')], 1)).toBe('c');
  });

  it('falls back to the tab on the left at the end of the strip', () => {
    expect(nextActiveId([tab('a'), tab('b')], 2)).toBe('b');
  });

  it('returns null when nothing is left', () => {
    expect(nextActiveId([], 0)).toBeNull();
  });
});

describe('moveTab', () => {
  it('reorders within the loose run', () => {
    const tabs = [tab('a'), tab('b'), tab('c')];
    expect(ids(moveTab(tabs, 'a', 2))).toEqual(['b', 'c', 'a']);
    expect(ids(moveTab(tabs, 'c', 0))).toEqual(['c', 'a', 'b']);
  });

  it('will not drag an unpinned tab into the pinned run', () => {
    const tabs = [tab('p', true), tab('a'), tab('b')];
    expect(ids(moveTab(tabs, 'b', 0))).toEqual(['p', 'b', 'a']);
  });

  it('will not drag a pinned tab out of the pinned run', () => {
    const tabs = [tab('p', true), tab('q', true), tab('a')];
    expect(ids(moveTab(tabs, 'p', 5))).toEqual(['q', 'p', 'a']);
  });

  it('is a no-op for an unknown id or an unchanged position', () => {
    const tabs = [tab('a'), tab('b')];
    expect(ids(moveTab(tabs, 'zz', 0))).toEqual(['a', 'b']);
    expect(ids(moveTab(tabs, 'a', 0))).toEqual(['a', 'b']);
  });
});

describe('setPinned', () => {
  const apply = (t: T, pinned: boolean): T => ({ ...t, pinned });

  it('moves a pinned tab to the end of the pinned run', () => {
    const tabs = [tab('p', true), tab('a'), tab('b')];
    expect(ids(setPinned(tabs, 'b', true, apply))).toEqual(['p', 'b', 'a']);
  });

  it('moves an unpinned tab to the front of the loose run', () => {
    const tabs = [tab('p', true), tab('q', true), tab('a')];
    expect(ids(setPinned(tabs, 'q', false, apply))).toEqual(['p', 'q', 'a']);
  });

  it('is a no-op when the state already matches', () => {
    const tabs = [tab('a'), tab('b')];
    expect(ids(setPinned(tabs, 'a', false, apply))).toEqual(['a', 'b']);
  });
});
