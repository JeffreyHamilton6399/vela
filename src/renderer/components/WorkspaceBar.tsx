import { useEffect, useRef, useState, type JSX } from 'react';
import type { WorkspaceSummary } from '../../shared/types/ipc.js';
import { CloseIcon, PlusIcon } from './icons.js';

interface WorkspaceBarProps {
  workspaces: readonly WorkspaceSummary[];
  activeId: string;
}

/**
 * Named tab groups. Switching away suspends the workspace you left, so an
 * unused workspace costs storage for its titles and nothing else.
 *
 * It lives in the titlebar next to the tab strip and stays out of the way when
 * there is only one workspace, which is the common case.
 */
export function WorkspaceBar({ workspaces, activeId }: WorkspaceBarProps): JSX.Element | null {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  if (workspaces.length === 0) return null;

  // With one workspace there is nothing to switch between, so only the button
  // that creates a second one is shown. Restraint over completeness.
  const pills = workspaces.length > 1 ? workspaces : [];

  return (
    <div className="no-drag flex shrink-0 items-center gap-[2px]" aria-label="Workspaces">
      {pills.map((workspace) => {
        const active = workspace.id === activeId;
        return (
          <div key={workspace.id} className="group/ws relative flex items-center">
            <button
              type="button"
              aria-current={active ? 'true' : undefined}
              title={`${workspace.name} — ${String(workspace.tabCount)} tab${
                workspace.tabCount === 1 ? '' : 's'
              }`}
              onClick={() => {
                window.vela.workspaces.activate(workspace.id);
              }}
              className={`focus-ring max-w-[130px] truncate rounded-lg px-1 py-[3px] text-[11px] font-medium transition-colors duration-150 ${
                active ? 'bg-hover text-ink' : 'text-ink-muted hover:bg-hover hover:text-ink'
              }`}
            >
              {workspace.name}
              <span className="ml-[4px] tabular-nums opacity-60">{workspace.tabCount}</span>
            </button>

            {workspaces.length > 1 ? (
              <button
                type="button"
                aria-label={`Close workspace ${workspace.name}`}
                onClick={() => {
                  window.vela.workspaces.remove(workspace.id);
                }}
                className="focus-ring absolute -right-[3px] -top-[3px] hidden h-[14px] w-[14px] items-center justify-center rounded-full bg-raised text-ink-muted hover:text-danger group-hover/ws:flex"
              >
                <CloseIcon width={7} height={7} />
              </button>
            ) : null}
          </div>
        );
      })}

      {creating ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const name = draft.trim();
            if (name !== '') window.vela.workspaces.create(name);
            setDraft('');
            setCreating(false);
          }}
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            onBlur={() => {
              setCreating(false);
              setDraft('');
            }}
            aria-label="Name for the new workspace"
            placeholder="Workspace"
            maxLength={60}
            className="w-[110px] rounded-lg border border-line bg-surface px-1 py-[2px] text-[11px] text-ink outline-none"
          />
        </form>
      ) : (
        <button
          type="button"
          aria-label="New workspace"
          title="New workspace"
          onClick={() => {
            setCreating(true);
          }}
          className="focus-ring flex h-[20px] w-[20px] items-center justify-center rounded-lg text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
        >
          <PlusIcon width={11} height={11} />
        </button>
      )}
    </div>
  );
}
