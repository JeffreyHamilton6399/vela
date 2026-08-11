import type { JSX } from 'react';
import type { TabSnapshot } from '../../shared/types/ipc.js';
import { ShieldIcon } from './icons.js';

interface BlockedCountProps {
  tab: TabSnapshot | null;
  onClick: () => void;
}

/**
 * Per-page count of blocked ad and tracker requests. It resets on every
 * top-level navigation, so the number always describes the page in front of
 * you rather than a running total.
 */
export function BlockedCount({ tab, onClick }: BlockedCountProps): JSX.Element | null {
  if (tab?.internal !== null) return null;

  const count = tab.blockedCount;
  const label =
    count === 0 ? 'Nothing blocked on this page' : `${String(count)} trackers blocked on this page`;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="no-drag focus-ring flex h-4 shrink-0 items-center gap-[4px] rounded-full px-1 text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
    >
      <ShieldIcon width={15} height={15} />
      <span className="min-w-[10px] text-[12px] font-medium tabular-nums">{count}</span>
    </button>
  );
}
