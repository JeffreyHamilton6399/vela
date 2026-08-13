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
 * Google's refusal is not a check Vela can pass — see rejection.ts for what was
 * tried and what it cost. The copy says so plainly rather than implying a fix
 * is coming, and the button is the one thing that actually works: the same
 * address, in the browser Google already trusts.
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
          {service} does not allow sign-in from browsers it does not recognise.
        </strong>{' '}
        Nothing is wrong with your password — {service} checks the browser before it checks anything
        you typed, and it only accepts a short list of them. That is {service}&rsquo;s decision, not
        a fault Vela can fix. Sign in with your usual browser; the rest of {service} works here.
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
