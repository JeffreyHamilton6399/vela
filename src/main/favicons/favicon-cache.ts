import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { nativeImage, type Session } from 'electron';

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

  constructor(
    userDataDir: string,
    /** Private windows keep their icons in memory only. */
    private readonly persist: boolean,
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
        }
        return dataUrl;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, task);
    return task;
  }

  private async download(iconUrl: string, session: Session): Promise<string | null> {
    if (!iconUrl.startsWith('http://') && !iconUrl.startsWith('https://')) return null;

    try {
      const response = await session.fetch(iconUrl);
      if (!response.ok) return null;

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength === 0 || buffer.byteLength > MAX_DOWNLOAD_BYTES) return null;

      // Re-encoding through nativeImage means only real, decodable raster data
      // ever reaches the renderer — never an arbitrary blob a site chose.
      const image = nativeImage.createFromBuffer(buffer);
      if (image.isEmpty()) return null;

      return image.resize({ width: ICON_SIZE, height: ICON_SIZE, quality: 'good' }).toDataURL();
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
