import { WebContentsView, type Session } from 'electron';
import type { TabSnapshot } from '../../shared/types/ipc.js';
import { REQUIRED_WEB_PREFERENCES } from '../window-options.js';
import { applyWebRtcPolicy } from '../privacy/session-hardening.js';

export interface TabEvents {
  /** Any change worth redrawing the tab strip for. */
  onChanged: (tab: Tab) => void;
  /** A link that asked for a new tab (target=_blank, window.open). */
  onOpenInNewTab: (url: string, opener: Tab) => void;
  /** Resolves a locally cached icon for a page; remote icons never reach the UI. */
  resolveFavicon: (pageUrl: string, iconUrl: string) => void;
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
 */
export class Tab {
  readonly id: string;
  readonly view: WebContentsView;

  pinned: boolean;
  /** Non-null while this tab is showing one of Vela's own pages. */
  internal: InternalPage | null = 'newtab';
  /** True once a real page has been loaded, so Back/Forward can cross the
   *  boundary between the new tab page and web content. */
  private hasLoadedPage = false;
  /** The plain-http address being warned about, if any. */
  private interstitialUrl: string | null = null;
  private title = 'New Tab';
  private faviconUrl: string | null = null;
  private loading = false;
  private currentUrl = BLANK;
  private blocked = 0;
  private readonly events: TabEvents;

  constructor(init: TabInit) {
    this.id = init.id;
    this.pinned = init.pinned;
    this.events = init.events;

    this.view = new WebContentsView({
      webPreferences: {
        ...REQUIRED_WEB_PREFERENCES,
        session: init.session,
        // No `preload` key at all: web content gets no bridge of any kind.
        spellcheck: true,
      },
    });

    this.view.setBackgroundColor('#ffffff');
    this.wireEvents();
  }

  get webContents(): WebContentsView['webContents'] {
    return this.view.webContents;
  }

  get url(): string {
    return this.currentUrl;
  }

  get destroyed(): boolean {
    return this.view.webContents.isDestroyed();
  }

  /** True while Vela's own UI, rather than a page, owns the content region. */
  get chromeOwnsContent(): boolean {
    return this.internal !== null || this.interstitialUrl !== null;
  }

  snapshot(): TabSnapshot {
    const internal = this.internal !== null;
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
        : !this.destroyed && this.webContents.navigationHistory.canGoForward(),
      pinned: this.pinned,
      internal: this.internal,
      blockedCount: this.blocked,
    };
  }

  /**
   * Loads a URL after the navigation policy has vetted it: https upgrades
   * happen here, and a host the user has accepted plain http for gets the
   * interstitial rather than a silent downgrade.
   */
  loadUrl(url: string): void {
    if (this.destroyed) return;

    const verdict = this.events.vetNavigation(url);
    if (verdict !== null && 'interstitial' in verdict) {
      this.internal = null;
      this.interstitialUrl = verdict.interstitial;
      this.currentUrl = verdict.interstitial;
      this.changed();
      return;
    }

    const target = verdict === null ? url : verdict.url;
    this.internal = null;
    this.interstitialUrl = null;
    this.hasLoadedPage = true;
    this.currentUrl = target;
    void this.webContents.loadURL(target).catch(() => {
      // did-fail-load reports this to the UI; a rejected promise here is noise.
    });
  }

  /** Loads an address exactly as given, skipping the https upgrade. */
  loadUrlUnchecked(url: string): void {
    if (this.destroyed) return;
    this.internal = null;
    this.interstitialUrl = null;
    this.hasLoadedPage = true;
    this.currentUrl = url;
    void this.webContents.loadURL(url).catch(() => {
      /* reported by did-fail-load */
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

  /** The inverse of `showNewTabPage`: reveals the page that is still loaded. */
  private resumePage(): void {
    if (!this.hasLoadedPage) return;
    this.internal = null;
    if (!this.destroyed) this.currentUrl = this.webContents.getURL();
    this.changed();
  }

  goBack(): void {
    if (this.internal !== null || this.destroyed) return;
    if (this.webContents.navigationHistory.canGoBack()) {
      this.webContents.navigationHistory.goBack();
      return;
    }
    this.showNewTabPage();
  }

  goForward(): void {
    if (this.internal !== null) {
      this.resumePage();
      return;
    }
    if (!this.destroyed) this.webContents.navigationHistory.goForward();
  }

  reload(ignoreCache: boolean): void {
    if (this.destroyed) return;
    if (ignoreCache) this.webContents.reloadIgnoringCache();
    else this.webContents.reload();
  }

  stop(): void {
    if (!this.destroyed) this.webContents.stop();
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
    if (this.destroyed) return;
    this.webContents.close();
  }

  private changed(): void {
    this.events.onChanged(this);
  }

  private wireEvents(): void {
    const contents = this.webContents;

    applyWebRtcPolicy(contents);

    contents.setWindowOpenHandler(({ url }) => {
      this.events.onOpenInNewTab(url, this);
      return { action: 'deny' };
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
      this.resetBlocked();
      this.currentUrl = event.url;
      this.changed();
    });

    contents.on('did-navigate', (_event, url) => {
      this.currentUrl = url;
      this.changed();
    });

    contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (!isMainFrame) return;
      this.currentUrl = url;
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
