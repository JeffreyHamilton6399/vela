import { useEffect } from 'react';

/**
 * Tells main to hide the page while a chrome overlay owns the content region.
 *
 * A `WebContentsView` always paints above the chrome renderer, so an overlay
 * drawn in React would otherwise be hidden behind the page. Hiding rather than
 * detaching keeps the page loaded and running underneath.
 */
export function useOverlay(open: boolean): void {
  useEffect(() => {
    window.vela.layout.setOverlayOpen(open);
    return () => {
      window.vela.layout.setOverlayOpen(false);
    };
  }, [open]);
}
