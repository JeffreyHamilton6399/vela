import type { JSX } from 'react';
import type { Platform, TabSnapshot, WorkspaceSummary } from '../../shared/types/ipc.js';
import { WorkspaceBar } from './WorkspaceBar.js';
import { ShieldIcon } from './icons.js';
import { TabStrip } from './TabStrip.js';
import { WindowControls } from './WindowControls.js';

interface TitleBarProps {
  platform: Platform;
  maximized: boolean;
  focused: boolean;
  tabs: readonly TabSnapshot[];
  activeTabId: string | null;
  privateSession: boolean;
  workspaces: readonly WorkspaceSummary[];
  activeWorkspaceId: string;
}

/**
 * 40px of chrome holding the tab strip. The bar itself is a drag region; the
 * tabs and controls opt out. On macOS the left padding clears the native
 * traffic lights.
 */
export function TitleBar({
  platform,
  maximized,
  focused,
  tabs,
  activeTabId,
  privateSession,
  workspaces,
  activeWorkspaceId,
}: TitleBarProps): JSX.Element {
  const isMac = platform === 'darwin';

  return (
    <header
      className={`drag flex h-5 shrink-0 items-center gap-1 border-b border-line bg-raised pr-0 transition-opacity duration-200 ${
        focused ? 'opacity-100' : 'opacity-60'
      } ${isMac ? 'pl-10' : 'pl-1'}`}
    >
      {privateSession ? (
        <span
          title="Private window — this session lives only in memory"
          className="no-drag flex shrink-0 items-center gap-[4px] rounded-full border border-line px-1 py-[2px] text-[10px] font-semibold uppercase tracking-wide text-ink-muted"
        >
          <ShieldIcon width={11} height={11} />
          Private
        </span>
      ) : null}

      <TabStrip tabs={tabs} activeTabId={activeTabId} />

      {workspaces.length > 1 ? (
        <div className="mx-1 h-3 w-px shrink-0 bg-line" aria-hidden />
      ) : null}
      <WorkspaceBar workspaces={workspaces} activeId={activeWorkspaceId} />

      {isMac ? <div className="w-1" /> : <WindowControls maximized={maximized} />}
    </header>
  );
}
