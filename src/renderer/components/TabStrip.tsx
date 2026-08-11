import { useCallback, useEffect, useRef, useState, type JSX, type PointerEvent } from 'react';
import type { TabSnapshot } from '../../shared/types/ipc.js';
import { CloseIcon, PinIcon, PlusIcon } from './icons.js';

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

  return (
    <span
      aria-hidden
      className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[4px] border border-line text-[9px] font-semibold text-ink-muted"
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

function TabItem({ tab, active, dragging, width, onPointerDown }: TabItemProps): JSX.Element {
  return (
    <div
      data-tab-id={tab.id}
      role="tab"
      aria-selected={active}
      tabIndex={0}
      title={tab.title}
      style={{ width, transitionProperty: 'transform, background-color, opacity' }}
      className={`no-drag focus-ring group relative flex h-4 shrink-0 items-center gap-1 rounded-tab px-1 duration-200 ease-spring ${
        active ? 'bg-surface' : 'hover:bg-hover'
      } ${dragging ? 'z-10 scale-[1.03] opacity-95' : ''}`}
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
}

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

/** Index of the slot the pointer is currently over. */
function slotAt(strip: HTMLElement, clientX: number): number {
  const items = [...strip.querySelectorAll<HTMLElement>('[data-tab-id]')];
  for (const [index, item] of items.entries()) {
    const rect = item.getBoundingClientRect();
    if (clientX < rect.left + rect.width / 2) return index;
  }
  return Math.max(0, items.length - 1);
}

export function TabStrip({ tabs, activeTabId }: TabStripProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const gesture = useRef<{ id: string; startX: number; moved: boolean } | null>(null);

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

    window.vela.tabs.move(current.id, slotAt(strip, event.clientX));
  }, []);

  const endGesture = useCallback(() => {
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

      gesture.current = { id: tab.id, startX: event.clientX, moved: false };
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', endGesture);
      window.addEventListener('pointercancel', endGesture);
    },
    [onPointerMove, endGesture],
  );

  return (
    <div ref={containerRef} className="flex min-w-0 flex-1 items-center">
      <div
        ref={stripRef}
        role="tablist"
        aria-label="Tabs"
        className="flex min-w-0 items-center gap-[2px] overflow-hidden"
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
        title="New tab"
        className="no-drag focus-ring ml-1 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
        onClick={() => {
          window.vela.tabs.create();
        }}
      >
        <PlusIcon width={13} height={13} />
      </button>
    </div>
  );
}
