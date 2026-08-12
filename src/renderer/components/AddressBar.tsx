import { useEffect, useImperativeHandle, useRef, useState, type JSX, type RefObject } from 'react';
import { describeAddress, originLabel, resolveAddressInput } from '../../shared/address-input.js';
import type { TabSnapshot } from '../../shared/types/ipc.js';
import { KeyIcon, LockIcon, SearchIcon, StarIcon, WarningIcon } from './icons.js';

export interface AddressBarHandle {
  focus: () => void;
}

interface AddressBarProps {
  tab: TabSnapshot | null;
  searchEngineId: string;
  bookmarked: boolean;
  handleRef: RefObject<AddressBarHandle | null>;
  onNavigate: (input: string) => void;
  onToggleBookmark: () => void;
}

/** The leading glyph: what this address actually is. */
function Indicator({
  url,
  editing,
  input,
  searchEngineId,
}: {
  url: string;
  editing: boolean;
  input: string;
  searchEngineId: string;
}): JSX.Element {
  if (editing) {
    const intent = resolveAddressInput(input, searchEngineId);
    return intent.kind === 'search' ? (
      <SearchIcon className="text-ink-muted" />
    ) : (
      <LockIcon className="text-ink-muted" />
    );
  }

  const origin = originLabel(url);
  if (origin === null) return <SearchIcon className="text-ink-muted" />;

  return origin.secure ? (
    <LockIcon className="text-ink-muted" />
  ) : (
    <WarningIcon className="text-danger" />
  );
}

export function AddressBar({
  tab,
  searchEngineId,
  bookmarked,
  handleRef,
  onNavigate,
  onToggleBookmark,
}: AddressBarProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [fillNote, setFillNote] = useState<string | null>(null);

  const url = tab?.url ?? '';

  const shown = describeAddress(url);

  // While the user is typing, their text wins over anything the page reports.
  useEffect(() => {
    if (!editing) setValue(shown.text);
  }, [shown.text, editing]);

  // Why a fill did not happen is worth saying, and worth saying only once.
  useEffect(() => {
    if (fillNote === null) return;
    const timer = setTimeout(() => {
      setFillNote(null);
    }, 6000);
    return () => {
      clearTimeout(timer);
    };
  }, [fillNote]);

  useImperativeHandle(handleRef, () => ({
    focus: () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
  }));

  return (
    <form
      className="no-drag focus-ring flex h-4 min-w-0 flex-1 items-center gap-1 rounded-full border border-line bg-surface px-2 transition-colors duration-150 focus-within:bg-raised"
      onSubmit={(event) => {
        event.preventDefault();
        onNavigate(value);
        inputRef.current?.blur();
      }}
    >
      <Indicator url={url} editing={editing} input={value} searchEngineId={searchEngineId} />

      {tab !== null && tab.zoomPercent !== 100 ? (
        <button
          type="button"
          title={`Zoom ${String(tab.zoomPercent)}% — click to reset`}
          aria-label={`Reset zoom, currently ${String(tab.zoomPercent)} percent`}
          onClick={() => {
            window.vela.zoom.set(tab.id, 'reset');
          }}
          className="focus-ring shrink-0 rounded-full border border-line px-1 text-[11px] tabular-nums text-ink-muted hover:text-ink"
        >
          {tab.zoomPercent}%
        </button>
      ) : null}

      <input
        ref={inputRef}
        value={value}
        spellCheck={false}
        autoComplete="off"
        aria-label="Address and search"
        placeholder="Search or enter an address"
        className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-muted"
        onChange={(event) => {
          setValue(event.target.value);
        }}
        onFocus={(event) => {
          setEditing(true);
          setValue(url);
          requestAnimationFrame(() => {
            event.target.select();
          });
        }}
        onBlur={() => {
          setEditing(false);
          setValue(describeAddress(url).text);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            setEditing(false);
            setValue(describeAddress(url).text);
            inputRef.current?.blur();
          }
        }}
      />
      {/* Said here rather than in the placeholder, which is only ever visible
          on an empty address bar — that is, never on the page you just tried
          to fill a login for. */}
      {fillNote === null ? null : (
        <span
          role="status"
          title={fillNote}
          className="min-w-0 max-w-[220px] shrink truncate text-[11px] text-danger"
        >
          {fillNote}
        </span>
      )}

      {tab !== null && tab.internal === null && tab.url !== '' ? (
        <button
          type="button"
          aria-label="Fill saved login"
          title="Fill the saved login for this site"
          onClick={() => {
            setFillNote(null);
            void window.vela.account.fill(tab.id).then((result) => {
              setFillNote(result.ok ? null : result.error);
            });
          }}
          className="focus-ring shrink-0 rounded-lg p-[2px] text-ink-muted transition-colors duration-150 hover:text-ink"
        >
          <KeyIcon width={14} height={14} />
        </button>
      ) : null}

      {tab !== null && tab.internal === null && tab.url !== '' ? (
        <button
          type="button"
          aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this page'}
          title={bookmarked ? 'Bookmarked — click to remove' : 'Bookmark this page'}
          onClick={() => {
            onToggleBookmark();
          }}
          className={`focus-ring shrink-0 rounded-lg p-[2px] transition-colors duration-150 ${
            bookmarked ? 'text-ink' : 'text-ink-muted hover:text-ink'
          }`}
        >
          <StarIcon width={14} height={14} fill={bookmarked ? 'currentColor' : 'none'} />
        </button>
      ) : null}
    </form>
  );
}
