import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { displayUrl } from '../../shared/address-input.js';
import type { BrowserState } from '../../shared/types/ipc.js';
import { SearchIcon } from './icons.js';

export interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  run: () => void;
}

interface CommandPaletteProps {
  browser: BrowserState;
  onClose: () => void;
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
}

/** Subsequence match, so "nwt" finds "New tab". Returns null when it misses. */
function score(haystack: string, needle: string): number | null {
  if (needle === '') return 0;

  const target = haystack.toLowerCase();
  const query = needle.toLowerCase();

  const direct = target.indexOf(query);
  if (direct !== -1) return direct;

  let index = 0;
  let last = -1;
  let gaps = 0;

  for (const char of query) {
    const found = target.indexOf(char, index);
    if (found === -1) return null;
    if (last !== -1) gaps += found - last - 1;
    last = found;
    index = found + 1;
  }

  return 100 + gaps;
}

function useCommands(
  browser: BrowserState,
  handlers: Pick<CommandPaletteProps, 'onOpenSettings' | 'onToggleSidebar' | 'onClose'>,
): Command[] {
  return useMemo(() => {
    const commands: Command[] = [
      {
        id: 'new-tab',
        label: 'New tab',
        hint: 'Ctrl+T',
        group: 'Browser',
        run: () => {
          window.vela.tabs.create();
        },
      },
      {
        id: 'private-window',
        label: 'New private window',
        hint: 'Ctrl+Shift+N',
        group: 'Browser',
        run: () => {
          window.vela.window.openPrivate();
        },
      },
      {
        id: 'reopen',
        label: 'Reopen closed tab',
        hint: 'Ctrl+Shift+T',
        group: 'Browser',
        run: () => {
          window.vela.tabs.restoreClosed();
        },
      },
      {
        id: 'sidebar',
        label: 'Toggle sidebar',
        hint: 'Ctrl+B',
        group: 'Browser',
        run: handlers.onToggleSidebar,
      },
      {
        id: 'settings',
        label: 'Open settings',
        hint: 'Ctrl+,',
        group: 'Browser',
        run: handlers.onOpenSettings,
      },
    ];

    for (const tab of browser.tabs) {
      if (tab.id === browser.activeTabId) continue;
      commands.push({
        id: `tab-${tab.id}`,
        label: tab.title,
        ...(tab.url === '' ? {} : { hint: displayUrl(tab.url) }),
        group: 'Tabs',
        run: () => {
          window.vela.tabs.activate(tab.id);
        },
      });
    }

    for (const workspace of browser.workspaces) {
      if (workspace.id === browser.activeWorkspaceId) continue;
      commands.push({
        id: `ws-${workspace.id}`,
        label: workspace.name,
        hint: `${String(workspace.tabCount)} tabs`,
        group: 'Workspaces',
        run: () => {
          window.vela.workspaces.activate(workspace.id);
        },
      });
    }

    return commands;
  }, [browser, handlers.onOpenSettings, handlers.onToggleSidebar]);
}

/**
 * Cmd/Ctrl+K. Searches commands, open tabs and workspaces; anything that is
 * not a command is handed to the address bar's resolver, so typing a URL or a
 * bang here works exactly as it would there.
 */
export function CommandPalette({
  browser,
  onClose,
  onOpenSettings,
  onToggleSidebar,
}: CommandPaletteProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useCommands(browser, { onOpenSettings, onToggleSidebar, onClose });

  const matches = useMemo(() => {
    const scored = commands
      .map((command) => ({
        command,
        rank: score(`${command.label} ${command.hint ?? ''}`, query.trim()),
      }))
      .filter((entry): entry is { command: Command; rank: number } => entry.rank !== null)
      .sort((a, b) => a.rank - b.rank);

    return scored.slice(0, 12).map((entry) => entry.command);
  }, [commands, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  const activeId = browser.activeTabId;

  const runSelected = (): void => {
    const command = matches.at(selected);
    if (command !== undefined) {
      command.run();
      onClose();
      return;
    }

    // Nothing matched: treat it as an address, exactly as the address bar would.
    if (query.trim() !== '' && activeId !== null) {
      window.vela.tabs.navigate(activeId, query);
      onClose();
    }
  };

  return (
    <div
      className="absolute inset-0 flex items-start justify-center bg-surface/80 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        className="mt-6 w-full max-w-[560px] overflow-hidden rounded-card border border-line bg-raised shadow-sm"
      >
        <div className="flex items-center gap-1 border-b border-line px-2">
          <SearchIcon className="text-ink-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            aria-label="Command or address"
            placeholder="Search tabs and commands, or enter an address"
            spellCheck={false}
            className="h-6 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-muted"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
              } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                setSelected((current) => Math.min(current + 1, matches.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setSelected((current) => Math.max(current - 1, 0));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                runSelected();
              }
            }}
          />
        </div>

        <ul className="max-h-[320px] overflow-auto py-1">
          {matches.map((command, index) => (
            <li key={command.id}>
              <button
                type="button"
                aria-current={index === selected ? 'true' : undefined}
                onMouseEnter={() => {
                  setSelected(index);
                }}
                onClick={() => {
                  command.run();
                  onClose();
                }}
                className={`flex w-full items-center gap-2 px-2 py-1 text-left transition-colors duration-100 ${
                  index === selected ? 'bg-hover' : ''
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                  {command.label}
                </span>
                <span className="shrink-0 text-[11px] text-ink-muted">{command.group}</span>
                {command.hint === undefined ? null : (
                  <span className="max-w-[180px] shrink-0 truncate text-[11px] text-ink-muted">
                    {command.hint}
                  </span>
                )}
              </button>
            </li>
          ))}

          {matches.length === 0 ? (
            <li className="px-2 py-2 text-[13px] text-ink-muted">
              Press Enter to open “{query.trim()}”
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
