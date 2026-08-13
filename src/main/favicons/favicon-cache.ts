import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { nativeImage, type Session } from 'electron';
import type { IconDecoder } from './icon-decoder.js';

/** Icons are normalised to this size before caching, which bounds their cost. */
const ICON_SIZE = 32;
const MAX_DOWNLOAD_BYTES = 512 * 1024;
const MAX_ENTRIES = 400;

/**
 * Favicons, downloaded through the page's own session and stored locally as
 * data URLs.
 *
 * The chrome renderer never loads a remote image: its CSP is `img-src 'self'
 * data:`, so a favicon must already be on this machine before it can be drawn.
 * That also means the tab strip cannot become a side channel that tells a site
 * how often you look at your own tabs.
 */
export class FaviconCache {
  private readonly entries = new Map<string, string>();
  private readonly inFlight = new Map<string, Promise<string | null>>();
  private dirty = false;
  private readonly file: string;

  /**
   * Called the first time an icon is cached for an origin.
   *
   * What is saved for a site — a bookmark, a tile, a docked panel — stores the
   * icon that was known when it was saved, which for anything saved early is
   * none. This is the hook that goes back and fills those in; see
   * icon-backfill.ts.
   */
  onCached: ((origin: string, icon: string) => void) | null = null;

  constructor(
    userDataDir: string,
    /** Private windows keep their icons in memory only. */
    private readonly persist: boolean,
    /** Reads the formats `nativeImage` cannot. Absent means "skip those". */
    private readonly decoder: IconDecoder | null = null,
  ) {
    this.file = path.join(userDataDir, 'favicons.json');
  }

  async load(): Promise<void> {
    if (!this.persist) return;
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is derived from app.getPath('userData')
      const raw = await readFile(this.file, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (parsed === null || typeof parsed !== 'object') return;

      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'string' && value.startsWith('data:image/')) {
          this.entries.set(key, value);
        }
      }
    } catch {
      // No cache yet, or an unreadable one. Either way we start empty.
    }
  }

  async save(): Promise<void> {
    if (!this.persist || !this.dirty) return;
    this.dirty = false;

    const trimmed = [...this.entries.entries()].slice(-MAX_ENTRIES);
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is derived from app.getPath('userData')
      await mkdir(path.dirname(this.file), { recursive: true });
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is derived from app.getPath('userData')
      await writeFile(this.file, JSON.stringify(Object.fromEntries(trimmed)), 'utf8');
    } catch {
      // A cache that cannot be written is a cosmetic loss, not an error.
    }
  }

  /** The cached icon for a page URL, if one has already been fetched. */
  get(pageUrl: string): string | null {
    const key = keyFor(pageUrl);
    return key === null ? null : (this.entries.get(key) ?? null);
  }

  /**
   * Downloads and caches an icon through `session`, which is the same session
   * that loaded the page — so this rides along with a request the page already
   * made rather than opening a new tracking surface.
   */
  async resolve(pageUrl: string, iconUrl: string, session: Session): Promise<string | null> {
    const key = keyFor(pageUrl);
    if (key === null) return null;

    const cached = this.entries.get(key);
    if (cached !== undefined) return cached;

    const pending = this.inFlight.get(key);
    if (pending !== undefined) return pending;

    const task = this.download(iconUrl, session)
      .then((dataUrl) => {
        if (dataUrl !== null) {
          this.entries.set(key, dataUrl);
          this.dirty = true;
          void this.save();
          this.onCached?.(key, dataUrl);
        }
        return dataUrl;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, task);
    return task;
  }

  /**
   * Asks a site for its icon at the conventional address, for a site Vela has
   * been told about but has not loaded.
   *
   * A page announces its icon in its own markup, so nearly every icon here
   * arrives through `resolve` as a free ride on a page the user opened. A site
   * docked into the sidebar is the exception: it is named, stored and drawn in
   * the rail before anything has fetched a byte of it, and until then it is a
   * letter in a square. `/favicon.ico` is one request to the one site the user
   * has just asked to keep open beside the page — strictly less than the load
   * that follows the first click on it.
   *
   * Only that one address, and no fallback beyond it. A site that declares its
   * icon in HTML and serves nothing at the conventional path keeps its letter
   * until the panel is first opened, which is the moment `resolve` gets it for
   * real. The alternative was to guess further up the domain — `google.com` for
   * Calendar, `facebook.com` for Messenger — and a confidently wrong icon is
   * worse than an honest initial.
   */
  async resolveDefault(pageUrl: string, session: Session): Promise<string | null> {
    const key = keyFor(pageUrl);
    if (key === null) return null;
    // `keyFor` gives back the origin, so this is that site's own icon and
    // never a third party's guess at it.
    return this.resolve(pageUrl, `${key}/favicon.ico`, session);
  }

  private async download(iconUrl: string, session: Session): Promise<string | null> {
    if (!iconUrl.startsWith('http://') && !iconUrl.startsWith('https://')) return null;

    try {
      const response = await session.fetch(iconUrl);
      if (!response.ok) return null;

      // A single-page app commonly answers any address it does not recognise
      // with its own index.html, and answers it with a 200. Half a megabyte of
      // markup is not an icon, and it is not worth trying to decode.
      const type = response.headers.get('content-type') ?? '';
      if (type.startsWith('text/html')) return null;

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength === 0 || buffer.byteLength > MAX_DOWNLOAD_BYTES) return null;

      // Re-encoding through nativeImage means only real, decodable raster data
      // ever reaches the renderer — never an arbitrary blob a site chose.
      const image = nativeImage.createFromBuffer(buffer);
      if (!image.isEmpty()) {
        return image.resize({ width: ICON_SIZE, height: ICON_SIZE, quality: 'good' }).toDataURL();
      }

      // nativeImage reads PNG and JPEG. Most favicons are ICO or SVG, which it
      // returns empty for — so the ones it cannot read go to Chromium, which
      // can, in a window that holds nothing else. See icon-decoder.ts.
      return (
        (await this.decoder?.toPngDataUrl(buffer, type === '' ? 'image/x-icon' : type)) ?? null
      );
    } catch {
      return null;
    }
  }
}

/** Icons are cached per origin: one site, one icon. */
function keyFor(pageUrl: string): string | null {
  try {
    const { origin } = new URL(pageUrl);
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}
