import { useEffect, useState } from 'react';

/**
 * Tells main to hide the page while a chrome overlay owns the content region,
 * and returns a still of the page as it was the moment before it went.
 *
 * A `WebContentsView` always paints above the chrome renderer, so an overlay
 * drawn in React would otherwise be hidden behind the page. Hiding rather than
 * detaching keeps the page loaded and running underneath — but it also leaves
 * a flat sheet of the surface colour for the dialog's scrim to be translucent
 * against, which reads as a black screen rather than as a dialog over your
 * page. The still is what the scrim sits on instead.
 */
export function useOverlay(open: boolean): string | null {
  const [snapshot, setSnapshot] = useState<string | null>(null);

  useEffect(() => {
    let current = true;

    void window.vela.layout.openOverlay(open).then((next) => {
      // A second overlay may have opened while this one was being answered.
      if (current) setSnapshot(open ? next : null);
    });

    return () => {
      current = false;
      void window.vela.layout.openOverlay(false);
    };
  }, [open]);

  return open ? snapshot : null;
}
