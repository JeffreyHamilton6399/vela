import { randomUUID } from 'node:crypto';
import type { BrowserWindow, Session } from 'electron';
import type { BrowserState } from '../../shared/types/ipc.js';
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
import { Tab } from './tab.js';

export interface CreateTabOptions {
  url?: string;
  active?: boolean;
  openerId?: string;
  pinned?: boolean;
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
  isPrivate: boolean;
}

const MAX_CLOSED_HISTORY = 25;

/**
 * Owns every tab in one window: creation, ordering, activation, navigation,
 * and the bounds of the active `WebContentsView`.
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

  constructor(private readonly options: TabManagerOptions) {
    options.window.on('resize', () => {
      this.applyBounds();
    });
  }

  /* ----------------------------------------------------------------- */
  /* State                                                              */
  /* ----------------------------------------------------------------- */

  get state(): BrowserState {
    return {
      tabs: this.tabs.map((tab) => tab.snapshot()),
      activeTabId: this.activeId,
      privateSession: this.options.isPrivate,
    };
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
    const tab = this.tabs.find(
      (candidate) => !candidate.destroyed && candidate.webContents.id === webContentsId,
    );
    if (tab === undefined) return false;
    tab.countBlocked(1);
    this.notify();
    return true;
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

  get activeTab(): Tab | null {
    return this.tabs.find((tab) => tab.id === this.activeId) ?? null;
  }

  get count(): number {
    return this.tabs.length;
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

  /* ----------------------------------------------------------------- */
  /* Lifecycle                                                          */
  /* ----------------------------------------------------------------- */

  create(options: CreateTabOptions = {}): string {
    const tab = new Tab({
      id: randomUUID(),
      session: this.options.session,
      pinned: options.pinned ?? false,
      events: {
        onChanged: () => {
          this.notify();
        },
        onOpenInNewTab: (url, opener) => {
          this.create({ url, active: true, openerId: opener.id });
        },
        vetNavigation: (url) => this.vetNavigation(url),
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

    this.detach(tab);
    this.tabs = removeTab(this.tabs, id);
    tab.destroy();

    if (this.activeId !== id) {
      this.notify();
      return;
    }

    this.activeId = null;
    const next = nextActiveId(this.tabs, index);
    if (next !== null) {
      this.activate(next);
    } else {
      // Never leave the window without a tab.
      this.create();
    }
  }

  /** Closes everything except `id`, leaving that tab active. */
  closeOthers(id: string): void {
    for (const tab of [...this.tabs]) {
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

    this.activeId = id;
    this.attach(tab);
    this.notify();
  }

  /* ----------------------------------------------------------------- */
  /* View attachment                                                    */
  /* ----------------------------------------------------------------- */

  /** Only the active tab's view is a child of the window. */
  private attach(tab: Tab): void {
    if (this.attached === tab) {
      this.applyBounds();
      this.syncVisibility();
      return;
    }

    if (this.attached !== null) {
      this.options.window.contentView.removeChildView(this.attached.view);
    }

    this.options.window.contentView.addChildView(tab.view);
    this.attached = tab;
    this.lastBounds = null;
    this.applyBounds();
    this.syncVisibility();
  }

  private detach(tab: Tab): void {
    if (this.attached !== tab) return;
    this.options.window.contentView.removeChildView(tab.view);
    this.attached = null;
    this.lastBounds = null;
  }

  /**
   * The page is hidden — not unloaded — whenever Vela's own UI needs the
   * content region: the new tab page, or an overlay like the command palette.
   */
  private syncVisibility(): void {
    if (this.attached === null || this.disposed) return;
    const showPage = !this.attached.chromeOwnsContent && !this.overlayOpen;
    this.attached.view.setVisible(showPage);
  }

  setOverlayOpen(open: boolean): void {
    this.overlayOpen = open;
    this.syncVisibility();
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
    this.notify();
  }

  goBack(id: string): void {
    this.find(id)?.goBack();
  }

  goForward(id: string): void {
    this.find(id)?.goForward();
  }

  reload(id: string, ignoreCache: boolean): void {
    this.find(id)?.reload(ignoreCache);
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

  /** Cheap enough for every resize tick: it no-ops when nothing moved. */
  private applyBounds(): void {
    if (this.attached === null || this.disposed) return;
    if (this.options.window.isDestroyed()) return;

    const [width = 0, height = 0] = this.options.window.getContentSize();
    const bounds = computeViewBounds({ width, height }, this.insets);

    if (this.lastBounds !== null && boundsEqual(this.lastBounds, bounds)) return;
    this.lastBounds = bounds;
    this.attached.view.setBounds(bounds);
  }

  dispose(): void {
    this.disposed = true;
    for (const tab of this.tabs) tab.destroy();
    this.tabs = [];
    this.attached = null;
    this.activeId = null;
  }
}
