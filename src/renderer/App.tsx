import { lazy, Suspense, useCallback, useMemo, useRef, useState, type JSX } from 'react';
import type { Settings } from '../shared/settings.js';
import { findSearchEngine } from '../shared/search-engines.js';
import type { AddressBarHandle } from './components/AddressBar.js';
import { findBookmark } from '../shared/bookmarks.js';
import { BlockedCount } from './components/BlockedCount.js';
import { BookmarksBar } from './components/BookmarksBar.js';
import { DownloadsPanel, useDownloads } from './components/DownloadsPanel.js';
import { Onboarding } from './components/Onboarding.js';
import { IconButton } from './components/IconButton.js';
import { InsecureInterstitial } from './components/InsecureInterstitial.js';
import { NewTabPage } from './components/NewTabPage.js';
import type { SidebarTool } from './components/Sidebar.js';
import { TitleBar } from './components/TitleBar.js';
import { WorkspaceRail } from './components/WorkspaceRail.js';
import { Toolbar } from './components/Toolbar.js';
import { UpdateBanner, useUpdateState } from './components/UpdateBanner.js';
import { DownloadIcon } from './components/icons.js';
import { useActiveTab, useBrowserState } from './hooks/useBrowserState.js';
import { useContentInsets } from './hooks/useContentInsets.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useOverlay } from './hooks/useOverlay.js';
import { useSettings, useThemePreference } from './hooks/useSettings.js';
import { useWindowState } from './hooks/useWindowState.js';

// Split out of the initial bundle: none of these exist until asked for, and
// keeping them out shortens the path to first paint.
const Sidebar = lazy(async () => ({ default: (await import('./components/Sidebar.js')).Sidebar }));
const SettingsPanel = lazy(async () => ({
  default: (await import('./components/SettingsPanel.js')).SettingsPanel,
}));
const PrivacyPanel = lazy(async () => ({
  default: (await import('./components/PrivacyPanel.js')).PrivacyPanel,
}));
const CommandPalette = lazy(async () => ({
  default: (await import('./components/CommandPalette.js')).CommandPalette,
}));

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
  const [downloadsOpen, setDownloadsOpen] = useState(false);

  const downloads = useDownloads();
  const activeDownloads = downloads.filter((item) => item.state === 'progressing').length;
  const bookmark = tab === null ? null : findBookmark(settings.bookmarks, tab.url);

  useContentInsets(contentRef);
  // Any of these owns the content region, so the page underneath is hidden
  // rather than left to paint over Vela's own UI.
  useOverlay(paletteOpen || settingsOpen || privacyOpen);

  const closeOverlays = useCallback(() => {
    setPaletteOpen(false);
    setSettingsOpen(false);
    setPrivacyOpen(false);
    setDownloadsOpen(false);
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
      />

      <Toolbar
        tab={tab}
        searchEngineId={settings.searchEngineId}
        bookmarked={bookmark !== null}
        onToggleBookmark={() => {
          if (tab === null) return;
          if (bookmark === null) window.vela.bookmarks.add(tab.url, tab.title);
          else window.vela.bookmarks.remove(bookmark.id);
        }}
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
              label={
                activeDownloads > 0
                  ? `Downloads — ${String(activeDownloads)} in progress`
                  : 'Downloads'
              }
              onClick={() => {
                setDownloadsOpen((open) => !open);
              }}
              className={activeDownloads > 0 ? 'text-ink' : ''}
            >
              <DownloadIcon />
            </IconButton>
          </>
        }
      />

      {settings.showBookmarksBar ? (
        <BookmarksBar bookmarks={settings.bookmarks} tabId={browser.activeTabId} />
      ) : null}

      <UpdateBanner state={update} />

      <Suspense fallback={null}>
        <div className="flex min-h-0 flex-1">
          <WorkspaceRail
            workspaces={browser.workspaces}
            activeId={browser.activeWorkspaceId}
            sidebarTool={sidebarOpen ? sidebarTool : null}
            onPickTool={(tool) => {
              // Clicking the tool you are already on closes the panel.
              if (sidebarOpen && tool === sidebarTool) setSidebarOpen(false);
              else {
                setSidebarTool(tool);
                setSidebarOpen(true);
              }
            }}
            onOpenSettings={() => {
              setSettingsOpen(true);
            }}
            onOpenPrivacy={() => {
              setPrivacyOpen(true);
            }}
          />

          {/* The page view is positioned over this element by the main process. */}
          <div
            ref={contentRef}
            data-content-region
            className="relative min-h-0 min-w-0 flex-1 bg-surface"
          >
            <ContentRegion tab={tab} settings={settings} />

            {downloadsOpen ? (
              <DownloadsPanel
                items={downloads}
                onClose={() => {
                  setDownloadsOpen(false);
                }}
              />
            ) : null}

            {settings.onboardingComplete ? null : <Onboarding settings={settings} />}

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
              hasAssistantKey={settings.assistantApiKey.trim() !== ''}
              onOpenSettings={() => {
                setSettingsOpen(true);
              }}
              onClose={() => {
                setSidebarOpen(false);
              }}
            />
          ) : null}
        </div>
      </Suspense>
    </div>
  );
}
