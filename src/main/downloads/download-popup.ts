import { WebContentsView, type BrowserWindow, type WebContents } from 'electron';
import type { Bounds } from '../tabs/layout.js';
import { REQUIRED_WEB_PREFERENCES } from '../window-options.js';

/** How wide the bubble is drawn, and how far in from the content edge it sits. */
const WIDTH = 340;
const MARGIN = 8;
/** Enough for the header alone, until the bubble has measured itself. */
const INITIAL_HEIGHT = 44;
const MAX_HEIGHT = 420;
/** How long a bubble that opened itself stays up before withdrawing. */
const AUTO_HIDE_MS = 6000;

export interface DownloadPopupOptions {
  window: BrowserWindow;
  preloadPath: string;
  rendererHtml: string;
  devServerUrl: string | undefined;
  /** The rectangle the page occupies, which the bubble hangs off the top of. */
  getContentBounds: () => Bounds;
}

/**
 * The downloads bubble, floating over the top-right corner of the page.
 *
 * It has to be a `WebContentsView` rather than part of the chrome renderer for
 * the reason `useOverlay` exists: the page's own view always paints above the
 * window's web contents, so anything React draws inside the content region is
 * behind it. The panels and dialogs answer that by hiding the page while they
 * are up, which is the wrong trade for a bubble that appears on its own the
 * moment a download finishes — you would lose the page you were reading.
 *
 * So the bubble gets its own view, sized to the card and no larger. Every pixel
 * outside it still belongs to the page: clicks, scrolling and selection carry
 * on as if nothing were there.
 *
 * It loads Vela's own renderer at `#downloads`, which is why it may carry the
 * preload bridge — this is chrome, not web content, and the same rules apply as
 * to the toolbar it belongs to.
 */
export class DownloadPopup {
  private view: WebContentsView | null = null;
  private visible = false;
  private height = INITIAL_HEIGHT;
  private hideTimer: NodeJS.Timeout | null = null;
  private disposed = false;

  constructor(private readonly options: DownloadPopupOptions) {}

  get isOpen(): boolean {
    return this.visible;
  }

  /** True for the bubble's own renderer, so its IPC is trusted like the chrome. */
  owns(sender: unknown): boolean {
    const contents = this.webContents;
    return contents !== null && sender === contents;
  }

  get webContents(): WebContents | null {
    const view = this.view;
    return view === null || view.webContents.isDestroyed() ? null : view.webContents;
  }

  /** Called when the page region moves, so the bubble stays in its corner. */
  reposition(): void {
    this.raise();
    this.applyBounds();
  }

  /**
   * Puts the bubble back on top of the page.
   *
   * Child views stack in the order they were added, and attaching a tab's view
   * appends it — so switching tabs while the bubble is up would otherwise bury
   * it under the page that just arrived. Re-adding is a no-op unless something
   * has actually gone above it.
   */
  private raise(): void {
    const view = this.view;
    if (view === null || !this.visible || this.options.window.isDestroyed()) return;

    const children = this.options.window.contentView.children;
    if (children.at(-1) === view) return;
    this.options.window.contentView.addChildView(view);
  }

  toggle(): void {
    if (this.visible) this.hide();
    else this.show({ autoHide: false });
  }

  /**
   * Opens the bubble the way a browser does when a download lands: on its own,
   * and withdrawing again shortly after, unless the user opened it by hand.
   */
  show(options: { autoHide: boolean }): void {
    if (this.disposed) return;

    const view = this.ensureView();
    if (!this.visible) {
      this.options.window.contentView.addChildView(view);
      this.visible = true;
      this.applyBounds();
      view.setVisible(true);
    }

    this.clearTimer();
    if (options.autoHide) {
      this.hideTimer = setTimeout(() => {
        this.hide();
      }, AUTO_HIDE_MS);
      this.hideTimer.unref();
    }
  }

  hide(): void {
    this.clearTimer();
    if (!this.visible) return;
    this.visible = false;

    const view = this.view;
    if (view === null) return;

    // Closing the window destroys its content view before disposal reaches
    // here, and taking a child off a destroyed one throws — which would leave
    // the rest of the teardown, and the quit that follows it, undone.
    if (this.options.window.isDestroyed()) return;
    view.setVisible(false);
    this.options.window.contentView.removeChildView(view);
  }

  /** The bubble reporting how tall it actually drew. */
  setHeight(height: number): void {
    const next = Math.max(INITIAL_HEIGHT, Math.min(MAX_HEIGHT, Math.round(height)));
    if (next === this.height) return;
    this.height = next;
    this.applyBounds();
  }

  private clearTimer(): void {
    if (this.hideTimer === null) return;
    clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }

  private applyBounds(): void {
    const view = this.view;
    if (view === null || !this.visible || this.options.window.isDestroyed()) return;
    const content = this.options.getContentBounds();

    // Never wider or taller than the region it floats over, so a small window
    // gets a smaller bubble rather than one hanging off the edge.
    const width = Math.min(WIDTH, Math.max(0, content.width - MARGIN * 2));
    const height = Math.min(this.height, Math.max(0, content.height - MARGIN * 2));

    view.setBounds({
      x: content.x + content.width - width - MARGIN,
      y: content.y + MARGIN,
      width,
      height,
    });
  }

  private ensureView(): WebContentsView {
    const existing = this.view;
    if (existing !== null && !existing.webContents.isDestroyed()) return existing;

    const view = new WebContentsView({
      webPreferences: {
        ...REQUIRED_WEB_PREFERENCES,
        preload: this.options.preloadPath,
        spellcheck: false,
        transparent: true,
      },
    });

    // Transparent, so the card's rounded corners and shadow sit on the page
    // rather than on a rectangle of Vela's own colour.
    view.setBackgroundColor('#00000000');
    this.view = view;
    this.load(view);
    return view;
  }

  private load(view: WebContentsView): void {
    const { devServerUrl, rendererHtml } = this.options;
    const contents = view.webContents;

    if (devServerUrl !== undefined && devServerUrl !== '') {
      void contents.loadURL(`${devServerUrl}#downloads`);
    } else {
      void contents.loadFile(rendererHtml, { hash: 'downloads' });
    }

    // The bubble is UI: it never navigates and never opens anything.
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event, url) => {
      if (url !== contents.getURL()) event.preventDefault();
    });
  }

  dispose(): void {
    this.disposed = true;
    this.hide();
    this.clearTimer();

    const view = this.view;
    this.view = null;
    if (view !== null && !view.webContents.isDestroyed()) view.webContents.close();
  }
}
