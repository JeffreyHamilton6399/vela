import type { JSX } from 'react';
import type { Bookmark } from '../../shared/settings.js';

interface BookmarksBarProps {
  bookmarks: readonly Bookmark[];
  tabId: string | null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * The bookmarks bar. Icons come from the local favicon cache — the same rule
 * as everywhere else in the chrome, so this strip never makes a request.
 */
export function BookmarksBar({ bookmarks, tabId }: BookmarksBarProps): JSX.Element | null {
  if (bookmarks.length === 0) return null;

  return (
    <nav
      aria-label="Bookmarks"
      className="flex h-4 shrink-0 items-center gap-[2px] overflow-x-auto border-b border-line bg-raised px-1"
    >
      {bookmarks.map((mark) => (
        <button
          key={mark.id}
          type="button"
          title={mark.url}
          onClick={() => {
            if (tabId !== null) window.vela.tabs.navigate(tabId, mark.url);
          }}
          onAuxClick={(event) => {
            if (event.button === 1) {
              event.preventDefault();
              window.vela.tabs.create({ url: mark.url });
            }
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            window.vela.bookmarks.remove(mark.id);
          }}
          className="focus-ring flex h-[24px] max-w-[180px] shrink-0 items-center gap-[5px] rounded-lg px-1 text-[12px] text-ink transition-colors duration-150 hover:bg-hover"
        >
          {mark.icon === null ? (
            <span
              aria-hidden
              className="flex h-[13px] w-[13px] shrink-0 items-center justify-center rounded-[3px] border border-line text-[8px] font-semibold text-ink-muted"
            >
              {hostOf(mark.url).charAt(0).toUpperCase()}
            </span>
          ) : (
            <img src={mark.icon} alt="" width={13} height={13} className="shrink-0 rounded-[3px]" />
          )}
          <span className="truncate">{mark.title}</span>
        </button>
      ))}
    </nav>
  );
}
