import {
  WebContentsView,
  type BrowserWindow,
  type ContextMenuParams,
  type Session,
  type WebContents,
} from 'electron';
import { PAGE_RADIUS, type Bounds } from '../tabs/layout.js';
import { REQUIRED_WEB_PREFERENCES } from '../window-options.js';
import {
  applyBrowserSurface,
  applyWebRtcPolicy,
  releaseBrowserSurface,
} from '../privacy/session-hardening.js';

export interface PanelManagerOptions {
  window: BrowserWindow;
  session: Session;
  /** A panel asked to open a link in a real tab. */
  onOpenInTab: (url: string) => void;
  /** The panel reported an icon; the caller caches it and stores it. */
  onFavicon: (id: string, pageUrl: string, iconUrl: string) => void;
  /** A right-click inside a panel, with what was under the pointer. */
  onContextMenu: (contents: WebContents, params: ContextMenuParams) => void;
}

/**
 * Sites docked into the sidebar, in the manner of Opera's web panels.
 *
 * Each one is an ordinary `WebContentsView` on the same hardened session as a
 * tab — same sandbox, same blocking, same referer policy, no preload. It is
 * simply positioned into the sidebar rectangle instead of the page area, and
 * only the visible panel exists: closing the sidebar destroys the view rather
 * than leaving a hidden renderer running behind it.
 */
export class PanelManager {
  private views = new Map<string, WebContentsView>();
  private activeId: string | null = null;
  private bounds: Bounds | null = null;
  private disposed = false;

  constructor(private readonly options: PanelManagerOptions) {}

  get openId(): string | null {
    return this.activeId;
  }

  /** Shows a panel, creating its view on first use. */
  open(id: string, url: string): void {
    if (this.disposed) return;
    if (this.activeId === id) return;

    this.hideActive();

    const view = this.views.get(id) ?? this.createView(id, url);
    this.options.window.contentView.addChildView(view);
    this.activeId = id;

    this.applyBounds();
    view.setVisible(true);
  }

  close(): void {
    this.hideActive();
    this.activeId = null;
  }

  /** Called when a panel is deleted from settings. */
  forget(id: string): void {
    if (this.activeId === id) this.close();
    const view = this.views.get(id);
    if (view === undefined) return;
    this.views.delete(id);
    if (!view.webContents.isDestroyed()) {
      releaseBrowserSurface(view.webContents);
      view.webContents.close();
    }
  }

  setBounds(bounds: Bounds | null): void {
    this.bounds = bounds;
    this.applyBounds();
  }

  reload(): void {
    if (this.activeId === null) return;
    const view = this.views.get(this.activeId);
    if (view !== undefined && !view.webContents.isDestroyed()) view.webContents.reload();
  }

  private hideActive(): void {
    if (this.activeId === null) return;
    const view = this.views.get(this.activeId);
    if (view === undefined) return;
    view.setVisible(false);
    this.options.window.contentView.removeChildView(view);
  }

  private applyBounds(): void {
    if (this.activeId === null || this.bounds === null || this.disposed) return;
    this.views.get(this.activeId)?.setBounds(this.bounds);
  }

  private createView(id: string, url: string): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        ...REQUIRED_WEB_PREFERENCES,
        session: this.options.session,
        // A panel is web content, so it gets no bridge — same as a tab.
        v8CacheOptions: 'code',
      },
    });

    view.setBackgroundColor('#ffffff');
    // Same corner as a tab's page: a docked site is a card on the chrome too.
    view.setBorderRadius(PAGE_RADIUS);
    applyWebRtcPolicy(view.webContents);
    const surface = applyBrowserSurface(view.webContents, { prime: true });

    // Links that want a new window become real tabs, not nested panels.
    view.webContents.setWindowOpenHandler(({ url: target }) => {
      this.options.onOpenInTab(target);
      return { action: 'deny' };
    });

    view.webContents.on('page-favicon-updated', (_event, favicons) => {
      const icon = favicons[0];
      if (icon !== undefined) this.options.onFavicon(id, view.webContents.getURL(), icon);
    });

    // A docked panel is web content like any tab, so right-clicking in one
    // offers the same things rather than nothing at all.
    view.webContents.on('context-menu', (_event, params) => {
      this.options.onContextMenu(view.webContents, params);
    });

    // Same wait a tab's first load takes: a docked Gmail or Calendar is a page
    // that has to sign in, so it needs Chrome's JavaScript surface in place
    // before its first document exists.
    void surface
      .ready()
      .then(() => (view.webContents.isDestroyed() ? undefined : view.webContents.loadURL(url)))
      .catch(() => {
        // A panel that fails to load shows the page's own error, as a tab would.
      });

    this.views.set(id, view);
    return view;
  }

  dispose(): void {
    this.disposed = true;
    this.close();
    for (const view of this.views.values()) {
      if (!view.webContents.isDestroyed()) {
        releaseBrowserSurface(view.webContents);
        view.webContents.close();
      }
    }
    this.views.clear();
  }
}
