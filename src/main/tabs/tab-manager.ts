import { randomUUID } from 'node:crypto';
import { shell, type BrowserWindow, type ContextMenuParams, type Session } from 'electron';
import type { BrowserState } from '../../shared/types/ipc.js';
import type { Workspace } from '../../shared/settings.js';
import { resolveAddressInput } from '../../shared/address-input.js';
import { decideHttpsUpgrade } from '../privacy/policies.js';
import {
  boundsEqual,
  computeViewBounds,
  ZERO_INSETS,
  type Bounds,
  type ContentInsets,
} from './layout.js';
import { indexOfTab, insertTab, moveTab, nextActiveId, removeTab, setPinned } from './tab-order.js';
import { selectTabsToSuspend } from './suspension.js';
import { configurePopup } from './popup-window.js';
import { externalUrlForRejection } from './rejection.js';
import { Tab } from './tab.js';

export interface CreateTabOptions {
  url?: string;
  active?: boolean;
  openerId?: string;
  pinned?: boolean;
  workspaceId?: string;
}

export interface TabManagerOptions {
  window: BrowserWindow;
  session: Session;
  /** Called whenever the tab strip needs redrawing. Already coalesced. */
  onStateChanged: (state: BrowserState) => void;
  /** Read lazily so a settings change applies without a restart. */
  getSearchEngineId: () => string;
  getHttpsPolicy: () => { enabled: boolean; allowlist: readonly string[] };
  /** Records the user's decision to accept plain http for a host. */
  allowHttpHost: (host: string) => void;
  /** Turns a page's remote icon into a locally cached data URL. */
  resolveFavicon: (pageUrl: string, iconUrl: string) => Promise<string | null>;
  getWorkspaces: () => readonly Workspace[];
  setWorkspaces: (workspaces: Workspace[], activeId: string) => void;
  getIdleMinutes: () => number;
  /** Records a visit. A private window passes a no-op.  */
  recordVisit: (url: string, title: string) => void;
  /** A tab whose DOM is ready. Login autofill hangs off this. */
  onPageReady: (tab: Tab) => void;
  /** A right-click inside a page, with what was under the pointer. */
  onPageContextMenu: (tab: Tab, params: ContextMenuParams) => void;
  /** Chromium zoom level remembered for a host, or 0. */
  getZoomForHost: (host: string) => number;
  setZoomForHost: (host: string, level: number) => void;
  /** The page region moved, for anything else that has to float over it. */
  onContentBounds?: () => void;
  isPrivate: boolean;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
}

const MAX_CLOSED_HISTORY = 25;
/** Roughly how many renderer processes to keep alive at once. */
const MAX_LIVE_TABS = 10;
const SUSPEND_TICK_MS = 30_000;

/**
 * Owns every tab in one window: creation, ordering, activation, navigation,
 * workspaces, suspension, and the bounds of the active `WebContentsView`.
 */
export class TabManager {
  private tabs: Tab[] = [];
  private activeId: string | null = null;
  private attached: Tab | null = null;
  private insets: ContentInsets = ZERO_INSETS;
  private lastBounds: Bounds | null = null;
  private closedUrls: string[] = [];
  private notifyScheduled = false;
  private overlayOpen = false;
  private disposed = false;
  private activeWorkspaceId: string;
  private readonly suspendTimer: NodeJS.Timeout;

  constructor(private readonly options: TabManagerOptions) {
    this.activeWorkspaceId = options.getWorkspaces()[0]?.id ?? 'default';

    options.window.on('resize', () => {
      this.applyBounds();
    });

    this.suspendTimer = setInterval(() => {
      this.suspendIdleTabs();
    }, SUSPEND_TICK_MS);
    // A housekeeping timer must never hold the process open by itself.
    this.suspendTimer.unref();
  }

  /* ----------------------------------------------------------------- */
  /* State                                                              */
  /* ----------------------------------------------------------------- */

  /** Only the active workspace's tabs are in the strip. */
  private get visibleTabs(): Tab[] {
    return this.tabs.filter((tab) => tab.workspaceId === this.activeWorkspaceId);
  }

  get state(): BrowserState {
    const workspaces = this.options.getWorkspaces();

    return {
      tabs: this.visibleTabs.map((tab) => tab.snapshot()),
      activeTabId: this.activeId,
      privateSession: this.options.isPrivate,
      activeWorkspaceId: this.activeWorkspaceId,
      workspaces: workspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        tabCount: this.tabs.filter((tab) => tab.workspaceId === workspace.id).length,
      })),
    };
  }

  get activeTab(): Tab | null {
    return this.tabs.find((tab) => tab.id === this.activeId) ?? null;
  }

  get count(): number {
    return this.visibleTabs.length;
  }

  get hasClosedTabs(): boolean {
    return this.closedUrls.length > 0;
  }

  find(id: string): Tab | null {
    return this.tabs.find((tab) => tab.id === id) ?? null;
  }

  /** Coalesces bursts of page events into one message to the renderer. */
  private notify(): void {
    if (this.notifyScheduled || this.disposed) return;
    this.notifyScheduled = true;
    setImmediate(() => {
      this.notifyScheduled = false;
      if (this.disposed) return;
      this.options.onStateChanged(this.state);
      this.syncVisibility();
    });
  }

  /**
   * Applies the https policy to a navigation. Returns null to let it proceed
   * untouched, so the caller can tell "no change" from "upgraded".
   */
  private vetNavigation(url: string): { url: string } | { interstitial: string } | null {
    const decision = decideHttpsUpgrade(url, this.options.getHttpsPolicy());
    switch (decision.action) {
      case 'upgrade':
        return { url: decision.url };
      case 'interstitial':
        return { interstitial: decision.url };
      default:
        return null;
    }
  }

  /** Attributes a blocked request to its tab. Returns false if it had none. */
  countBlocked(webContentsId: number): boolean {
    const tab = this.tabs.find((candidate) => candidate.webContents?.id === webContentsId);
    if (tab === undefined) return false;
    tab.countBlocked(1);
    this.notify();
    return true;
  }

  /**
   * Hands a tab's address to the machine's default browser.
   *
   * The escape hatch for a site that will not accept Vela: the page opens
   * somewhere it is accepted rather than nowhere at all. https only — this
   * leaves Vela's process entirely, so the scheme is not negotiable.
   */
  openExternally(id: string): void {
    const tab = this.find(id);
    if (tab === null) return;
    if (!tab.url.startsWith('https://')) return;

    // On a refusal page, the address itself is not what to hand over: its
    // query is single-use and another browser gets a 400 for it.
    const target =
      tab.signInRejectedBy === null ? tab.url : (externalUrlForRejection(tab.url) ?? tab.url);
    void shell.openExternal(target);
  }

  /** Accepts the plain-http warning for this tab's host and loads the page. */
  continueInsecure(id: string): void {
    const tab = this.find(id);
    if (tab === null) return;
    const pending = tab.pendingInsecureUrl;
    if (pending === null) return;

    try {
      this.options.allowHttpHost(new URL(pending).host);
    } catch {
      return;
    }
    tab.loadUrlUnchecked(pending);
    this.notify();
  }

  /* ----------------------------------------------------------------- */
  /* Lifecycle                                                          */
  /* ----------------------------------------------------------------- */

  create(options: CreateTabOptions = {}): string {
    const tab: Tab = new Tab({
      id: randomUUID(),
      session: this.options.session,
      pinned: options.pinned ?? false,
      workspaceId: options.workspaceId ?? this.activeWorkspaceId,
      events: {
        onChanged: () => {
          this.notify();
        },
        onOpenInNewTab: (url, opener) => {
          this.create({ url, active: true, openerId: opener.id });
        },
        onOpenPopup: (popup, opened) => {
          configurePopup(popup, {
            opened,
            vetNavigation: (url) => this.vetNavigation(url),
            openInNewTab: (url) => {
              this.create({ url, active: true });
            },
          });
        },
        vetNavigation: (url) => this.vetNavigation(url),
        onNavigated: (navigated) => {
          this.applyStoredZoom(navigated);
          this.options.recordVisit(navigated.url, navigated.snapshot().title);
        },
        onDomReady: (ready) => {
          this.options.onPageReady(ready);
        },
        onContextMenu: (clicked, params) => {
          this.options.onPageContextMenu(clicked, params);
        },
        resolveFavicon: (pageUrl, iconUrl) => {
          void this.options.resolveFavicon(pageUrl, iconUrl).then((dataUrl) => {
            // The tab may have navigated on while the icon downloaded.
            if (dataUrl !== null && tab.url === pageUrl) tab.setCachedFavicon(dataUrl);
          });
        },
      },
    });

    this.tabs =
      options.openerId === undefined
        ? insertTab(this.tabs, tab)
        : insertTab(this.tabs, tab, options.openerId);

    if (options.url !== undefined && options.url !== '') {
      tab.loadUrl(options.url);
    }

    if (options.active !== false || this.activeId === null) {
      this.activate(tab.id);
    } else {
      this.notify();
    }

    return tab.id;
  }

  close(id: string): void {
    const index = indexOfTab(this.tabs, id);
    if (index === -1) return;
    const tab = this.tabs.at(index);
    if (tab === undefined) return;

    if (tab.internal === null && tab.url !== '' && tab.url !== 'about:blank') {
      this.closedUrls.push(tab.url);
      if (this.closedUrls.length > MAX_CLOSED_HISTORY) this.closedUrls.shift();
    }

    const visibleIndex = indexOfTab(this.visibleTabs, id);
    this.detach(tab);
    this.tabs = removeTab(this.tabs, id);
    tab.destroy();

    if (this.activeId !== id) {
      this.notify();
      return;
    }

    this.activeId = null;
    const next = nextActiveId(this.visibleTabs, visibleIndex);
    if (next !== null) {
      this.activate(next);
    } else {
      // Never leave a workspace without a tab.
      this.create();
    }
  }

  /** Closes everything except `id` in the same workspace. */
  closeOthers(id: string): void {
    for (const tab of [...this.visibleTabs]) {
      if (tab.id !== id) this.close(tab.id);
    }
    this.activate(id);
  }

  /** Opens the same page in a new tab beside this one. */
  duplicate(id: string): void {
    const tab = this.find(id);
    if (tab === null) return;
    if (tab.internal !== null) {
      this.create({ openerId: id });
      return;
    }
    this.create({ url: tab.url, openerId: id });
  }

  /** Reopens the most recently closed tab. */
  restoreClosed(): void {
    const url = this.closedUrls.pop();
    if (url === undefined) return;
    this.create({ url, active: true });
  }

  activate(id: string): void {
    const tab = this.find(id);
    if (tab === null) return;

    // Activating a tab in another workspace switches to that workspace.
    if (tab.workspaceId !== this.activeWorkspaceId) {
      this.activeWorkspaceId = tab.workspaceId;
    }

    this.activeId = id;
    tab.lastActiveAt = Date.now();
    if (tab.suspended) tab.resume();

    this.attach(tab);
    this.notify();
  }

  /* ----------------------------------------------------------------- */
  /* Workspaces                                                         */
  /* ----------------------------------------------------------------- */

  createWorkspace(name: string): void {
    const workspaces = [...this.options.getWorkspaces(), { id: randomUUID(), name }];
    const created = workspaces.at(-1);
    if (created === undefined) return;

    this.options.setWorkspaces(workspaces, created.id);
    this.activateWorkspace(created.id);
  }

  renameWorkspace(id: string, name: string): void {
    const workspaces = this.options
      .getWorkspaces()
      .map((workspace) => (workspace.id === id ? { ...workspace, name } : workspace));
    this.options.setWorkspaces(workspaces, this.activeWorkspaceId);
    this.notify();
  }

  /** Deleting a workspace closes its tabs. The last workspace cannot go. */
  deleteWorkspace(id: string): void {
    const workspaces = this.options.getWorkspaces();
    if (workspaces.length <= 1) return;

    for (const tab of this.tabs.filter((candidate) => candidate.workspaceId === id)) {
      this.detach(tab);
      this.tabs = removeTab(this.tabs, tab.id);
      tab.destroy();
    }

    const remaining = workspaces.filter((workspace) => workspace.id !== id);
    const next = remaining[0];
    if (next === undefined) return;

    this.options.setWorkspaces(remaining, next.id);
    if (this.activeWorkspaceId === id) this.activateWorkspace(next.id);
    else this.notify();
  }

  /**
   * Switches workspace. Everything left behind is suspended, which is the
   * point: an inactive workspace should not cost a renderer process.
   */
  activateWorkspace(id: string): void {
    if (this.options.getWorkspaces().every((workspace) => workspace.id !== id)) return;

    const leaving = this.activeWorkspaceId;
    this.activeWorkspaceId = id;
    this.options.setWorkspaces([...this.options.getWorkspaces()], id);

    if (leaving !== id) {
      for (const tab of this.tabs.filter((candidate) => candidate.workspaceId === leaving)) {
        tab.suspend();
      }
    }

    const target = this.visibleTabs.find((tab) => tab.id === this.activeId) ?? this.visibleTabs[0];
    if (target === undefined) {
      this.activeId = null;
      if (this.attached !== null) this.detach(this.attached);
      this.create({ workspaceId: id });
      return;
    }

    this.activate(target.id);
  }

  /** Moves a tab into another workspace, suspending it if it is leaving view. */
  moveToWorkspace(id: string, workspaceId: string): void {
    const tab = this.find(id);
    if (tab === null) return;
    if (this.options.getWorkspaces().every((workspace) => workspace.id !== workspaceId)) return;

    tab.workspaceId = workspaceId;

    if (workspaceId !== this.activeWorkspaceId) {
      this.detach(tab);
      tab.suspend();
      if (this.activeId === id) {
        const next = this.visibleTabs[0];
        this.activeId = null;
        if (next === undefined) this.create();
        else this.activate(next.id);
        return;
      }
    }

    this.notify();
  }

  /* ----------------------------------------------------------------- */
  /* Suspension                                                         */
  /* ----------------------------------------------------------------- */

  /** Runs on a timer and after activations; safe to call at any time. */
  suspendIdleTabs(now = Date.now()): void {
    if (this.disposed) return;

    const ids = selectTabsToSuspend(
      this.tabs.map((tab) => ({
        id: tab.id,
        suspended: tab.suspended,
        pinned: tab.pinned,
        lastActiveAt: tab.lastActiveAt,
        internal: tab.internal !== null,
      })),
      {
        activeId: this.activeId,
        now,
        idleMillis: this.options.getIdleMinutes() * 60_000,
        maxLiveTabs: MAX_LIVE_TABS,
      },
    );

    if (ids.length === 0) return;
    for (const id of ids) this.find(id)?.suspend();
    this.notify();
  }

  /* ----------------------------------------------------------------- */
  /* View attachment                                                    */
  /* ----------------------------------------------------------------- */

  /** Only the active tab's view is a child of the window. */
  private attach(tab: Tab): void {
    const view = tab.ensureView();

    if (this.attached === tab && this.lastBounds !== null) {
      this.applyBounds();
      this.syncVisibility();
      return;
    }

    if (this.attached !== null && this.attached !== tab) {
      const previous = this.attached.view;
      if (previous !== null) this.options.window.contentView.removeChildView(previous);
    }

    this.options.window.contentView.addChildView(view);
    this.attached = tab;
    this.lastBounds = null;
    this.applyBounds();
    this.syncVisibility();
  }

  private detach(tab: Tab): void {
    if (this.attached !== tab) return;
    const view = tab.view;
    if (view !== null) this.options.window.contentView.removeChildView(view);
    this.attached = null;
    this.lastBounds = null;
  }

  /**
   * The page is hidden — not unloaded — whenever Vela's own UI needs the
   * content region: the new tab page, an interstitial, or an overlay.
   */
  private syncVisibility(): void {
    if (this.attached === null || this.disposed) return;
    const view = this.attached.view;
    if (view === null) return;
    view.setVisible(!this.attached.chromeOwnsContent && !this.overlayOpen);
  }

  setOverlayOpen(open: boolean): void {
    this.overlayOpen = open;
    this.syncVisibility();
  }

  /**
   * Hides the page for an overlay and hands back a still of it.
   *
   * A dialog that covers the content region has to hide the page — a
   * `WebContentsView` paints above the window's own contents, so a translucent
   * scrim over a live page is not something the compositor will give us here.
   * Photographing the page first means the scrim still has something to be
   * translucent against, instead of a flat sheet of the surface colour.
   *
   * The still is only ever a still. Nothing behind a modal is going anywhere,
   * and it sits under a blur, so a frozen frame reads no differently.
   */
  async openOverlay(open: boolean): Promise<string | null> {
    if (!open) {
      this.setOverlayOpen(false);
      return null;
    }

    const snapshot = await this.capturePage();
    this.setOverlayOpen(true);
    return snapshot;
  }

  /** A PNG data URL of the page as it stands, or null if there is no page. */
  private async capturePage(): Promise<string | null> {
    const tab = this.attached;
    if (tab === null || tab.chromeOwnsContent) return null;

    const contents = tab.webContents;
    if (contents === null) return null;

    try {
      const image = await contents.capturePage();
      if (image.isEmpty()) return null;
      // Downscaled hard: it is going behind a blur and a 70% scrim, so the
      // pixels are wasted and the data URL would otherwise be enormous.
      return image.resize({ width: 480, quality: 'good' }).toDataURL();
    } catch {
      // A page that cannot be photographed simply does not get a backdrop.
      return null;
    }
  }

  /* ----------------------------------------------------------------- */
  /* Ordering                                                           */
  /* ----------------------------------------------------------------- */

  move(id: string, toIndex: number): void {
    this.tabs = moveTab(this.tabs, id, toIndex);
    this.notify();
  }

  setPinned(id: string, pinned: boolean): void {
    this.tabs = setPinned(this.tabs, id, pinned, (tab, next) => {
      tab.pinned = next;
      return tab;
    });
    this.notify();
  }

  /* ----------------------------------------------------------------- */
  /* Navigation                                                         */
  /* ----------------------------------------------------------------- */

  navigate(id: string, input: string): void {
    const tab = this.find(id);
    if (tab === null) return;

    const intent = resolveAddressInput(input, this.options.getSearchEngineId());
    if (intent.kind === 'empty') return;

    tab.loadUrl(intent.url);
    if (this.activeId === id) this.attach(tab);
    this.notify();
  }

  /* ----------------------------------------------------------------- */
  /* Zoom                                                               */
  /* ----------------------------------------------------------------- */

  /** Steps the zoom for this tab and remembers it for the whole host. */
  setZoom(id: string, direction: 'in' | 'out' | 'reset'): void {
    const tab = this.find(id);
    if (tab === null) return;

    const current = tab.zoomLevelValue;
    const next =
      direction === 'reset'
        ? 0
        : Math.min(9, Math.max(-8, current + (direction === 'in' ? 1 : -1)));

    tab.applyZoomLevel(next);

    const host = hostOf(tab.url);
    if (host !== null) this.options.setZoomForHost(host, next);
    this.notify();
  }

  /** Restores the zoom the user last chose for this host. */
  private applyStoredZoom(tab: Tab): void {
    const host = hostOf(tab.url);
    const level = host === null ? 0 : this.options.getZoomForHost(host);
    if (level !== tab.zoomLevelValue) tab.applyZoomLevel(level);
  }

  goBack(id: string): void {
    this.find(id)?.goBack();
  }

  goForward(id: string): void {
    this.find(id)?.goForward();
  }

  reload(id: string, ignoreCache: boolean): void {
    const tab = this.find(id);
    if (tab === null) return;
    tab.reload(ignoreCache);
    if (this.activeId === id) this.attach(tab);
  }

  stop(id: string): void {
    this.find(id)?.stop();
  }

  showNewTabPage(id: string): void {
    this.find(id)?.showNewTabPage();
  }

  /* ----------------------------------------------------------------- */
  /* Layout                                                             */
  /* ----------------------------------------------------------------- */

  setInsets(insets: ContentInsets): void {
    this.insets = insets;
    this.applyBounds();
  }

  /** The rectangle the page occupies, whether or not a page is in it. */
  get contentBounds(): Bounds {
    const [width = 0, height = 0] = this.options.window.getContentSize();
    return computeViewBounds({ width, height }, this.insets);
  }

  /** Cheap enough for every resize tick: it no-ops when nothing moved. */
  private applyBounds(): void {
    if (this.disposed || this.options.window.isDestroyed()) return;

    // Anything else anchored to the page — the downloads bubble — tracks the
    // same rectangle, so it is told even while no tab is attached.
    this.options.onContentBounds?.();

    if (this.attached === null) return;
    const bounds = this.contentBounds;
    const view = this.attached.view;
    if (view === null) return;

    if (this.lastBounds !== null && boundsEqual(this.lastBounds, bounds)) return;
    this.lastBounds = bounds;
    view.setBounds(bounds);
  }

  dispose(): void {
    this.disposed = true;
    clearInterval(this.suspendTimer);
    for (const tab of this.tabs) tab.destroy();
    this.tabs = [];
    this.attached = null;
    this.activeId = null;
  }
}
