import { useCallback, useMemo, useRef, useState, type JSX } from 'react';
import type { Settings } from '../shared/settings.js';
import { findSearchEngine } from '../shared/search-engines.js';
import type { AddressBarHandle } from './components/AddressBar.js';
import { BlockedCount } from './components/BlockedCount.js';
import { InsecureInterstitial } from './components/InsecureInterstitial.js';
import { NewTabPage } from './components/NewTabPage.js';
import { PrivacyPanel } from './components/PrivacyPanel.js';
import { TitleBar } from './components/TitleBar.js';
import { Toolbar } from './components/Toolbar.js';
import { useActiveTab, useBrowserState } from './hooks/useBrowserState.js';
import { useContentInsets } from './hooks/useContentInsets.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useOverlay } from './hooks/useOverlay.js';
import { useSettings, useThemePreference } from './hooks/useSettings.js';
import { useWindowState } from './hooks/useWindowState.js';

/** Whatever occupies the content region when a page is not showing. */
function ContentRegion({
  tab,
  settings,
}: {
  tab: ReturnType<typeof useActiveTab>;
  settings: Settings;
}): JSX.Element | null {
  if (tab === null) return null;
  if (tab.interstitialUrl !== null) return <InsecureInterstitial tab={tab} />;
  if (tab.internal === 'newtab') {
    return (
      <NewTabPage
        tabId={tab.id}
        tiles={settings.speedDial}
        searchPlaceholder={`Search ${findSearchEngine(settings.searchEngineId).name}`}
      />
    );
  }
  return null;
}

export function App(): JSX.Element {
  const browser = useBrowserState();
  const tab = useActiveTab(browser);
  const settings = useSettings();
  const { maximized, focused } = useWindowState();
  useThemePreference(settings.theme);

  const contentRef = useRef<HTMLDivElement>(null);
  const addressRef = useRef<AddressBarHandle | null>(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  useContentInsets(contentRef);
  useOverlay(privacyOpen);

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
        privateSession={browser.privateSession}
        workspaces={browser.workspaces}
        activeWorkspaceId={browser.activeWorkspaceId}
      />

      <Toolbar
        tab={tab}
        searchEngineId={settings.searchEngineId}
        addressRef={addressRef}
        trailing={
          <BlockedCount
            tab={tab}
            onClick={() => {
              setPrivacyOpen(true);
            }}
          />
        }
      />

      {/* The page view is positioned over this element by the main process. */}
      <div ref={contentRef} className="relative min-h-0 flex-1 bg-surface">
        <ContentRegion tab={tab} settings={settings} />
        {privacyOpen ? (
          <PrivacyPanel
            onClose={() => {
              setPrivacyOpen(false);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
