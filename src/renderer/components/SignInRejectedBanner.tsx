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
 * Vela does put back the parts of Chrome's JavaScript surface Google checks
 * for — see chrome-shim.ts — and on the measured page that is the whole of the
 * gate. It is nobody's guarantee: the check is Google's to change whenever it
 * likes, and a build where the shim did not take behaves as Vela did before.
 * This banner is what that case looks like, and the way round it is the
 * machine's own browser.
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
        Nothing is wrong with your password. {service} checks the browser itself before it checks
        anything you typed, and this time Vela did not satisfy the check — which {service} is free
        to change whenever it likes. Signing in with your usual browser works, and the rest of{' '}
        {service} is fine here.
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
