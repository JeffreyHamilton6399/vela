import type { JSX } from 'react';
import type { TabSnapshot } from '../../shared/types/ipc.js';

/**
 * What Vela says when a site refuses to sign you in for being Vela.
 *
 * Without this the page reads as Vela being broken: "Couldn't sign you in"
 * with no explanation, on a browser that has just told you it is private and
 * secure. It is neither a bug nor a password problem, and the honest thing is
 * to say which it is and offer the way round it.
 *
 * The way round is the machine's own browser. Vela cannot pass the check
 * without injecting script into the page to impersonate Chrome's JavaScript,
 * and web content in Vela gets no bridge of any kind — that is the posture the
 * rest of the browser is built on, and one sign-in page does not buy it back.
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
          {service} would not sign you in on this browser.
        </strong>{' '}
        Nothing is wrong with your password. {service} checks for browser features Vela does not
        expose to pages, and Vela will not inject code into a page to pretend otherwise. Signing in
        with your usual browser works, and the rest of {service} is fine here.
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
