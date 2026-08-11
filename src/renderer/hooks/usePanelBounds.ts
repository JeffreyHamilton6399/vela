import { useEffect, type RefObject } from 'react';

/**
 * Reports where the sidebar is, so main can position a docked site into it.
 *
 * The same trick as the page view: the renderer owns the layout, main owns the
 * `WebContentsView`, and a rectangle in CSS pixels is the whole conversation.
 */
export function usePanelBounds(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) {
      window.vela.panels.setBounds(null);
      return;
    }

    const element = ref.current;
    if (element === null) return;

    let frame = 0;

    const measure = (): void => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      window.vela.panels.setBounds({
        x: Math.max(0, Math.round(rect.left)),
        // The header strip sits above the docked site.
        y: Math.max(0, Math.round(rect.top + 40)),
        width: Math.max(0, Math.round(rect.width)),
        height: Math.max(0, Math.round(rect.height - 40)),
      });
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
  }, [ref, active]);
}
