import { useState, type JSX, type ReactNode } from 'react';
import type { Settings } from '../../shared/settings.js';
import { SEARCH_ENGINES } from '../../shared/search-engines.js';
import { BANGS } from '../../shared/bangs.js';
import { CloseIcon } from './icons.js';

interface SettingsPanelProps {
  settings: Settings;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="flex flex-col gap-1 border-t border-line pt-2">
      <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">{title}</h2>
      {children}
    </section>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}): JSX.Element {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 transition-colors duration-150 hover:bg-hover">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        className="focus-ring mt-[3px] h-[14px] w-[14px] shrink-0 accent-ink"
      />
      <span className="min-w-0">
        <span className="block text-[13px] text-ink">{label}</span>
        <span className="block text-[12px] leading-relaxed text-ink-muted">{description}</span>
      </span>
    </label>
  );
}

/**
 * Settings, and the plain statement of what Vela does and does not collect.
 * Everything here is stored in one local JSON file, which the export button
 * hands back verbatim.
 */
export function SettingsPanel({ settings, onClose }: SettingsPanelProps): JSX.Element {
  const [importState, setImportState] = useState<string | null>(null);
  const [exported, setExported] = useState<string | null>(null);

  // Bound, because the bridge object is frozen across the context boundary.
  const set = (patch: Parameters<typeof window.vela.settings.set>[0]): void => {
    window.vela.settings.set(patch);
  };

  return (
    <div className="absolute inset-0 overflow-auto bg-surface p-4">
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-lg font-semibold tracking-tight text-ink">Settings</h1>
          <button
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            className="focus-ring flex h-4 w-4 items-center justify-center rounded-lg text-ink-muted hover:bg-hover hover:text-ink"
          >
            <CloseIcon width={12} height={12} />
          </button>
        </div>

        <Section title="Search">
          <label className="flex items-center justify-between gap-2 px-1 py-1">
            <span className="text-[13px] text-ink">Default search engine</span>
            <select
              value={settings.searchEngineId}
              onChange={(event) => {
                set({ searchEngineId: event.target.value });
              }}
              className="focus-ring rounded-lg border border-line bg-raised px-1 py-1 text-[13px] text-ink outline-none"
            >
              {SEARCH_ENGINES.map((engine) => (
                <option key={engine.id} value={engine.id}>
                  {engine.name}
                </option>
              ))}
            </select>
          </label>

          <p className="px-1 text-[12px] leading-relaxed text-ink-muted">
            Bang shortcuts are resolved on this machine, so{' '}
            {BANGS.map((b) => `!${b.bang}`).join(', ')} go straight to the site without a search
            engine seeing the query.
          </p>
        </Section>

        <Section title="Appearance">
          <label className="flex items-center justify-between gap-2 px-1 py-1">
            <span className="text-[13px] text-ink">Theme</span>
            <select
              value={settings.theme}
              onChange={(event) => {
                const value = event.target.value;
                if (value === 'system' || value === 'light' || value === 'dark') {
                  set({ theme: value });
                }
              }}
              className="focus-ring rounded-lg border border-line bg-raised px-1 py-1 text-[13px] text-ink outline-none"
            >
              <option value="system">Follow the system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </Section>

        <Section title="Privacy">
          <Toggle
            label="Block ads and trackers"
            description="EasyList and EasyPrivacy, compiled into the app at build time. Vela never fetches a filter list at runtime."
            checked={settings.blockAdsAndTrackers}
            onChange={(next) => {
              set({ blockAdsAndTrackers: next });
            }}
          />
          <Toggle
            label="Force HTTPS"
            description="Upgrade plain http addresses, and warn before ever falling back."
            checked={settings.forceHttps}
            onChange={(next) => {
              set({ forceHttps: next });
            }}
          />
          <Toggle
            label="Strip cross-origin Referer"
            description="Do not tell a site which other site you came from. Same-origin referers are kept, since they leak nothing new."
            checked={settings.stripCrossOriginReferer}
            onChange={(next) => {
              set({ stripCrossOriginReferer: next });
            }}
          />
          <Toggle
            label="Clear cookies, cache and storage on exit"
            description="Wipes this profile's browsing data every time Vela closes."
            checked={settings.clearOnExit}
            onChange={(next) => {
              set({ clearOnExit: next });
            }}
          />
          <Toggle
            label="Check for updates"
            description="One plain GET to the GitHub Releases feed. No install id, no query parameters, no fingerprint."
            checked={settings.checkForUpdates}
            onChange={(next) => {
              set({ checkForUpdates: next });
            }}
          />
        </Section>

        <Section title="Performance">
          <label className="flex items-center justify-between gap-2 px-1 py-1">
            <span className="min-w-0 text-[13px] text-ink">
              Suspend background tabs after
              <span className="block text-[12px] text-ink-muted">
                A suspended tab gives its renderer process back and keeps its title and icon.
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <input
                type="number"
                min={1}
                max={240}
                value={settings.suspendAfterMinutes}
                onChange={(event) => {
                  const minutes = Number.parseInt(event.target.value, 10);
                  if (Number.isInteger(minutes) && minutes >= 1 && minutes <= 240) {
                    set({ suspendAfterMinutes: minutes });
                  }
                }}
                aria-label="Minutes before a background tab is suspended"
                className="focus-ring w-[64px] rounded-lg border border-line bg-raised px-1 py-1 text-right text-[13px] text-ink outline-none"
              />
              <span className="text-[12px] text-ink-muted">min</span>
            </span>
          </label>
        </Section>

        <Section title="Your data">
          <p className="px-1 text-[12px] leading-relaxed text-ink-muted">
            Vela collects nothing. There is no account, no server, and no analytics. Everything it
            remembers is in one local JSON file, and the button below shows you exactly what is in
            it.
          </p>

          <div className="flex flex-wrap items-center gap-1 px-1 pt-1">
            <button
              type="button"
              className="focus-ring rounded-lg bg-ink px-2 py-1 text-[13px] font-medium text-surface transition-opacity duration-150 hover:opacity-90"
              onClick={() => {
                void window.vela.settings.export().then(setExported);
              }}
            >
              Export settings
            </button>

            <label className="focus-ring cursor-pointer rounded-lg border border-line px-2 py-1 text-[13px] text-ink transition-colors duration-150 hover:bg-hover">
              Import settings
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file === undefined) return;
                  void file.text().then(async (json) => {
                    const result = await window.vela.settings.import(json);
                    setImportState(result.message);
                  });
                }}
              />
            </label>

            {importState === null ? null : (
              <span className="text-[12px] text-ink-muted">{importState}</span>
            )}
          </div>

          {exported === null ? null : (
            <textarea
              readOnly
              value={exported}
              aria-label="Exported settings"
              className="mt-1 h-[180px] w-full resize-none rounded-lg border border-line bg-raised p-1 font-mono text-[11px] text-ink outline-none"
            />
          )}
        </Section>
      </div>
    </div>
  );
}
