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
