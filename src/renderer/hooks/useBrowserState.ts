import { useEffect, useMemo, useState } from 'react';
import type { BrowserState, TabSnapshot } from '../../shared/types/ipc.js';

const EMPTY: BrowserState = { tabs: [], activeTabId: null };

export function useBrowserState(): BrowserState {
  const [state, setState] = useState<BrowserState>(EMPTY);

  useEffect(() => {
    let active = true;

    void window.vela.tabs.getState().then((next) => {
      if (active) setState(next);
    });

    const unsubscribe = window.vela.tabs.onStateChanged(setState);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return state;
}

export function useActiveTab(state: BrowserState): TabSnapshot | null {
  return useMemo(
    () => state.tabs.find((tab) => tab.id === state.activeTabId) ?? null,
    [state.tabs, state.activeTabId],
  );
}
