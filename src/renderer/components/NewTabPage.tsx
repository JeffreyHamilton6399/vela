import { useCallback, useRef, useState, type JSX, type PointerEvent } from 'react';
import type { SpeedDialTile } from '../../shared/settings.js';
import { CloseIcon, PlusIcon, SearchIcon } from './icons.js';

interface NewTabPageProps {
  tabId: string;
  tiles: readonly SpeedDialTile[];
  searchPlaceholder: string;
}

const DRAG_THRESHOLD = 4;

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Index of the tile slot under the pointer. */
function slotAt(grid: HTMLElement, x: number, y: number): number {
  const items = [...grid.querySelectorAll<HTMLElement>('[data-tile-id]')];
  let best = items.length - 1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const [index, item] of items.entries()) {
    const rect = item.getBoundingClientRect();
    const dx = x - (rect.left + rect.width / 2);
    const dy = y - (rect.top + rect.height / 2);
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }

  return Math.max(0, best);
}

function Tile({
  tile,
  dragging,
  onOpen,
  onPointerDown,
}: {
  tile: SpeedDialTile;
  dragging: boolean;
  onOpen: (url: string) => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>, tile: SpeedDialTile) => void;
}): JSX.Element {
  return (
    <div
      data-tile-id={tile.id}
      role="listitem"
      className={`group relative transition-transform duration-200 ease-spring ${
        dragging ? 'z-10 scale-105' : ''
      }`}
      onPointerDown={(event) => {
        onPointerDown(event, tile);
      }}
    >
      <button
        type="button"
        title={tile.url}
        onClick={() => {
          onOpen(tile.url);
        }}
        className="focus-ring flex w-full flex-col items-center gap-1 rounded-card border border-line bg-raised p-2 transition-colors duration-150 hover:bg-hover"
      >
        <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-card bg-surface">
          {/* Only ever a locally cached data URL — see FaviconCache. */}
          {tile.icon === null ? (
            <span className="text-[18px] font-semibold text-ink-muted">
              {hostOf(tile.url).charAt(0).toUpperCase()}
            </span>
          ) : (
            <img src={tile.icon} alt="" width={32} height={32} />
          )}
        </span>
        <span className="w-full truncate text-center text-[12px] text-ink">{tile.title}</span>
      </button>

      <button
        type="button"
        aria-label={`Remove ${tile.title}`}
        className="focus-ring absolute right-[6px] top-[6px] flex h-[20px] w-[20px] items-center justify-center rounded-full bg-surface text-ink-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:text-ink focus-visible:opacity-100"
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          window.vela.speedDial.remove(tile.id);
        }}
      >
        <CloseIcon width={10} height={10} />
      </button>
    </div>
  );
}

/**
 * Vela's new tab page, drawn by the chrome renderer rather than loaded into a
 * `WebContentsView`. It therefore makes no network request of any kind: the
 * tile icons are already on this machine, and the search box only fills in the
 * address bar's job.
 */
export function NewTabPage({ tabId, tiles, searchPlaceholder }: NewTabPageProps): JSX.Element {
  const gridRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const gesture = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);

  const open = useCallback(
    (url: string) => {
      window.vela.tabs.navigate(tabId, url);
    },
    [tabId],
  );

  const onPointerMove = useCallback((event: globalThis.PointerEvent) => {
    const current = gesture.current;
    const grid = gridRef.current;
    if (current === null || grid === null) return;

    if (
      !current.moved &&
      Math.hypot(event.clientX - current.x, event.clientY - current.y) < DRAG_THRESHOLD
    ) {
      return;
    }

    if (!current.moved) {
      current.moved = true;
      setDraggingId(current.id);
    }

    window.vela.speedDial.move(current.id, slotAt(grid, event.clientX, event.clientY));
  }, []);

  const endGesture = useCallback(() => {
    gesture.current = null;
    setDraggingId(null);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endGesture);
    window.removeEventListener('pointercancel', endGesture);
  }, [onPointerMove]);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>, tile: SpeedDialTile) => {
      if (event.button !== 0) return;
      gesture.current = { id: tile.id, x: event.clientX, y: event.clientY, moved: false };
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', endGesture);
      window.addEventListener('pointercancel', endGesture);
    },
    [onPointerMove, endGesture],
  );

  return (
    <div className="h-full w-full overflow-auto bg-surface">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4 px-3 py-8">
        <form
          className="focus-ring flex h-6 items-center gap-1 rounded-full border border-line bg-raised px-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (query.trim() === '') return;
            window.vela.tabs.navigate(tabId, query);
            setQuery('');
          }}
        >
          <SearchIcon className="text-ink-muted" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            aria-label="Search or enter an address"
            placeholder={searchPlaceholder}
            spellCheck={false}
            className="h-full flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-muted"
          />
        </form>

        <div
          ref={gridRef}
          role="list"
          aria-label="Speed Dial"
          className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2"
        >
          {tiles.map((tile) => (
            <Tile
              key={tile.id}
              tile={tile}
              dragging={tile.id === draggingId}
              onOpen={open}
              onPointerDown={onPointerDown}
            />
          ))}

          {adding ? (
            <form
              className="flex flex-col items-center justify-center gap-1 rounded-card border border-dashed border-line p-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (draft.trim() !== '') window.vela.speedDial.add({ url: draft.trim() });
                setDraft('');
                setAdding(false);
              }}
            >
              {/* Autofocused because this field only exists once the user asks for it. */}
              <input
                autoFocus
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                }}
                onBlur={() => {
                  setAdding(false);
                  setDraft('');
                }}
                aria-label="Address for the new tile"
                placeholder="example.com"
                spellCheck={false}
                className="w-full rounded-lg border border-line bg-raised px-1 py-1 text-center text-[12px] text-ink outline-none"
              />
              <span className="text-[11px] text-ink-muted">Enter to add</span>
            </form>
          ) : (
            <button
              type="button"
              aria-label="Add a Speed Dial tile"
              onClick={() => {
                setAdding(true);
              }}
              className="focus-ring flex min-h-[104px] flex-col items-center justify-center gap-1 rounded-card border border-dashed border-line text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
            >
              <PlusIcon width={18} height={18} />
              <span className="text-[12px]">Add</span>
            </button>
          )}
        </div>

        {tiles.length === 0 ? (
          <p className="text-center text-[12px] text-ink-muted">
            Speed Dial is empty. Add the sites you open most — they stay on this machine.
          </p>
        ) : null}
      </div>
    </div>
  );
}
