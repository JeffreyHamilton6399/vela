import type { JSX } from 'react';

/**
 * Vela's new tab page is drawn here, by the chrome renderer, rather than
 * loaded into a `WebContentsView`. It therefore makes no network request and
 * has no web-content security surface at all.
 *
 * Stage 5 replaces this placeholder with the Speed Dial.
 */
export function NewTabPage(): JSX.Element {
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface">
      <p className="text-sm text-ink-muted">New Tab</p>
    </div>
  );
}
