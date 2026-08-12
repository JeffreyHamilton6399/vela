import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type PointerEvent,
} from 'react';
import type { TabSnapshot } from '../../shared/types/ipc.js';
import { CloseIcon, PinIcon, PlusIcon } from './icons.js';
import { shortcut } from './IconButton.js';

interface TabStripProps {
  tabs: readonly TabSnapshot[];
  activeTabId: string | null;
}

const PINNED_WIDTH = 40;
const MAX_TAB_WIDTH = 220;
const MIN_TAB_WIDTH = 56;
const GAP = 2;
const NEW_TAB_BUTTON_WIDTH = 34;
/** Pointer travel before a press turns into a drag. */
const DRAG_THRESHOLD = 4;

/** First letter of the host — used until a favicon has been cached locally. */
function initialFor(tab: TabSnapshot): string {
  if (tab.internal !== null) return '+';
  try {
    return (
      new URL(tab.url).host
        .replace(/^www\./, '')
        .charAt(0)
        .toUpperCase() || '?'
    );
  } catch {
    return '?';
  }
}

/**
 * Favicons are only ever rendered from a locally cached data URL. A remote
 * favicon URL would be a network request the chrome renderer must never make —
 * and the CSP would block it anyway.
 */
function FaviconOrInitial({ tab }: { tab: TabSnapshot }): JSX.Element {
  if (tab.faviconUrl?.startsWith('data:') === true) {
    return <img src={tab.faviconUrl} alt="" width={16} height={16} className="rounded-[3px]" />;
  }

  // A filled chip rather than an outlined box: at 16px a border is most of the
  // shape, and a strip of them reads as a row of empty checkboxes.
  return (
    <span
      aria-hidden
      className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[5px] bg-hover text-[9px] font-semibold text-ink-muted"
    >
      {initialFor(tab)}
    </span>
  );
}

function Spinner(): JSX.Element {
  return (
    <span
      aria-hidden
      className="h-[14px] w-[14px] shrink-0 animate-spin rounded-full border-[1.5px] border-line border-t-ink-muted"
    />
  );
}

interface TabItemProps {
  tab: TabSnapshot;
  active: boolean;
  dragging: boolean;
  width: number;
  onPointerDown: (event: PointerEvent<HTMLDivElement>, tab: TabSnapshot) => void;
}

const TabItem = memo(
  function TabItem({ tab, active, dragging, width, onPointerDown }: TabItemProps): JSX.Element {
    return (
      <div
        data-tab-id={tab.id}
        role="tab"
        aria-selected={active}
        tabIndex={0}
        title={tab.title}
        // Only `width` is React's to manage. The transition lives in a class and
        // `transform` is written straight to the node during a drag, so a state
        // push from main mid-gesture cannot clobber either.
        style={{ width }}
        className={`no-drag focus-ring group relative flex h-4 shrink-0 items-center gap-1 rounded-tab px-1 transition-[background-color,opacity,box-shadow] duration-150 ${
          // The active tab lifts off the strip rather than only changing colour:
          // in dark mode the surface/raised difference alone is nearly invisible.
          active ? 'bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.10)]' : 'hover:bg-hover'
        } ${dragging ? 'z-10 cursor-grabbing opacity-95 shadow-[0_6px_16px_rgb(0_0_0/0.18)]' : ''}`}
        onPointerDown={(event) => {
          onPointerDown(event, tab);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            window.vela.tabs.activate(tab.id);
          }
        }}
        onAuxClick={(event) => {
          // Middle click closes, as everywhere else.
          if (event.button === 1) {
            event.preventDefault();
            window.vela.tabs.close(tab.id);
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          window.vela.tabs.openContextMenu(tab.id);
        }}
      >
        {tab.loading ? <Spinner /> : <FaviconOrInitial tab={tab} />}

        {tab.pinned ? null : (
          <>
            <span
              className={`min-w-0 flex-1 truncate text-[12px] leading-none ${
                tab.suspended ? 'text-ink-muted' : 'text-ink'
              }`}
              title={tab.suspended ? `${tab.title} — suspended` : tab.title}
            >
              {tab.title}
            </span>
            <button
              type="button"
              aria-label={`Close ${tab.title}`}
              className="focus-ring flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] text-ink-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-line hover:text-ink focus-visible:opacity-100"
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                window.vela.tabs.close(tab.id);
              }}
            >
              <CloseIcon width={10} height={10} />
            </button>
          </>
        )}

        {tab.pinned ? (
          <PinIcon
            width={9}
            height={9}
            className="absolute right-[3px] top-[3px] text-ink-muted opacity-70"
          />
        ) : null}

        {/* One of the two places the Instagram gradient appears. */}
        {active ? (
          <span
            aria-hidden
            className="absolute inset-x-1 bottom-0 h-[2px] rounded-full"
            style={{ background: 'var(--vela-gradient)' }}
          />
        ) : null}
      </div>
    );
  },
  /*
   * Main pushes a whole new state object on every change worth redrawing for —
   * and a single page load is a stream of them, as loading flips, the title
   * arrives, then the favicon. Every one of those used to re-render every tab in
   * the strip. The snapshot is a fresh object each time, so the default shallow
   * compare never matches; this compares the fields the row actually draws.
   */
  function tabItemIsUnchanged(previous: TabItemProps, next: TabItemProps): boolean {
    return (
      previous.active === next.active &&
      previous.dragging === next.dragging &&
      previous.width === next.width &&
      previous.onPointerDown === next.onPointerDown &&
      previous.tab.id === next.tab.id &&
      previous.tab.title === next.tab.title &&
      previous.tab.url === next.tab.url &&
      previous.tab.faviconUrl === next.tab.faviconUrl &&
      previous.tab.loading === next.tab.loading &&
      previous.tab.pinned === next.tab.pinned &&
      previous.tab.suspended === next.tab.suspended &&
      previous.tab.internal === next.tab.internal
    );
  },
);

/** Live width of an element, so tab widths can be recomputed as it changes. */
function useElementWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;

    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref]);

  return width;
}

/** Where each tab sits in the strip, measured once when a drag begins. */
interface Slot {
  left: number;
  width: number;
}

/**
 * Which slot a dragged tab now belongs in, from where its centre has reached.
 *
 * Measured against the geometry captured at grab time rather than the live DOM.
 * Slots are positions, not tabs — every tab is the same width — so reordering
 * mid-drag does not invalidate them, and nothing has to read layout on a move.
 */
function slotForCentre(slots: readonly Slot[], centre: number): number {
  for (const [index, slot] of slots.entries()) {
    if (centre < slot.left + slot.width / 2) return index;
  }
  return Math.max(0, slots.length - 1);
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), high);

/** How long a dropped tab takes to settle, and a displaced one to slide. */
const SETTLE_MS = 180;
const EASE_OUT = 'cubic-bezier(0.2, 0, 0, 1)';
const LIFT = 1.02;

function tabElement(strip: HTMLElement | null, id: string): HTMLElement | null {
  return strip?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(id)}"]`) ?? null;
}

export function TabStrip({ tabs, activeTabId }: TabStripProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const gesture = useRef<{
    id: string;
    /** Pointer offset inside the tab, so it stays grabbed where you took hold. */
    grabOffset: number;
    startX: number;
    moved: boolean;
    slots: Slot[];
    /** The slot main was last told about, so a move is one message, not sixty. */
    lastIndex: number;
  } | null>(null);
  /** Left offsets from the previous render, for sliding displaced tabs. */
  const previousLefts = useRef(new Map<string, number>());

  const containerWidth = useElementWidth(containerRef);
  const pinnedCount = tabs.filter((tab) => tab.pinned).length;
  const looseCount = tabs.length - pinnedCount;
  const available = containerWidth - NEW_TAB_BUTTON_WIDTH - pinnedCount * (PINNED_WIDTH + GAP);
  const looseWidth =
    looseCount === 0
      ? MAX_TAB_WIDTH
      : Math.max(MIN_TAB_WIDTH, Math.min(MAX_TAB_WIDTH, Math.floor(available / looseCount) - GAP));

  const onPointerMove = useCallback((event: globalThis.PointerEvent) => {
    const current = gesture.current;
    const strip = stripRef.current;
    if (current === null || strip === null) return;

    if (!current.moved && Math.abs(event.clientX - current.startX) < DRAG_THRESHOLD) return;
    if (!current.moved) {
      current.moved = true;
      setDraggingId(current.id);
    }

    const element = tabElement(strip, current.id);
    if (element === null) return;

    // The tab goes where the pointer is, at once and without asking main. The
    // reorder below is a consequence of the drag; it is not what draws it.
    const wanted = clamp(
      event.clientX - strip.getBoundingClientRect().left - current.grabOffset,
      0,
      Math.max(0, strip.clientWidth - element.offsetWidth),
    );
    element.style.transition = 'none';
    element.style.transform = `translateX(${String(wanted - element.offsetLeft)}px) scale(${String(LIFT)})`;

    const index = slotForCentre(current.slots, wanted + element.offsetWidth / 2);
    if (index === current.lastIndex) return;
    current.lastIndex = index;
    window.vela.tabs.move(current.id, index);
  }, []);

  const endGesture = useCallback(() => {
    const current = gesture.current;
    const element = current === null ? null : tabElement(stripRef.current, current.id);

    if (element !== null) {
      // Let go and it travels to its slot rather than teleporting there.
      element.style.transition = `transform ${String(SETTLE_MS)}ms ${EASE_OUT}`;
      element.style.transform = '';
      setTimeout(() => {
        element.style.transition = '';
      }, SETTLE_MS);
    }

    gesture.current = null;
    setDraggingId(null);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endGesture);
    window.removeEventListener('pointercancel', endGesture);
  }, [onPointerMove]);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>, tab: TabSnapshot) => {
      if (event.button !== 0) return;
      window.vela.tabs.activate(tab.id);

      const strip = stripRef.current;
      const element = event.currentTarget;
      if (strip === null) return;

      // Everything the drag needs to know about layout, read once here so that
      // no pointer move has to touch the DOM for measurements.
      const items = [...strip.querySelectorAll<HTMLElement>('[data-tab-id]')];
      gesture.current = {
        id: tab.id,
        grabOffset: event.clientX - element.getBoundingClientRect().left,
        startX: event.clientX,
        moved: false,
        slots: items.map((item) => ({ left: item.offsetLeft, width: item.offsetWidth })),
        lastIndex: items.indexOf(element),
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', endGesture);
      window.addEventListener('pointercancel', endGesture);
    },
    [onPointerMove, endGesture],
  );

  /*
   * The tabs that are not being dragged.
   *
   * Reordering re-renders the strip with a new DOM order, so a displaced tab
   * would otherwise appear in its new place on the next frame with nothing in
   * between — the jump that made dragging feel like the strip was arguing with
   * you. This puts each one back where it was, then lets it travel: measure
   * after layout, invert, and animate the inversion away.
   */
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (strip === null) return;

    const lefts = new Map<string, number>();
    for (const element of strip.querySelectorAll<HTMLElement>('[data-tab-id]')) {
      const id = element.dataset['tabId'];
      if (id === undefined) continue;

      const left = element.offsetLeft;
      lefts.set(id, left);

      const previous = previousLefts.current.get(id);
      if (previous === undefined || previous === left || id === draggingId) continue;

      element.style.transition = 'none';
      element.style.transform = `translateX(${String(previous - left)}px)`;
      requestAnimationFrame(() => {
        element.style.transition = `transform ${String(SETTLE_MS)}ms ${EASE_OUT}`;
        element.style.transform = '';
      });
    }

    previousLefts.current = lefts;
  }, [tabs, draggingId]);

  return (
    <div ref={containerRef} className="flex min-w-0 flex-1 items-center">
      <div
        ref={stripRef}
        role="tablist"
        aria-label="Tabs"
        className="workspace-enter flex min-w-0 items-center gap-[2px] overflow-hidden"
        onDoubleClick={(event) => {
          // Double clicking empty strip opens a tab, as in every other browser.
          if (event.target === event.currentTarget) window.vela.tabs.create();
        }}
      >
        {tabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            active={tab.id === activeTabId}
            dragging={tab.id === draggingId}
            width={tab.pinned ? PINNED_WIDTH : looseWidth}
            onPointerDown={onPointerDown}
          />
        ))}
      </div>

      <button
        type="button"
        aria-label="Open new tab"
        title={`New tab (${shortcut('mod+T')})`}
        className="no-drag focus-ring press ml-1 flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-hover hover:text-ink"
        onClick={() => {
          window.vela.tabs.create();
        }}
      >
        <PlusIcon width={13} height={13} />
      </button>
    </div>
  );
}
