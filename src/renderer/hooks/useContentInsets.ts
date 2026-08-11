import { useEffect, type RefObject } from 'react';
import type { ContentInsetsPayload } from '../../shared/types/ipc.js';

function insetsFor(element: Element): ContentInsetsPayload {
  const rect = element.getBoundingClientRect();
  return {
    top: Math.max(0, Math.round(rect.top)),
    left: Math.max(0, Math.round(rect.left)),
    right: Math.max(0, Math.round(window.innerWidth - rect.right)),
    bottom: Math.max(0, Math.round(window.innerHeight - rect.bottom)),
  };
}

function same(a: ContentInsetsPayload, b: ContentInsetsPayload): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

/**
 * Reports where the page view belongs, as insets from the window edges.
 *
 * Insets rather than a rect: main can then re-derive bounds on every resize
 * tick without waiting for the renderer, so the page tracks the window edge
 * instead of lagging behind it. Measurements are coalesced to one per frame.
 */
export function useContentInsets(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;

    let frame = 0;
    let last: ContentInsetsPayload | null = null;

    const measure = (): void => {
      frame = 0;
      const next = insetsFor(element);
      if (last !== null && same(last, next)) return;
      last = next;
      window.vela.layout.setInsets(next);
    };

    const schedule = (): void => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(measure);
    };

    schedule();

    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    window.addEventListener('resize', schedule);

    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [ref]);
}
