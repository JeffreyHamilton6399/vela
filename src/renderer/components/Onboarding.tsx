import { useState, type JSX } from 'react';
import type { Settings } from '../../shared/settings.js';
import { SEARCH_ENGINES } from '../../shared/search-engines.js';
import { ShieldIcon } from './icons.js';

interface OnboardingProps {
  settings: Settings;
}

/**
 * The first-run screen.
 *
 * It asks for the one decision Vela cannot make on your behalf — which search
 * engine your typing goes to — and says plainly which of them will build a
 * profile from it. Every other default is already the private one; this screen
 * shows them rather than hiding them in a panel nobody opens.
 */
export function Onboarding({ settings }: OnboardingProps): JSX.Element {
  const [engineId, setEngineId] = useState(settings.searchEngineId);
  const [blockAds, setBlockAds] = useState(settings.blockAdsAndTrackers);
  const [keepHistory, setKeepHistory] = useState(settings.keepHistory);

  const finish = (): void => {
    window.vela.settings.set({
      searchEngineId: engineId,
      blockAdsAndTrackers: blockAds,
      keepHistory,
      onboardingComplete: true,
    });
  };

  return (
    <div className="absolute inset-0 z-20 overflow-auto bg-surface">
      <div className="mx-auto flex w-full max-w-[620px] flex-col gap-4 px-3 py-8">
        <div className="flex flex-col items-center gap-1 text-center">
          <div
            aria-hidden
            className="mb-1 h-6 w-6 rounded-card"
            style={{ background: 'var(--vela-gradient)' }}
          />
          <h1 className="text-[26px] font-semibold tracking-tight text-ink">Welcome to Vela</h1>
          <p className="max-w-[420px] text-[13px] leading-relaxed text-ink-muted">
            Vela has no account and no server. Nothing you do here leaves this machine except the
            pages you ask for.
          </p>
        </div>

        <section className="flex flex-col gap-1">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
            Where should your searches go?
          </h2>

          <div className="grid grid-cols-2 gap-1">
            {SEARCH_ENGINES.map((engine) => {
              const selected = engine.id === engineId;
              return (
                <button
                  key={engine.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setEngineId(engine.id);
                  }}
                  className={`focus-ring flex flex-col items-start gap-[2px] rounded-card border p-2 text-left transition-colors duration-150 ${
                    selected ? 'border-ink bg-raised' : 'border-line hover:bg-hover'
                  }`}
                >
                  <span className="flex w-full items-center justify-between gap-1">
                    <span className="text-[14px] font-medium text-ink">{engine.name}</span>
                    {engine.tracks ? null : (
                      <ShieldIcon width={13} height={13} className="shrink-0 text-ink-muted" />
                    )}
                  </span>
                  <span className="text-[12px] leading-snug text-ink-muted">{engine.blurb}</span>
                </button>
              );
            })}
          </div>

          <p className="text-[11px] text-ink-muted">
            The shield marks engines that do not build a profile from your searches. You can change
            this later in Settings.
          </p>
        </section>

        <section className="flex flex-col gap-1 border-t border-line pt-3">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
            Two more choices
          </h2>

          <label className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 hover:bg-hover">
            <input
              type="checkbox"
              checked={blockAds}
              onChange={(event) => {
                setBlockAds(event.target.checked);
              }}
              className="focus-ring mt-[3px] h-[14px] w-[14px] shrink-0 accent-ink"
            />
            <span>
              <span className="block text-[13px] text-ink">Block ads and trackers</span>
              <span className="block text-[12px] text-ink-muted">
                EasyList and EasyPrivacy, compiled into the app. No filter list is ever fetched at
                runtime.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 hover:bg-hover">
            <input
              type="checkbox"
              checked={keepHistory}
              onChange={(event) => {
                setKeepHistory(event.target.checked);
              }}
              className="focus-ring mt-[3px] h-[14px] w-[14px] shrink-0 accent-ink"
            />
            <span>
              <span className="block text-[13px] text-ink">Keep local history</span>
              <span className="block text-[12px] text-ink-muted">
                Stored on this machine so the address bar and command palette can find pages again.
                Private windows are never recorded.
              </span>
            </span>
          </label>
        </section>

        <button
          type="button"
          onClick={finish}
          className="focus-ring mt-1 self-center rounded-full bg-ink px-4 py-2 text-[14px] font-semibold text-surface transition-opacity duration-150 hover:opacity-90"
        >
          Start browsing
        </button>
      </div>
    </div>
  );
}
