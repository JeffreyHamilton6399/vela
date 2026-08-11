import type { JSX } from 'react';
import type { TabSnapshot } from '../../shared/types/ipc.js';
import { WarningIcon } from './icons.js';

interface InsecureInterstitialProps {
  tab: TabSnapshot;
}

/**
 * Shown instead of the page when Vela could not reach a site over https.
 * Drawn by the chrome renderer, so the warning is never something the site
 * itself can style, spoof, or script.
 */
export function InsecureInterstitial({ tab }: InsecureInterstitialProps): JSX.Element {
  const url = tab.interstitialUrl ?? '';
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* show the raw string */
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-surface p-4">
      <section className="w-full max-w-[460px] rounded-card border border-line bg-raised p-3">
        <div className="flex items-center gap-1 text-danger">
          <WarningIcon width={18} height={18} />
          <h1 className="text-[15px] font-semibold tracking-tight">This site is not secure</h1>
        </div>

        <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
          Vela could not reach <span className="font-medium text-ink">{host}</span> over an
          encrypted connection. Anything you send would travel in plain text, and anyone on the
          network between you and the site could read or change it.
        </p>

        <div className="mt-3 flex items-center gap-1">
          <button
            type="button"
            className="focus-ring rounded-lg bg-ink px-2 py-1 text-[13px] font-medium text-surface transition-opacity duration-150 hover:opacity-90"
            onClick={() => {
              window.vela.tabs.showNewTabPage(tab.id);
            }}
          >
            Go back
          </button>
          <button
            type="button"
            className="focus-ring rounded-lg px-2 py-1 text-[13px] text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
            onClick={() => {
              window.vela.tabs.continueInsecure(tab.id);
            }}
          >
            Continue to {host} anyway
          </button>
        </div>

        <p className="mt-2 text-[12px] text-ink-muted">
          Continuing remembers this choice for {host} only.
        </p>
      </section>
    </div>
  );
}
