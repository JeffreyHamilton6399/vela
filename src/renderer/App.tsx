import { useCallback, useMemo, useRef, type JSX } from 'react';
import { DEFAULT_SEARCH_ENGINE_ID } from '../shared/search-engines.js';
import type { AddressBarHandle } from './components/AddressBar.js';
import { NewTabPage } from './components/NewTabPage.js';
import { TitleBar } from './components/TitleBar.js';
import { Toolbar } from './components/Toolbar.js';
import { useActiveTab, useBrowserState } from './hooks/useBrowserState.js';
import { useContentInsets } from './hooks/useContentInsets.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useWindowState } from './hooks/useWindowState.js';

export function App(): JSX.Element {
  const browser = useBrowserState();
  const tab = useActiveTab(browser);
  const { maximized, focused } = useWindowState();

  const contentRef = useRef<HTMLDivElement>(null);
  const addressRef = useRef<AddressBarHandle | null>(null);

  useContentInsets(contentRef);

  const focusAddressBar = useCallback(() => {
    addressRef.current?.focus();
  }, []);
  const actions = useMemo(() => ({ focusAddressBar }), [focusAddressBar]);
  useKeyboardShortcuts(browser, actions);

  return (
    <div className="flex h-full flex-col bg-surface">
      <TitleBar
        platform={window.vela.platform}
        maximized={maximized}
        focused={focused}
        tabs={browser.tabs}
        activeTabId={browser.activeTabId}
      />
      <Toolbar tab={tab} searchEngineId={DEFAULT_SEARCH_ENGINE_ID} addressRef={addressRef} />

      {/* The page view is positioned over this element by the main process. */}
      <div ref={contentRef} className="relative min-h-0 flex-1 bg-surface">
        {tab?.internal === 'newtab' ? <NewTabPage /> : null}
      </div>
    </div>
  );
}
