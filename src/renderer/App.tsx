import { useCallback, useMemo, useRef, useState, type JSX } from 'react';
import type { Settings } from '../shared/settings.js';
import { findSearchEngine } from '../shared/search-engines.js';
import type { AddressBarHandle } from './components/AddressBar.js';
import { BlockedCount } from './components/BlockedCount.js';
import { CommandPalette } from './components/CommandPalette.js';
import { IconButton } from './components/IconButton.js';
import { InsecureInterstitial } from './components/InsecureInterstitial.js';
import { NewTabPage } from './components/NewTabPage.js';
import { PrivacyPanel } from './components/PrivacyPanel.js';
import { SettingsPanel } from './components/SettingsPanel.js';
import { Sidebar, type SidebarTool } from './components/Sidebar.js';
import { TitleBar } from './components/TitleBar.js';
import { Toolbar } from './components/Toolbar.js';
import { UpdateBanner, useUpdateState } from './components/UpdateBanner.js';
import { SettingsIcon, SidebarIcon } from './components/icons.js';
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
  const update = useUpdateState();
  useThemePreference(settings.theme);

  const contentRef = useRef<HTMLDivElement>(null);
  const addressRef = useRef<AddressBarHandle | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTool, setSidebarTool] = useState<SidebarTool>('notes');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  useContentInsets(contentRef);
  // Any of these owns the content region, so the page underneath is hidden
  // rather than left to paint over Vela's own UI.
  useOverlay(paletteOpen || settingsOpen || privacyOpen);

  const closeOverlays = useCallback(() => {
    setPaletteOpen(false);
    setSettingsOpen(false);
    setPrivacyOpen(false);
  }, []);

  const actions = useMemo(
    () => ({
      focusAddressBar: () => addressRef.current?.focus(),
      togglePalette: () => {
        setPaletteOpen((open) => !open);
      },
      toggleSidebar: () => {
        setSidebarOpen((open) => !open);
      },
      openSettings: () => {
        setSettingsOpen(true);
      },
      closeOverlays,
    }),
    [closeOverlays],
  );
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
          <>
            <BlockedCount
              tab={tab}
              onClick={() => {
                setPrivacyOpen(true);
              }}
            />
            <IconButton
              label="Toggle sidebar"
              onClick={() => {
                setSidebarOpen((open) => !open);
              }}
            >
              <SidebarIcon />
            </IconButton>
            <IconButton
              label="Settings"
              onClick={() => {
                setSettingsOpen(true);
              }}
            >
              <SettingsIcon />
            </IconButton>
          </>
        }
      />

      <UpdateBanner state={update} />

      <div className="flex min-h-0 flex-1">
        {/* The page view is positioned over this element by the main process. */}
        <div
          ref={contentRef}
          data-content-region
          className="relative min-h-0 min-w-0 flex-1 bg-surface"
        >
          <ContentRegion tab={tab} settings={settings} />

          {settingsOpen ? (
            <SettingsPanel
              settings={settings}
              onClose={() => {
                setSettingsOpen(false);
              }}
            />
          ) : null}

          {privacyOpen ? (
            <PrivacyPanel
              onClose={() => {
                setPrivacyOpen(false);
              }}
            />
          ) : null}

          {paletteOpen ? (
            <CommandPalette
              browser={browser}
              onClose={() => {
                setPaletteOpen(false);
              }}
              onOpenSettings={() => {
                setSettingsOpen(true);
              }}
              onToggleSidebar={() => {
                setSidebarOpen((open) => !open);
              }}
            />
          ) : null}
        </div>

        {sidebarOpen ? (
          <Sidebar
            tool={sidebarTool}
            notes={settings.notes}
            onSelect={setSidebarTool}
            onClose={() => {
              setSidebarOpen(false);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
