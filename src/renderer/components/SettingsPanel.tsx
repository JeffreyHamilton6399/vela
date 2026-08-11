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
    <div className="absolute inset-0 flex flex-col bg-surface">
      {/* A sticky bar, so the way out is visible wherever you have scrolled to. */}
      <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-2 border-b border-line bg-raised px-3 py-2">
        <h1 className="text-[15px] font-semibold tracking-tight text-ink">Settings</h1>

        <div className="flex items-center gap-1">
          <kbd className="rounded border border-line px-1 py-[1px] text-[11px] text-ink-muted">
            Esc
          </kbd>
          <button
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            className="focus-ring flex items-center gap-1 rounded-lg bg-ink px-2 py-1 text-[13px] font-medium text-surface transition-opacity duration-150 hover:opacity-90"
          >
            <CloseIcon width={11} height={11} />
            Done
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-2">
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

          <Section title="Assistant">
            <p className="px-1 text-[12px] leading-relaxed text-ink-muted">
              The sidebar assistant runs on a model of your choosing. The default is a model on
              <em> this machine</em> — no key, no account, and nothing that leaves the computer.
            </p>

            <div className="flex flex-col gap-1 px-1 py-1">
              <label className="flex cursor-pointer items-start gap-2 rounded-lg p-1 hover:bg-hover">
                <input
                  type="radio"
                  name="assistant-provider"
                  checked={settings.assistantProvider === 'ollama'}
                  onChange={() => {
                    set({ assistantProvider: 'ollama' });
                  }}
                  className="focus-ring mt-[3px] h-[14px] w-[14px] shrink-0 accent-ink"
                />
                <span className="min-w-0">
                  <span className="block text-[13px] text-ink">
                    Local model (Ollama) — recommended
                  </span>
                  <span className="block text-[12px] leading-relaxed text-ink-muted">
                    Talks to Ollama on 127.0.0.1. Install it from ollama.com, then run{' '}
                    <code>ollama pull {settings.assistantOllamaModel}</code>. No key, and nothing
                    leaves this machine.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-2 rounded-lg p-1 hover:bg-hover">
                <input
                  type="radio"
                  name="assistant-provider"
                  checked={settings.assistantProvider === 'hosted'}
                  onChange={() => {
                    set({ assistantProvider: 'hosted' });
                  }}
                  className="focus-ring mt-[3px] h-[14px] w-[14px] shrink-0 accent-ink"
                />
                <span className="min-w-0">
                  <span className="block text-[13px] text-ink">
                    Hosted service, with your own key
                  </span>
                  <span className="block text-[12px] leading-relaxed text-ink-muted">
                    Faster and larger, but your messages go to that company. Vela ships without a
                    key: an embedded one would sit in the app bundle for anyone to read.
                  </span>
                </span>
              </label>
            </div>

            {settings.assistantProvider === 'ollama' ? (
              <label className="flex flex-col gap-[3px] px-1 py-1">
                <span className="text-[13px] text-ink">Local model name</span>
                <input
                  value={settings.assistantOllamaModel}
                  onChange={(event) => {
                    set({ assistantOllamaModel: event.target.value });
                  }}
                  spellCheck={false}
                  className="focus-ring rounded-lg border border-line bg-raised px-1 py-1 font-mono text-[12px] text-ink outline-none"
                />
              </label>
            ) : (
              <>
                <label className="flex flex-col gap-[3px] px-1 py-1">
                  <span className="text-[13px] text-ink">API key</span>
                  <input
                    type="password"
                    value={settings.assistantApiKey}
                    onChange={(event) => {
                      set({ assistantApiKey: event.target.value });
                    }}
                    placeholder="gsk_…"
                    spellCheck={false}
                    autoComplete="off"
                    className="focus-ring rounded-lg border border-line bg-raised px-1 py-1 font-mono text-[12px] text-ink outline-none"
                  />
                </label>
                <label className="flex flex-col gap-[3px] px-1 py-1">
                  <span className="text-[13px] text-ink">Model</span>
                  <input
                    value={settings.assistantHostedModel}
                    onChange={(event) => {
                      set({ assistantHostedModel: event.target.value });
                    }}
                    spellCheck={false}
                    className="focus-ring rounded-lg border border-line bg-raised px-1 py-1 font-mono text-[12px] text-ink outline-none"
                  />
                </label>
              </>
            )}
          </Section>

          <Section title="Network">
            <p className="px-1 text-[12px] leading-relaxed text-ink-muted">
              Vela runs no servers, so it has no VPN of its own to offer — and a browser-branded
              “free VPN” is someone else’s machine watching all your traffic, which is the thing
              this browser exists to avoid. Point Vela at a proxy or VPN you already trust and every
              session, private windows included, goes through it.
            </p>

            <Toggle
              label="Route traffic through a proxy"
              description="Applies to new page loads in every window."
              checked={settings.proxyEnabled}
              onChange={(next) => {
                set({ proxyEnabled: next });
              }}
            />

            <label className="flex flex-col gap-[3px] px-1 py-1">
              <span className="text-[13px] text-ink">Proxy rules</span>
              <input
                value={settings.proxyRules}
                onChange={(event) => {
                  set({ proxyRules: event.target.value });
                }}
                placeholder="socks5://127.0.0.1:1080"
                spellCheck={false}
                className="focus-ring rounded-lg border border-line bg-raised px-1 py-1 font-mono text-[12px] text-ink outline-none"
              />
              <span className="text-[11px] text-ink-muted">
                Also accepts Chromium syntax, e.g. http=proxy:8080;https=proxy:8080
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
    </div>
  );
}
