import type { JSX } from 'react';
import type { TabSnapshot } from '../../shared/types/ipc.js';

/**
 * What Vela says when a site refuses to sign you in for being Vela.
 *
 * Without this the page reads as Vela being broken: "Couldn't sign you in"
 * with no explanation, on a browser that has just told you it is private and
 * secure. It is neither a bug nor a password problem, and the honest thing is
 * to say which it is and hand over the way round it.
 *
 * Vela passes Google's check as of the browser-surface work in policies.ts, so
 * this should not appear on a current build. It stays for the day a site
 * changes what it reads: the copy no longer says the refusal is permanent, and
 * the button is still the thing that works in the meantime.
 */
export function SignInRejectedBanner({ tab }: { tab: TabSnapshot | null }): JSX.Element | null {
  const service = tab?.signInRejectedBy ?? null;
  if (tab === null || service === null) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-2 border-b border-line bg-raised px-3 py-2 text-[12px]"
    >
      <span className="min-w-0 flex-1 text-ink-muted">
        <strong className="font-medium text-ink">
          {service} would not accept this browser just now.
        </strong>{' '}
        Nothing is wrong with your password — {service} checks the browser before it checks anything
        you typed, and this time it said no. Vela normally passes that check, so this is worth
        reporting. Meanwhile you can finish signing in with your usual browser.
      </span>

      <button
        type="button"
        onClick={() => {
          window.vela.tabs.openExternally(tab.id);
        }}
        className="focus-ring shrink-0 rounded-lg border border-line px-2 py-[2px] font-medium text-ink hover:bg-hover"
      >
        Open in my browser
      </button>

      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          window.vela.tabs.dismissRejection(tab.id);
        }}
        className="focus-ring shrink-0 rounded-lg px-2 py-[2px] text-ink-muted hover:bg-hover hover:text-ink"
      >
        Dismiss
      </button>
    </div>
  );
}
