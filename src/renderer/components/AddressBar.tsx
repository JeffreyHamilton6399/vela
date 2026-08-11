import { useEffect, useImperativeHandle, useRef, useState, type JSX, type RefObject } from 'react';
import { displayUrl, originLabel, resolveAddressInput } from '../../shared/address-input.js';
import type { TabSnapshot } from '../../shared/types/ipc.js';
import { LockIcon, SearchIcon, WarningIcon } from './icons.js';

export interface AddressBarHandle {
  focus: () => void;
}

interface AddressBarProps {
  tab: TabSnapshot | null;
  searchEngineId: string;
  handleRef: RefObject<AddressBarHandle | null>;
  onNavigate: (input: string) => void;
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
  handleRef,
  onNavigate,
}: AddressBarProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');

  const url = tab?.url ?? '';

  // While the user is typing, their text wins over anything the page reports.
  useEffect(() => {
    if (!editing) setValue(displayUrl(url));
  }, [url, editing]);

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

      <input
        ref={inputRef}
        value={value}
        spellCheck={false}
        autoComplete="off"
        aria-label="Address and search"
        placeholder="Search DuckDuckGo or enter an address"
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
          setValue(displayUrl(url));
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            setEditing(false);
            setValue(displayUrl(url));
            inputRef.current?.blur();
          }
        }}
      />
    </form>
  );
}
