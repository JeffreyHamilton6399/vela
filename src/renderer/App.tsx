import { lazy, Suspense, useCallback, useMemo, useRef, useState, type JSX } from 'react';
import type { Settings } from '../shared/settings.js';
import { findSearchEngine } from '../shared/search-engines.js';
import type { AddressBarHandle } from './components/AddressBar.js';
import { findBookmark } from '../shared/bookmarks.js';
import { BlockedCount } from './components/BlockedCount.js';
import { BookmarksBar } from './components/BookmarksBar.js';
import { useDownloads } from './components/DownloadsPanel.js';
import { Onboarding } from './components/Onboarding.js';
import { IconButton } from './components/IconButton.js';
import { InsecureInterstitial } from './components/InsecureInterstitial.js';
import { NewTabPage } from './components/NewTabPage.js';
import type { SidebarTool } from './components/Sidebar.js';
import type { SettingsCategoryId } from './components/SettingsPanel.js';
import { TitleBar } from './components/TitleBar.js';
import { WorkspaceRail } from './components/WorkspaceRail.js';
import { Toolbar } from './components/Toolbar.js';
import { SignInRejectedBanner } from './components/SignInRejectedBanner.js';
import { UpdateBanner, useUpdateState } from './components/UpdateBanner.js';
import { SaveLoginPrompt, useCapturedLogin } from './components/SaveLoginPrompt.js';
import { CloseIcon, DownloadIcon } from './components/icons.js';
import { SIDEBAR_FRAME } from './components/sidebar-frame.js';
import { usePanelBounds } from './hooks/usePanelBounds.js';
import { useActiveTab, useBrowserState } from './hooks/useBrowserState.js';
import { useContentInsets } from './hooks/useContentInsets.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useOverlay } from './hooks/useOverlay.js';
import { useSettings, useThemePreference } from './hooks/useSettings.js';
import { useWindowState } from './hooks/useWindowState.js';

// Split out of the initial bundle: none of these exist until asked for, and
// keeping them out shortens the path to first paint.
//
// Each one gets its own Suspense boundary, right where it is used. A single
// boundary around the whole window looks tidier and is a bug: React hides
// everything inside a boundary while anything in it is still loading, so the
// first click on Notes took the rail, the toolbar and the page region with it —
// the content region measured 0×0, the page view was resized to nothing, and
// the window went blank for as long as the chunk took to arrive. Nothing that
// is already on screen belongs inside a boundary that something new can suspend.
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
  const [captured, setCaptured] = useCapturedLogin();
  useThemePreference(settings.theme);

  const contentRef = useRef<HTMLDivElement>(null);
  const addressRef = useRef<AddressBarHandle | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTool, setSidebarTool] = useState<SidebarTool>('notes');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategoryId>('general');
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [openPanelId, setOpenPanelId] = useState<string | null>(null);
  const [addingPanel, setAddingPanel] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  const downloads = useDownloads();
  const activeDownloads = downloads.filter((item) => item.state === 'progressing').length;
  const bookmark = tab === null ? null : findBookmark(settings.bookmarks, tab.url);

  useContentInsets(contentRef);
  usePanelBounds(sidebarRef, openPanelId !== null);
  // Any of these owns the content region, so the page underneath is hidden
  // rather than left to paint over Vela's own UI. What comes back is a still
  // of the page, so a dialog's scrim has something to be translucent against.
  const pageBehind = useOverlay(paletteOpen || settingsOpen || privacyOpen);

  const openSettings = useCallback((category: SettingsCategoryId = 'general') => {
    setSettingsCategory(category);
    setSettingsOpen(true);
  }, []);

  const closeOverlays = useCallback(() => {
    setPaletteOpen(false);
    setSettingsOpen(false);
    setPrivacyOpen(false);
    // The bubble is main's to close: it lives in its own view over the page.
    window.vela.downloads.closePopup();
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
        openSettings();
      },
      closeOverlays,
    }),
    [closeOverlays, openSettings],
  );
  useKeyboardShortcuts(browser, actions);

  return (
    <div className="flex h-full flex-col bg-surface">
      <TitleBar
        platform={window.vela.platform}
        maximized={maximized}
        focused={focused}
        key={browser.activeWorkspaceId}
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
              // The bubble lives in its own view over the page, so main owns
              // whether it is up; see download-popup.ts.
              onClick={() => {
                window.vela.downloads.togglePopup();
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

      <SignInRejectedBanner tab={tab} />

      <SaveLoginPrompt
        captured={captured}
        onResolved={() => {
          setCaptured(null);
        }}
      />

      <div className="flex min-h-0 flex-1">
        <WorkspaceRail
          workspaces={browser.workspaces}
          activeId={browser.activeWorkspaceId}
          sidebarTool={sidebarOpen && openPanelId === null ? sidebarTool : null}
          panels={settings.webPanels}
          openPanelId={openPanelId}
          onPickPanel={(id) => {
            if (openPanelId === id) {
              setOpenPanelId(null);
              setSidebarOpen(false);
              window.vela.panels.close();
              return;
            }
            setOpenPanelId(id);
            setSidebarOpen(true);
            window.vela.panels.open(id);
          }}
          onAddPanel={() => {
            setAddingPanel(true);
            setOpenPanelId(null);
            setSidebarTool('panels');
            setSidebarOpen(true);
            window.vela.panels.close();
          }}
          onPickTool={(tool) => {
            setOpenPanelId(null);
            window.vela.panels.close();
            // Clicking the tool you are already on closes the panel.
            if (sidebarOpen && openPanelId === null && tool === sidebarTool) {
              setSidebarOpen(false);
            } else {
              setSidebarTool(tool);
              setSidebarOpen(true);
            }
          }}
          onOpenSettings={() => {
            openSettings();
          }}
        />

        {/*
          The page view is positioned over this element by the main process.

          The margin is the whole of the "floating card" look: it is what the
          inset measurement reports, so the page view lands inside it and the
          chrome colour shows through around three of its edges. The fourth is
          the tab strip, which the active tab joins onto — the page and its tab
          are one surface, which is the point of the shape.
        */}
        <div
          ref={contentRef}
          data-content-region
          className="relative mr-[6px] mb-[6px] min-h-0 min-w-0 flex-1 rounded-[var(--page-radius)] bg-raised shadow-[0_1px_4px_rgb(0_0_0/0.08)]"
        >
          <ContentRegion tab={tab} settings={settings} />

          {/* The page as it was a moment ago, for a dialog to sit on. Purely
              decorative, and never interactive: the real page is hidden
              behind it and comes straight back when the dialog closes. */}
          {pageBehind === null ? null : (
            <img
              src={pageBehind}
              alt=""
              aria-hidden
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover object-top select-none"
            />
          )}

          {settings.onboardingComplete ? null : <Onboarding settings={settings} />}

          {/* Nothing to show while a dialog's chunk loads: it arrives over the
              page, so an empty frame would be worse than a beat of nothing. */}
          <Suspense fallback={null}>
            {settingsOpen ? (
              <SettingsPanel
                settings={settings}
                initialCategory={settingsCategory}
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
                  openSettings();
                }}
                onToggleSidebar={() => {
                  setSidebarOpen((open) => !open);
                }}
              />
            ) : null}
          </Suspense>
        </div>

        {sidebarOpen && openPanelId !== null ? (
          <aside
            ref={sidebarRef}
            aria-label="Web panel"
            className="mr-[6px] mb-[6px] ml-[6px] flex w-[340px] shrink-0 flex-col overflow-hidden rounded-[var(--page-radius)] bg-raised shadow-[0_1px_4px_rgb(0_0_0/0.08)]"
          >
            <div className="flex h-5 shrink-0 items-center justify-between gap-1 border-b border-line px-2">
              <span className="truncate text-[13px] font-semibold text-ink">
                {settings.webPanels.find((panel) => panel.id === openPanelId)?.title ?? 'Panel'}
              </span>
              <button
                type="button"
                aria-label="Close panel"
                onClick={() => {
                  setOpenPanelId(null);
                  setSidebarOpen(false);
                  window.vela.panels.close();
                }}
                className="focus-ring flex h-4 w-4 items-center justify-center rounded-lg text-ink-muted hover:bg-hover hover:text-ink"
              >
                <CloseIcon width={11} height={11} />
              </button>
            </div>
            {/* The docked site is a WebContentsView, positioned over this. */}
            <div className="min-h-0 flex-1" />
          </aside>
        ) : null}

        {/* The fallback is the sidebar's own footprint, so the page region is
            the width it is about to be and the page view is positioned once
            rather than twice. */}
        <Suspense fallback={<div aria-hidden className={SIDEBAR_FRAME} />}>
          {sidebarOpen && openPanelId === null ? (
            <Sidebar
              tool={sidebarTool}
              notes={settings.notes}
              panels={settings.webPanels}
              addingPanel={addingPanel}
              onAddPanelDone={() => {
                setAddingPanel(false);
              }}
              // The only thing in the sidebar that asks for Settings is the
              // assistant, and what it is asking for is the model picker.
              onOpenSettings={() => {
                openSettings('assistant');
              }}
              onClose={() => {
                setSidebarOpen(false);
                setAddingPanel(false);
              }}
            />
          ) : null}
        </Suspense>
      </div>
    </div>
  );
}
