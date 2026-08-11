import { useEffect, useRef, useState, type JSX } from 'react';
import type { WorkspaceSummary } from '../../shared/types/ipc.js';
import type { SidebarTool } from './Sidebar.js';
import {
  CalculatorIcon,
  CloseIcon,
  NotesIcon,
  PlusIcon,
  SettingsIcon,
  ShieldIcon,
  SparkIcon,
  UnitsIcon,
} from './icons.js';

interface WorkspaceRailProps {
  workspaces: readonly WorkspaceSummary[];
  activeId: string;
  sidebarTool: SidebarTool | null;
  onPickTool: (tool: SidebarTool) => void;
  onOpenSettings: () => void;
  onOpenPrivacy: () => void;
}

/** The first letter of a workspace, which is all a 32px square has room for. */
function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

const TOOLS: { id: SidebarTool; label: string; glyph: JSX.Element }[] = [
  { id: 'assistant', label: 'Assistant', glyph: <SparkIcon width={15} height={15} /> },
  { id: 'notes', label: 'Notes', glyph: <NotesIcon width={15} height={15} /> },
  { id: 'calculator', label: 'Calculator', glyph: <CalculatorIcon width={15} height={15} /> },
  { id: 'units', label: 'Unit converter', glyph: <UnitsIcon width={15} height={15} /> },
];

/**
 * The left rail, in the manner of Opera: workspaces at the top, sidebar tools
 * below, app-level controls pinned to the bottom.
 *
 * It replaces the row of pills that used to compete with the tab strip for
 * titlebar space, which stopped working as soon as you had more than two
 * workspaces or a few tabs.
 */
export function WorkspaceRail({
  workspaces,
  activeId,
  sidebarTool,
  onPickTool,
  onOpenSettings,
  onOpenPrivacy,
}: WorkspaceRailProps): JSX.Element {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  return (
    <nav
      aria-label="Workspaces and tools"
      className="flex w-6 shrink-0 flex-col items-center gap-1 border-r border-line bg-raised py-1"
    >
      {workspaces.map((workspace) => {
        const active = workspace.id === activeId;
        return (
          <div key={workspace.id} className="group/ws relative">
            <button
              type="button"
              aria-current={active ? 'true' : undefined}
              title={`${workspace.name} — ${String(workspace.tabCount)} tab${
                workspace.tabCount === 1 ? '' : 's'
              }`}
              onClick={() => {
                window.vela.workspaces.activate(workspace.id);
              }}
              className={`focus-ring flex h-4 w-4 items-center justify-center rounded-lg text-[13px] font-semibold transition-colors duration-150 ${
                active ? 'bg-hover text-ink' : 'text-ink-muted hover:bg-hover hover:text-ink'
              }`}
            >
              {initial(workspace.name)}
            </button>

            {/* One of the two places the Instagram gradient is allowed. */}
            {active ? (
              <span
                aria-hidden
                className="absolute -left-1 top-1/2 h-3 w-[2px] -translate-y-1/2 rounded-full"
                style={{ background: 'var(--vela-gradient)' }}
              />
            ) : null}

            {workspaces.length > 1 ? (
              <button
                type="button"
                aria-label={`Close workspace ${workspace.name}`}
                onClick={() => {
                  window.vela.workspaces.remove(workspace.id);
                }}
                className="focus-ring absolute -right-[3px] -top-[3px] hidden h-[14px] w-[14px] items-center justify-center rounded-full border border-line bg-raised text-ink-muted hover:text-danger group-hover/ws:flex"
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
            maxLength={60}
            className="w-4 rounded-lg border border-line bg-surface px-[2px] py-[2px] text-center text-[11px] text-ink outline-none"
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
          className="focus-ring flex h-4 w-4 items-center justify-center rounded-lg text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
        >
          <PlusIcon width={12} height={12} />
        </button>
      )}

      <span aria-hidden className="my-[2px] h-px w-3 bg-line" />

      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          aria-pressed={sidebarTool === tool.id}
          title={tool.label}
          aria-label={tool.label}
          onClick={() => {
            onPickTool(tool.id);
          }}
          className={`focus-ring flex h-4 w-4 items-center justify-center rounded-lg transition-colors duration-150 ${
            sidebarTool === tool.id
              ? 'bg-hover text-ink'
              : 'text-ink-muted hover:bg-hover hover:text-ink'
          }`}
        >
          {tool.glyph}
        </button>
      ))}

      <span className="flex-1" />

      <button
        type="button"
        title="What Vela collects"
        aria-label="What Vela collects"
        onClick={onOpenPrivacy}
        className="focus-ring flex h-4 w-4 items-center justify-center rounded-lg text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
      >
        <ShieldIcon width={15} height={15} />
      </button>

      <button
        type="button"
        title="Settings"
        aria-label="Settings"
        onClick={onOpenSettings}
        className="focus-ring flex h-4 w-4 items-center justify-center rounded-lg text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
      >
        <SettingsIcon width={15} height={15} />
      </button>
    </nav>
  );
}
