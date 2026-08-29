import { useEffect, useRef, useState, type JSX } from 'react';
import type { DownloadItem } from '../../shared/types/ipc.js';
import { CloseIcon, DownloadIcon } from './icons.js';

/** Mirrors the download list pushed from main. */
export function useDownloads(): DownloadItem[] {
  const [items, setItems] = useState<DownloadItem[]>([]);

  useEffect(() => {
    let active = true;
    void window.vela.downloads.list().then((next) => {
      if (active) setItems(next);
    });
    const unsubscribe = window.vela.downloads.onChanged(setItems);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return items;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit] ?? 'KB'}`;
}

/**
 * How much longer, in units the number is actually good to.
 *
 * Nothing is said until there is a rate to divide by, and nothing finer than a
 * minute is promised beyond the first one — an ETA that counts individual
 * seconds through a ten-minute download is noise pretending to be information.
 */
function remaining(item: DownloadItem): string | null {
  if (item.state !== 'progressing' || item.bytesPerSecond <= 0 || item.totalBytes <= 0) return null;

  const seconds = Math.round((item.totalBytes - item.receivedBytes) / item.bytesPerSecond);
  if (seconds <= 0) return null;
  if (seconds < 60) return `${String(seconds)}s left`;
  if (seconds < 3600) return `${String(Math.round(seconds / 60))} min left`;
  return 'over an hour left';
}

function describe(item: DownloadItem): string {
  switch (item.state) {
    case 'completed':
      return formatBytes(item.totalBytes);
    case 'cancelled':
      return 'Cancelled';
    case 'interrupted':
      return item.canResume ? 'Interrupted — can be resumed' : 'Interrupted';
    case 'paused':
      return `Paused — ${formatBytes(item.receivedBytes)} so far`;
    default: {
      const size =
        item.totalBytes > 0
          ? `${formatBytes(item.receivedBytes)} of ${formatBytes(item.totalBytes)}`
          : formatBytes(item.receivedBytes);
      const rate = item.bytesPerSecond > 0 ? `${formatBytes(item.bytesPerSecond)}/s` : null;
      const left = remaining(item);
      return [size, rate, left].filter((part) => part !== null).join(' · ');
    }
  }
}

function Row({ item }: { item: DownloadItem }): JSX.Element {
  const progress =
    item.totalBytes > 0 ? Math.min(100, (item.receivedBytes / item.totalBytes) * 100) : 0;
  const running = item.state === 'progressing' || item.state === 'paused';

  return (
    <li className="flex flex-col gap-[3px] border-b border-line px-2 py-1 last:border-b-0">
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink" title={item.filename}>
          {item.filename}
        </span>

        {running ? (
          <>
            {/* Only offered where it will work: a server that will not do a
                ranged request cannot resume, and Chromium says which. */}
            {item.state === 'paused' ? (
              item.canResume ? (
                <button
                  type="button"
                  onClick={() => {
                    window.vela.downloads.resume(item.id);
                  }}
                  className="focus-ring shrink-0 rounded-lg px-1 text-[11px] text-ink-muted hover:bg-hover hover:text-ink"
                >
                  Resume
                </button>
              ) : null
            ) : (
              <button
                type="button"
                onClick={() => {
                  window.vela.downloads.pause(item.id);
                }}
                className="focus-ring shrink-0 rounded-lg px-1 text-[11px] text-ink-muted hover:bg-hover hover:text-ink"
              >
                Pause
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                window.vela.downloads.cancel(item.id);
              }}
              className="focus-ring shrink-0 rounded-lg px-1 text-[11px] text-ink-muted hover:bg-hover hover:text-ink"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            {item.state === 'completed' ? (
              <button
                type="button"
                onClick={() => {
                  window.vela.downloads.open(item.id);
                }}
                className="focus-ring shrink-0 rounded-lg px-1 text-[11px] text-ink-muted hover:bg-hover hover:text-ink"
              >
                Open
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                window.vela.downloads.showInFolder(item.id);
              }}
              className="focus-ring shrink-0 rounded-lg px-1 text-[11px] text-ink-muted hover:bg-hover hover:text-ink"
            >
              Show
            </button>
          </>
        )}
      </div>

      <span className="text-[11px] tabular-nums text-ink-muted">{describe(item)}</span>

      {running ? (
        <span className="h-[3px] w-full overflow-hidden rounded-full bg-hover">
          <span
            className="block h-full rounded-full transition-[width] duration-200"
            style={{ width: `${String(progress)}%`, background: 'var(--vela-gradient)' }}
          />
        </span>
      ) : null}
    </li>
  );
}

/**
 * Downloads for this window. The list lives in memory only — a record of what
 * you downloaded is exactly the sort of thing a private browser should not
 * leave lying around. The files themselves stay wherever they were saved.
 */
export function DownloadsPanel({
  items,
  onClose,
}: {
  items: readonly DownloadItem[];
  onClose: () => void;
}): JSX.Element {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-raised shadow-sm">
      <div className="flex items-center justify-between gap-1 border-b border-line px-2 py-1">
        <span className="flex items-center gap-1 text-[13px] font-medium text-ink">
          <DownloadIcon width={14} height={14} />
          Downloads
        </span>
        <span className="flex items-center gap-1">
          {items.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                window.vela.downloads.clear();
              }}
              className="focus-ring rounded-lg px-1 text-[11px] text-ink-muted hover:bg-hover hover:text-ink"
            >
              Clear
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Close downloads"
            onClick={onClose}
            className="focus-ring flex h-4 w-4 items-center justify-center rounded-lg text-ink-muted hover:bg-hover hover:text-ink"
          >
            <CloseIcon width={11} height={11} />
          </button>
        </span>
      </div>

      {items.length === 0 ? (
        <p className="px-2 py-2 text-[12px] text-ink-muted">Nothing downloaded yet.</p>
      ) : (
        <ul className="max-h-[320px] overflow-auto">
          {items.map((item) => (
            <Row key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The whole of the bubble's renderer.
 *
 * It is its own `WebContentsView`, so the only thing on the page is the card,
 * and the view is trimmed to whatever height the card comes out at — measured
 * here and reported to main. Everything outside those few hundred pixels stays
 * the page's, which is the entire reason the bubble is not drawn in the chrome
 * renderer with the rest of the UI.
 */
export function DownloadsBubble(): JSX.Element {
  const items = useDownloads();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = cardRef.current;
    if (element === null) return;

    const report = (): void => {
      window.vela.downloads.reportPopupHeight(Math.ceil(element.getBoundingClientRect().height));
    };

    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') window.vela.downloads.closePopup();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div ref={cardRef}>
      <DownloadsPanel
        items={items}
        onClose={() => {
          window.vela.downloads.closePopup();
        }}
      />
    </div>
  );
}
