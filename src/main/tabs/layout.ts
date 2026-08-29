/**
 * Where the page view sits inside the window.
 *
 * The renderer measures its own chrome and reports insets; main turns those
 * into view bounds. Insets rather than absolute rects, so a window resize can
 * be handled in main without a round trip to the renderer.
 */
export interface ContentInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ZERO_INSETS: ContentInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * The page's corner radius, in CSS px.
 *
 * The page is drawn by a native view sitting on top of the window, so its
 * corners are not the renderer's to round: the same number has to be given to
 * `setBorderRadius` on the view and to the element the insets are measured
 * from, or the chrome shows a rounded hole with a square page in it. It lives
 * here because this is the module both sides already agree through, and the
 * renderer reads the same number from `--page-radius` in styles.css.
 */
export const PAGE_RADIUS = 10;

/** Never returns negative dimensions, however small the window gets. */
export function computeViewBounds(size: Size, insets: ContentInsets): Bounds {
  const x = Math.round(Math.max(0, insets.left));
  const y = Math.round(Math.max(0, insets.top));
  const width = Math.round(Math.max(0, size.width - insets.left - insets.right));
  const height = Math.round(Math.max(0, size.height - insets.top - insets.bottom));

  return { x, y, width, height };
}

export function boundsEqual(a: Bounds, b: Bounds): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
