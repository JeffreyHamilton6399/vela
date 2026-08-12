import type { JSX, RefObject } from 'react';
import type { TabSnapshot } from '../../shared/types/ipc.js';
import { AddressBar, type AddressBarHandle } from './AddressBar.js';
import { IconButton } from './IconButton.js';
import { ArrowLeftIcon, ArrowRightIcon, CloseIcon, ReloadIcon } from './icons.js';

interface ToolbarProps {
  tab: TabSnapshot | null;
  searchEngineId: string;
  bookmarked: boolean;
  onToggleBookmark: () => void;
  addressRef: RefObject<AddressBarHandle | null>;
  trailing?: JSX.Element;
}

/** 48px of navigation controls above the page. */
export function Toolbar({
  tab,
  searchEngineId,
  bookmarked,
  onToggleBookmark,
  addressRef,
  trailing,
}: ToolbarProps): JSX.Element {
  const id = tab?.id ?? null;

  return (
    <div className="drag flex h-6 shrink-0 items-center gap-1 border-b border-line bg-raised px-1">
      <IconButton
        label="Back"
        hint="alt+←"
        disabled={!(tab?.canGoBack ?? false)}
        onClick={() => {
          if (id !== null) window.vela.tabs.goBack(id);
        }}
      >
        <ArrowLeftIcon />
      </IconButton>

      <IconButton
        label="Forward"
        hint="alt+→"
        disabled={!(tab?.canGoForward ?? false)}
        onClick={() => {
          if (id !== null) window.vela.tabs.goForward(id);
        }}
      >
        <ArrowRightIcon />
      </IconButton>

      {tab?.loading === true ? (
        <IconButton
          label="Stop"
          onClick={() => {
            if (id !== null) window.vela.tabs.stop(id);
          }}
        >
          <CloseIcon />
        </IconButton>
      ) : (
        <IconButton
          label="Reload"
          hint="mod+R"
          disabled={tab?.internal !== null}
          onClick={() => {
            if (id !== null) window.vela.tabs.reload(id);
          }}
        >
          <ReloadIcon />
        </IconButton>
      )}

      <AddressBar
        tab={tab}
        searchEngineId={searchEngineId}
        bookmarked={bookmarked}
        onToggleBookmark={onToggleBookmark}
        handleRef={addressRef}
        onNavigate={(input) => {
          if (id !== null) window.vela.tabs.navigate(id, input);
        }}
      />

      {trailing}
    </div>
  );
}
