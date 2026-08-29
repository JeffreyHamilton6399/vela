import {
  WebContentsView,
  type BrowserWindow,
  type ContextMenuParams,
  type Session,
} from 'electron';
import type { TabSnapshot } from '../../shared/types/ipc.js';
import { PAGE_RADIUS } from './layout.js';
import { REQUIRED_WEB_PREFERENCES } from '../window-options.js';
import {
  applyBrowserSurface,
  applyWebRtcPolicy,
  releaseBrowserSurface,
  type BrowserSurface,
  type PopupNavigation,
} from '../privacy/session-hardening.js';
import { allowPopup, isPopupDisposition } from './popup-window.js';
import { detectSignInRejection } from './rejection.js';

export interface TabEvents {
  /** Any change worth redrawing the tab strip for. */
  onChanged: (tab: Tab) => void;
  /** A link that asked for a new tab (target=_blank, plain window.open). */
  onOpenInNewTab: (url: string, opener: Tab) => void;
  /**
   * A sized `window.open`, which is what a sign-in popup looks like. The
   * details come along because the popup's navigation has to be re-issued
   * behind its browser surface, and it cannot be re-issued without them.
   */
  onOpenPopup: (window: BrowserWindow, opened: PopupNavigation) => void;
  /** Resolves a locally cached icon for a page; remote icons never reach the UI. */
  resolveFavicon: (pageUrl: string, iconUrl: string) => void;
  /** A completed top-level navigation: history and per-host zoom hang off this. */
  onNavigated: (tab: Tab) => void;
  /** The page's DOM is ready. Login autofill hangs off this. */
  onDomReady: (tab: Tab) => void;
  /** A right-click inside the page, with what was under the pointer. */
  onContextMenu: (tab: Tab, params: ContextMenuParams) => void;
  /**
   * Vets a navigation before it happens. Returning a different URL upgrades
   * it; returning null shows the plain-http interstitial instead.
   */
  vetNavigation: (url: string) => { url: string } | { interstitial: string } | null;
}

export interface TabInit {
  id: string;
  session: Session;
  pinned: boolean;
  workspaceId: string;
  events: TabEvents;
}

const BLANK = 'about:blank';

/**
 * Vela's own pages are drawn by the chrome renderer, not loaded into a
 * `WebContentsView`. That keeps them off the web-content security surface
 * entirely and gives them the typed IPC bridge for free.
 */
export type InternalPage = 'newtab';

/**
 * One browser tab: a `WebContentsView` plus the metadata the UI needs.
 * Page rendering happens here and nowhere else — the chrome renderer never
 * hosts web content.
 *
 * A suspended tab has handed its renderer process back and survives as title,
 * address and icon until it is opened again.
 */
export class Tab {
  readonly id: string;
  workspaceId: string;

  pinned: boolean;
  /** Non-null while this tab is showing one of Vela's own pages. */
  internal: InternalPage | null = 'newtab';
  /** Epoch ms when this tab was last active, which orders suspension. */
  lastActiveAt = Date.now();

  private currentView: WebContentsView | null = null;
  /** True once a real page has been loaded, so Back/Forward can cross the
   *  boundary between the new tab page and web content. */
  private hasLoadedPage = false;
  /** The plain-http address being warned about, if any. */
  private interstitialUrl: string | null = null;
  /** Set when a site has just refused to sign in because of what Vela is. */
  private rejectedBy: string | null = null;
  private title = 'New Tab';
  private faviconUrl: string | null = null;
  private loading = false;
  private currentUrl = BLANK;
  private blocked = 0;
  private zoomLevel = 0;
  /** This view's Chrome JavaScript surface, installed on its first load. */
  private surface: BrowserSurface = { ready: () => Promise.resolve() };
  /** Orders the loads on this view behind the surface being in place. */
  private loads: Promise<void> = Promise.resolve();
  private readonly events: TabEvents;

  constructor(private readonly init: TabInit) {
    this.id = init.id;
    this.pinned = init.pinned;
    this.workspaceId = init.workspaceId;
    this.events = init.events;
    this.ensureView();
  }

  /* ----------------------------------------------------------------- */
  /* The view                                                           */
  /* ----------------------------------------------------------------- */

  /** Creates the view if this tab is suspended, and returns it either way. */
  ensureView(): WebContentsView {
    const existing = this.currentView;
    if (existing !== null && !existing.webContents.isDestroyed()) return existing;

    const view = new WebContentsView({
      webPreferences: {
        ...REQUIRED_WEB_PREFERENCES,
        session: this.init.session,
        // No `preload` key at all: web content gets no bridge of any kind.
        spellcheck: true,
        v8CacheOptions: 'code',
      },
    });

    view.setBackgroundColor('#ffffff');
    // The page is a card floating on the chrome, and its corners belong to the
    // native view rather than to any stylesheet. Same number as the element the
    // insets are measured from, or the shape and the hole disagree.
    view.setBorderRadius(PAGE_RADIUS);
    this.currentView = view;
    this.wireEvents(view);

    return view;
  }

  /** The live view, or null while suspended. */
  get view(): WebContentsView | null {
    return this.currentView;
  }

  get suspended(): boolean {
    return this.currentView === null;
  }

  get webContents(): WebContentsView['webContents'] | null {
    const view = this.currentView;
    return view === null || view.webContents.isDestroyed() ? null : view.webContents;
  }

  get url(): string {
    return this.currentUrl;
  }

  /** True while Vela's own UI, rather than a page, owns the content region. */
  get chromeOwnsContent(): boolean {
    return this.internal !== null || this.interstitialUrl !== null;
  }

  /**
   * Gives the renderer process back. Title, address and icon stay, so the tab
   * strip is unchanged apart from a dimmed label.
   */
  suspend(): void {
    const view = this.currentView;
    if (view === null || this.internal !== null) return;

    this.currentView = null;
    this.loading = false;
    if (!view.webContents.isDestroyed()) {
      releaseBrowserSurface(view.webContents);
      view.webContents.close();
    }
    this.changed();
  }

  /** Brings a suspended tab back and reloads the page it was showing. */
  resume(): void {
    if (!this.suspended) return;
    this.ensureView();

    const target = this.currentUrl;
    if (target !== '' && target !== BLANK && this.internal === null) {
      this.loadUrlUnchecked(target);
    }
    this.changed();
  }

  snapshot(): TabSnapshot {
    const internal = this.internal !== null;
    const contents = this.webContents;

    return {
      id: this.id,
      url: internal ? '' : this.currentUrl,
      title: internal ? 'New Tab' : this.title,
      interstitialUrl: this.interstitialUrl,
      faviconUrl: internal ? null : this.faviconUrl,
      loading: !internal && this.loading,
      // From a page you can always get back to the new tab page you started
      // from, even once the page's own history is exhausted.
      canGoBack: !internal,
      canGoForward: internal
        ? this.hasLoadedPage
        : (contents?.navigationHistory.canGoForward() ?? false),
      pinned: this.pinned,
      internal: this.internal,
      suspended: this.suspended,
      zoomPercent: this.zoomPercent,
      workspaceId: this.workspaceId,
      blockedCount: this.blocked,
      signInRejectedBy: internal ? null : this.rejectedBy,
    };
  }

  /* ----------------------------------------------------------------- */
  /* Navigation                                                         */
  /* ----------------------------------------------------------------- */

  /**
   * Loads a URL after the navigation policy has vetted it: https upgrades
   * happen here, and a host the user has accepted plain http for gets the
   * interstitial rather than a silent downgrade.
   */
  loadUrl(url: string): void {
    const verdict = this.events.vetNavigation(url);
    if (verdict !== null && 'interstitial' in verdict) {
      this.internal = null;
      this.interstitialUrl = verdict.interstitial;
      this.currentUrl = verdict.interstitial;
      this.changed();
      return;
    }

    this.loadUrlUnchecked(verdict === null ? url : verdict.url);
  }

  /** Loads an address exactly as given, skipping the https upgrade. */
  loadUrlUnchecked(url: string): void {
    const contents = this.ensureView().webContents;

    this.internal = null;
    this.interstitialUrl = null;
    this.hasLoadedPage = true;
    this.currentUrl = url;

    // Waits for the browser surface to be registered before the first page
    // arrives. It is a few milliseconds of local devtools-protocol round trip
    // on a view's first load and nothing at all afterwards, and it is the
    // difference between a site seeing Chrome's JavaScript and seeing
    // Electron's — the script only counts if it is in place before the
    // document is created. Chaining every load through the same promise also
    // keeps two rapid loads in the order they were asked for.
    this.loads = this.loads
      .then(() => this.surface.ready())
      .then(() => (contents.isDestroyed() ? undefined : contents.loadURL(url)))
      .catch(() => {
        // did-fail-load reports this to the UI; a rejected promise here is
        // noise, and a surface that failed to install must not stop the page.
      });
  }

  /**
   * Shows the new tab page. The page itself stays loaded and hidden, so Forward
   * can bring it straight back.
   */
  showNewTabPage(): void {
    this.internal = 'newtab';
    this.interstitialUrl = null;
    this.loading = false;
    this.changed();
  }

  /** The address the interstitial is warning about, if it is showing. */
  get pendingInsecureUrl(): string | null {
    return this.interstitialUrl;
  }

  /** Whose sign-in has refused this browser on the page now showing, if any. */
  get signInRejectedBy(): string | null {
    return this.rejectedBy;
  }

  /** The inverse of `showNewTabPage`: reveals the page that is still loaded. */
  private resumePage(): void {
    if (!this.hasLoadedPage) return;
    this.internal = null;
    const contents = this.webContents;
    if (contents !== null) this.currentUrl = contents.getURL();
    this.changed();
  }

  goBack(): void {
    if (this.internal !== null) return;
    const contents = this.webContents;
    if (contents?.navigationHistory.canGoBack() === true) {
      contents.navigationHistory.goBack();
      return;
    }
    this.showNewTabPage();
  }

  goForward(): void {
    if (this.internal !== null) {
      this.resumePage();
      return;
    }
    this.webContents?.navigationHistory.goForward();
  }

  reload(ignoreCache: boolean): void {
    if (this.suspended) {
      this.resume();
      return;
    }
    const contents = this.webContents;
    if (contents === null) return;
    if (ignoreCache) contents.reloadIgnoringCache();
    else contents.reload();
  }

  stop(): void {
    this.webContents?.stop();
  }

  /* ----------------------------------------------------------------- */

  /* ----------------------------------------------------------------- */
  /* Zoom                                                               */
  /* ----------------------------------------------------------------- */

  /** Chromium zoom: the factor is 1.2^level, so 0 is 100%. */
  get zoomPercent(): number {
    return Math.round(1.2 ** this.zoomLevel * 100);
  }

  get zoomLevelValue(): number {
    return this.zoomLevel;
  }

  applyZoomLevel(level: number): void {
    this.zoomLevel = level;
    this.webContents?.setZoomLevel(level);
    this.changed();
  }

  /** Called once a locally cached icon exists for this tab's page. */
  setCachedFavicon(dataUrl: string | null): void {
    if (this.faviconUrl === dataUrl) return;
    this.faviconUrl = dataUrl;
    this.changed();
  }

  countBlocked(delta: number): void {
    this.blocked += delta;
  }

  resetBlocked(): void {
    this.blocked = 0;
  }

  destroy(): void {
    const view = this.currentView;
    this.currentView = null;
    if (view !== null && !view.webContents.isDestroyed()) {
      releaseBrowserSurface(view.webContents);
      view.webContents.close();
    }
  }

  /**
   * True for the `about:blank` the browser surface loads to wake a renderer.
   *
   * That load is Vela's own errand and the tab must not react to it. Left
   * unfiltered it walks the tab's address back to `about:blank` between the
   * moment a page is asked for and the moment it arrives, and every listener
   * downstream believes it: the strip redraws for a page nobody navigated to,
   * and the visit is announced as a real one.
   *
   * Told apart by the tab already knowing where it is going — `loadUrl` sets
   * the address before the surface goes anywhere — so a page that navigates
   * itself to `about:blank` afterwards is still reported normally.
   */
  private isSurfacePrime(url: string): boolean {
    return url === BLANK && this.currentUrl !== BLANK;
  }

  /**
   * Records a site refusing this browser, and clears the record the moment the
   * tab is anywhere else — the notice belongs to that page, not to the tab.
   */
  private noteRejection(url: string): void {
    this.rejectedBy = detectSignInRejection(url)?.service ?? null;
  }

  /** Dismisses the notice without leaving the page it is about. */
  dismissRejection(): void {
    if (this.rejectedBy === null) return;
    this.rejectedBy = null;
    this.changed();
  }

  private changed(): void {
    this.events.onChanged(this);
  }

  private wireEvents(view: WebContentsView): void {
    const contents = view.webContents;

    applyWebRtcPolicy(contents);
    this.surface = applyBrowserSurface(contents, { prime: true });

    // Chrome's own split: a `window.open` carrying window features is a popup,
    // and anything else — target=_blank, a bare `window.open(url)` — is a tab.
    // Signing in depends on the first half being a real window that can talk
    // back to its opener; see popup-window.ts.
    contents.setWindowOpenHandler(({ url, disposition }) => {
      if (isPopupDisposition(disposition)) return allowPopup();
      this.events.onOpenInNewTab(url, this);
      return { action: 'deny' };
    });

    contents.on('did-create-window', (popup, details) => {
      this.events.onOpenPopup(popup, {
        url: details.url,
        referrer: details.referrer,
        postBody: details.postBody,
      });
    });

    // Link clicks inside the page go through the same https policy as
    // anything typed into the address bar.
    contents.on('will-navigate', (event, url) => {
      const verdict = this.events.vetNavigation(url);
      if (verdict === null) return;
      event.preventDefault();
      if ('interstitial' in verdict) {
        this.interstitialUrl = verdict.interstitial;
        this.currentUrl = verdict.interstitial;
        this.changed();
        return;
      }
      this.loadUrlUnchecked(verdict.url);
    });

    contents.on('page-title-updated', (_event, title) => {
      this.title = title;
      this.changed();
    });

    contents.on('page-favicon-updated', (_event, favicons) => {
      const icon = favicons[0];
      if (icon !== undefined) this.events.resolveFavicon(this.currentUrl, icon);
    });

    contents.on('did-start-loading', () => {
      this.loading = true;
      this.changed();
    });

    contents.on('did-stop-loading', () => {
      this.loading = false;
      this.changed();
    });

    contents.on('did-start-navigation', (event) => {
      if (!event.isMainFrame) return;
      if (this.isSurfacePrime(event.url)) return;
      this.resetBlocked();
      this.currentUrl = event.url;
      this.changed();
    });

    contents.on('did-navigate', (_event, url) => {
      if (this.isSurfacePrime(url)) return;
      this.currentUrl = url;
      this.noteRejection(url);
      this.changed();
      this.events.onNavigated(this);
    });

    contents.on('dom-ready', () => {
      this.events.onDomReady(this);
    });

    contents.on('context-menu', (_event, params) => {
      this.events.onContextMenu(this, params);
    });

    // Google's refusal arrives as an in-page navigation, so watching only the
    // full ones would never see it.
    contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (!isMainFrame) return;
      this.currentUrl = url;
      this.noteRejection(url);
      this.changed();
    });

    contents.on('did-fail-load', (_event, _code, description, validatedUrl, isMainFrame) => {
      if (!isMainFrame) return;
      this.loading = false;
      this.title = description === 'ERR_ABORTED' ? this.title : validatedUrl;
      this.changed();
    });
  }
}
