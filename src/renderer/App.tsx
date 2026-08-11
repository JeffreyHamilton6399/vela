import type { JSX } from 'react';
import { TitleBar } from './components/TitleBar.js';
import { useAppInfo } from './hooks/useAppInfo.js';
import { useWindowState } from './hooks/useWindowState.js';

/** Temporary stage-1 body. Stage 2 replaces this with the address bar and the
 *  region a WebContentsView is positioned over. */
function StagePlaceholder(): JSX.Element {
  const info = useAppInfo();

  return (
    <main className="flex flex-1 items-center justify-center bg-surface p-4">
      <section className="w-full max-w-[440px] rounded-card border border-line bg-raised p-3">
        <h1 className="text-lg font-semibold tracking-tight text-ink">Vela</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          Stage 1 — window shell, preload bridge, and typed IPC. Web content arrives in stage 2.
        </p>

        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[13px]">
          <dt className="text-ink-muted">Version</dt>
          <dd className="text-ink tabular-nums">{info?.version ?? '—'}</dd>
          <dt className="text-ink-muted">Electron</dt>
          <dd className="text-ink tabular-nums">{info?.electronVersion ?? '—'}</dd>
          <dt className="text-ink-muted">Chromium</dt>
          <dd className="text-ink tabular-nums">{info?.chromeVersion ?? '—'}</dd>
          <dt className="text-ink-muted">Platform</dt>
          <dd className="text-ink">{info?.platform ?? '—'}</dd>
        </dl>

        <p className="mt-3 border-t border-line pt-2 text-[13px] text-ink-muted">
          Network requests made so far: <span className="text-ink tabular-nums">0</span>
        </p>
      </section>
    </main>
  );
}

export function App(): JSX.Element {
  const { maximized, focused } = useWindowState();

  return (
    <div className="flex h-full flex-col bg-surface">
      <TitleBar platform={window.vela.platform} maximized={maximized} focused={focused} />
      <StagePlaceholder />
    </div>
  );
}
