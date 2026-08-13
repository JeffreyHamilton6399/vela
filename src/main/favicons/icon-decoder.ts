import { WebContentsView, nativeImage, session as electronSession } from 'electron';
import { REQUIRED_WEB_PREFERENCES } from '../window-options.js';

/**
 * Decoding the icon formats `nativeImage` will not, by asking Chromium.
 *
 * `nativeImage.createFromBuffer` reads PNG and JPEG and nothing else — not ICO,
 * not SVG. Most of the web's favicons are one of those two: measured across ten
 * ordinary sites, six came back undecodable and showed a letter in the tab strip
 * where Chrome shows an icon. Wikipedia, Hacker News, Stack Overflow, YouTube,
 * Amazon and the New York Times were all in that six, and it reads as Vela not
 * knowing what site you are looking at.
 *
 * Chromium decodes every one of them, and Chromium is already here. So the bytes
 * go into an `<img>`, onto a 32×32 canvas, and come back as a PNG that
 * `nativeImage` is willing to read.
 *
 * Where that happens matters. The chrome renderer holds Vela's IPC bridge, and
 * an image decoder is a classic place to find a memory-safety bug, so raw bytes
 * from a website are never handed to it. They go here instead: a view attached
 * to no window, sandboxed, no preload, no bridge, its own session with the
 * network switched off, holding one `<img>` and one canvas. What comes back is a
 * PNG, and main re-encodes even that through `nativeImage` before anything draws
 * it.
 *
 * A detached `WebContentsView` rather than a hidden `BrowserWindow`, because a
 * window — hidden or not — counts in `window-all-closed`, and an app that keeps
 * a decoder alive would be an app that never quits.
 */

/** Icons are normalised to this square, matching FaviconCache. */
const ICON_SIZE = 32;

/** A decode that has not finished by now is not going to be worth waiting for. */
const DECODE_TIMEOUT_MS = 3_000;

/** The decoder hands its renderer back once icons stop arriving. */
const IDLE_TIMEOUT_MS = 30_000;

const PNG_PREFIX = 'data:image/png;base64,';

/**
 * Runs in the decoder, once per icon.
 *
 * `<img>` cannot run script — an SVG loaded this way is inert — and an image
 * from a `data:` URL does not taint the canvas, so `toDataURL` is allowed to
 * hand the re-encoded pixels back.
 */
const DECODE_SCRIPT = `(async (source, size) => {
  const image = new Image();
  image.src = source;
  await image.decode();

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext('2d');
  if (context === null) return null;
  context.imageSmoothingQuality = 'high';
  // An explicit destination size: an SVG may have no intrinsic one and an ICO
  // carries several. Either way it is rasterised at the size we want.
  context.drawImage(image, 0, 0, size, size);

  return canvas.toDataURL('image/png');
})`;

export class IconDecoder {
  private view: WebContentsView | null = null;
  private starting: Promise<WebContentsView> | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private disposed = false;

  /**
   * A PNG data URL for `bytes`, or null if Chromium cannot read them either.
   *
   * `mime` only labels the bytes for the `data:` URL; Chromium sniffs the real
   * format regardless, which is just as well given how many servers mislabel a
   * favicon.
   */
  async toPngDataUrl(bytes: Buffer, mime: string): Promise<string | null> {
    if (this.disposed || bytes.byteLength === 0) return null;

    try {
      const view = await this.ensure();
      const source = `data:${mime};base64,${bytes.toString('base64')}`;
      const script = `${DECODE_SCRIPT}(${JSON.stringify(source)}, ${String(ICON_SIZE)})`;

      const decoded: unknown = await Promise.race([
        view.webContents.executeJavaScript(script, true),
        new Promise<null>((resolve) => {
          setTimeout(() => {
            resolve(null);
          }, DECODE_TIMEOUT_MS).unref();
        }),
      ]);

      this.scheduleTeardown();
      if (typeof decoded !== 'string' || !decoded.startsWith(PNG_PREFIX)) return null;

      // Never trust what the decoder said: main reads the PNG itself, and what
      // gets stored is main's own encoding of it.
      const png = nativeImage.createFromBuffer(
        Buffer.from(decoded.slice(PNG_PREFIX.length), 'base64'),
      );
      return png.isEmpty() ? null : png.toDataURL();
    } catch {
      // A decoder that will not start, or one torn down mid-flight. An icon is
      // not worth an error path of its own.
      this.scheduleTeardown();
      return null;
    }
  }

  private async ensure(): Promise<WebContentsView> {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    const existing = this.view;
    if (existing !== null && !existing.webContents.isDestroyed()) return existing;

    // One start at a time: a burst of icons on a cold cache would otherwise
    // each create a decoder and leak all but the last.
    this.starting ??= this.start();
    try {
      return await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private async start(): Promise<WebContentsView> {
    // Its own partition, so nothing here shares a cookie jar, a cache or a
    // storage quota with a tab.
    const session = electronSession.fromPartition('vela-icon-decoder');

    // It never needs the network — every byte it sees arrives inside a `data:`
    // URL from main — so it is not allowed any. A decoder that cannot make a
    // request cannot be turned into one that phones home.
    session.webRequest.onBeforeRequest((_details, callback) => {
      callback({ cancel: true });
    });

    const view = new WebContentsView({
      webPreferences: {
        ...REQUIRED_WEB_PREFERENCES,
        session,
        // No preload key at all: nothing here has a route back into Vela beyond
        // the value `executeJavaScript` returns.
        images: true,
        // Never composited, so it would otherwise be throttled as a background
        // document and a queue of icons would arrive at a crawl.
        backgroundThrottling: false,
      },
    });

    // Blank and inert. The canvas work needs a document and nothing more.
    await view.webContents.loadURL('about:blank');
    this.view = view;
    return view;
  }

  /** Hands the renderer back once the icons stop coming. */
  private scheduleTeardown(): void {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    if (this.disposed) return;

    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.close();
    }, IDLE_TIMEOUT_MS);
    // A pending teardown must never be the reason the app is still running.
    this.idleTimer.unref();
  }

  private close(): void {
    const view = this.view;
    this.view = null;
    if (view !== null && !view.webContents.isDestroyed()) view.webContents.close();
  }

  dispose(): void {
    this.disposed = true;
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.close();
  }
}
