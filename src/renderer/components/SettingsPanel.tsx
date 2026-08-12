import { useEffect, useState, type JSX, type ReactNode } from 'react';
import type { Settings } from '../../shared/settings.js';
import { SEARCH_ENGINES } from '../../shared/search-engines.js';
import { BANGS } from '../../shared/bangs.js';
import { PROXY_PRESETS, presetForRules, SUGGESTED_MODELS } from '../../shared/providers.js';
import { LocalModelPicker } from './LocalModelPicker.js';
import type { AssistantStatus } from '../../shared/types/ipc.js';
import { AccountSection } from './AccountSection.js';
import { CloseIcon } from './icons.js';

interface SettingsPanelProps {
  settings: Settings;
  onClose: () => void;
}

/**
 * Settings grew past the point where one scroll was findable. Each category is
 * a page of its own, with the list on the left, so nothing is more than one
 * click away and no section hides below a fold.
 */
const CATEGORIES = [
  { id: 'general', label: 'General' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'account', label: 'Account' },
  { id: 'assistant', label: 'Assistant' },
  { id: 'network', label: 'VPN & proxy' },
  { id: 'data', label: 'Your data' },
] as const;

type CategoryId = (typeof CATEGORIES)[number]['id'];

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
 * Chooses which local model the assistant uses.
 *
 * The list is whatever Ollama reports as installed, so it is accurate rather
 * than aspirational, and anything else can be pulled from here without leaving
 * Vela for a terminal.
 */
function ModelPicker({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (model: string) => void;
}): JSX.Element {
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [pulling, setPulling] = useState<string | null>(null);
  const [command, setCommand] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = (): void => {
    void window.vela.assistant.status().then(setStatus);
  };

  useEffect(refresh, []);

  const installed = status?.models ?? [];
  const available = SUGGESTED_MODELS.filter(
    (model) => !installed.some((name) => name === model.name || name === model.name + ':latest'),
  );

  return (
    <div className="flex flex-col gap-1 px-1 py-1">
      {status !== null && !status.ready ? (
        <div className="flex flex-col gap-1 rounded-lg border border-line bg-raised p-1">
          <p className="text-[12px] leading-relaxed text-ink-muted">
            No local model server found. Ollama is a separate free program that runs models on your
            machine — Vela cannot bundle it, but it is one command away.
          </p>

          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => {
                void window.vela.assistant.install().then((result) => {
                  setCommand(result.command);
                });
              }}
              className="focus-ring rounded-lg bg-ink px-2 py-1 text-[12px] font-medium text-surface hover:opacity-90"
            >
              Get Ollama
            </button>
            <button
              type="button"
              onClick={refresh}
              className="focus-ring rounded-lg border border-line px-2 py-1 text-[12px] text-ink hover:bg-hover"
            >
              Check again
            </button>
          </div>

          {command === null ? null : (
            <p className="text-[11px] leading-relaxed text-ink-muted">
              Or run <code className="text-ink">{command}</code> — then press “Check again”.
            </p>
          )}
        </div>
      ) : null}

      <label className="flex flex-col gap-[3px]">
        <span className="text-[13px] text-ink">Installed model</span>
        {installed.length === 0 ? (
          <input
            value={selected}
            onChange={(event) => {
              onSelect(event.target.value);
            }}
            spellCheck={false}
            className="focus-ring rounded-lg border border-line bg-raised px-1 py-1 font-mono text-[12px] text-ink outline-none"
          />
        ) : (
          <select
            value={installed.includes(selected) ? selected : (installed[0] ?? selected)}
            onChange={(event) => {
              onSelect(event.target.value);
            }}
            className="focus-ring rounded-lg border border-line bg-raised px-1 py-1 text-[13px] text-ink outline-none"
          >
            {installed.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
      </label>

      {available.length > 0 && status?.ready === true ? (
        <div className="flex flex-col gap-[3px] pt-1">
          <span className="text-[12px] text-ink-muted">Download another</span>
          {available.map((model) => (
            <div key={model.name} className="flex items-center gap-1">
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[12px] text-ink">{model.name}</span>
                <span className="block text-[11px] text-ink-muted">
                  {model.size} — {model.note}
                </span>
              </span>
              <button
                type="button"
                disabled={pulling !== null}
                onClick={() => {
                  setPulling(model.name);
                  setError(null);
                  void window.vela.assistant.pull(model.name).then((result) => {
                    setPulling(null);
                    if (result.ok) {
                      onSelect(model.name);
                      refresh();
                    } else {
                      setError(result.error);
                    }
                  });
                }}
                className="focus-ring shrink-0 rounded-lg border border-line px-1 py-[3px] text-[11px] text-ink transition-colors duration-150 hover:bg-hover disabled:opacity-40"
              >
                {pulling === model.name ? 'Downloading…' : 'Get'}
              </button>
            </div>
          ))}
          {pulling === null ? null : (
            <span className="text-[11px] text-ink-muted">
              This downloads several gigabytes and can take a while.
            </span>
          )}
          {error === null ? null : <span className="text-[11px] text-danger">{error}</span>}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Settings, and the plain statement of what Vela does and does not collect.
 * Everything here is stored in one local JSON file, which the export button
 * hands back verbatim.
 */
export function SettingsPanel({ settings, onClose }: SettingsPanelProps): JSX.Element {
  const [category, setCategory] = useState<CategoryId>('general');
  const [importState, setImportState] = useState<string | null>(null);
  const [exported, setExported] = useState<string | null>(null);

  // Bound, because the bridge object is frozen across the context boundary.
  const set = (patch: Parameters<typeof window.vela.settings.set>[0]): void => {
    window.vela.settings.set(patch);
  };

  return (
    <div
      className="absolute inset-0 z-10 flex items-start justify-center bg-surface/70 p-3 backdrop-blur-sm"
      onClick={(event) => {
        // Clicking the dimmed area around the dialog closes it.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label="Settings"
        aria-modal="true"
        className="flex max-h-full w-full max-w-[560px] flex-col overflow-hidden rounded-card border border-line bg-surface shadow-sm"
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-raised px-2 py-1">
          <h1 className="text-[14px] font-semibold tracking-tight text-ink">Settings</h1>
          <button
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            className="focus-ring flex h-4 w-4 items-center justify-center rounded-lg text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
          >
            <CloseIcon width={12} height={12} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav
            aria-label="Settings categories"
            className="flex w-[150px] shrink-0 flex-col gap-[2px] border-r border-line bg-raised p-1"
          >
            {CATEGORIES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-current={category === entry.id ? 'page' : undefined}
                onClick={() => {
                  setCategory(entry.id);
                }}
                className={`focus-ring rounded-lg px-2 py-1 text-left text-[13px] transition-colors duration-150 ${
                  category === entry.id
                    ? 'bg-hover font-medium text-ink'
                    : 'text-ink-muted hover:bg-hover hover:text-ink'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-auto p-2">
            <div className="flex w-full flex-col gap-2">
              {category === 'general' ? (
                <>
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
                      {BANGS.map((b) => `!${b.bang}`).join(', ')} go straight to the site without a
                      search engine seeing the query.
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
                </>
              ) : null}

              {category === 'privacy' ? (
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
                    label="Trim cross-origin Referer"
                    description="Tell another site only which site you came from, never which page. Same-origin referers are kept whole, since they leak nothing new."
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
              ) : null}

              {category === 'general' ? (
                <Section title="Performance">
                  <label className="flex items-center justify-between gap-2 px-1 py-1">
                    <span className="min-w-0 text-[13px] text-ink">
                      Suspend background tabs after
                      <span className="block text-[12px] text-ink-muted">
                        A suspended tab gives its renderer process back and keeps its title and
                        icon.
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
              ) : null}

              {category === 'account' ? (
                <>
                  <Section title="Vela account">
                    <AccountSection />
                  </Section>

                  <Section title="Signing in to websites">
                    <label className="flex items-center justify-between gap-2 px-1 py-1">
                      <span className="min-w-0 text-[13px] text-ink">
                        When you open a site you have saved
                        <span className="block text-[12px] leading-relaxed text-ink-muted">
                          Only sites in your vault. A site you have never saved a password for gets
                          nothing from Vela, whichever setting this is on.
                        </span>
                      </span>
                      <select
                        value={settings.loginAutofill}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (value === 'off' || value === 'fill' || value === 'submit') {
                            set({ loginAutofill: value });
                          }
                        }}
                        className="focus-ring shrink-0 rounded-lg border border-line bg-raised px-1 py-1 text-[13px] text-ink outline-none"
                      >
                        <option value="off">Do nothing</option>
                        <option value="fill">Fill the login</option>
                        <option value="submit">Fill it and sign in</option>
                      </select>
                    </label>

                    <p className="px-1 pb-1 text-[12px] leading-relaxed text-ink-muted">
                      “Fill it and sign in” presses the login button for you, which is the only
                      setting that gets you through a sign-in without touching anything. It stops
                      where a site does: a second factor, a code from your phone, or a “was this
                      you?” prompt is still yours to answer.
                    </p>

                    <Toggle
                      label="Offer to save logins you type"
                      description="The one setting that widens where Vela injects: to notice a login on a site you have not saved yet, it has to watch pages it holds nothing for. The watcher reads nothing until a login is submitted, and runs nowhere while you are signed out of Vela."
                      checked={settings.offerToSaveLogins}
                      onChange={(next) => {
                        set({ offerToSaveLogins: next });
                      }}
                    />
                  </Section>
                </>
              ) : null}

              {category === 'assistant' ? (
                <Section title="Assistant">
                  <p className="px-1 text-[12px] leading-relaxed text-ink-muted">
                    The sidebar assistant runs on a model of your choosing. The default is a model
                    on
                    <em> this machine</em> — no key, no account, and nothing that leaves the
                    computer.
                  </p>

                  <div className="flex flex-col gap-1 px-1 py-1">
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg p-1 hover:bg-hover">
                      <input
                        type="radio"
                        name="assistant-provider"
                        checked={settings.assistantProvider === 'local'}
                        onChange={() => {
                          set({ assistantProvider: 'local' });
                        }}
                        className="focus-ring mt-[3px] h-[14px] w-[14px] shrink-0 accent-ink"
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] text-ink">In Vela — recommended</span>
                        <span className="block text-[12px] leading-relaxed text-ink-muted">
                          The model runs inside Vela itself. Nothing to install, no port to talk to,
                          and no request to leave: pick one below and it downloads once.
                        </span>
                      </span>
                    </label>

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
                          Ollama, if you already run it
                        </span>
                        <span className="block text-[12px] leading-relaxed text-ink-muted">
                          Talks to Ollama on 127.0.0.1. Install it from ollama.com, then run{' '}
                          <code>ollama pull {settings.assistantOllamaModel}</code>. No key, and
                          nothing leaves this machine.
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
                          Faster and larger, but your messages go to that company. Vela ships
                          without a key: an embedded one would sit in the app bundle for anyone to
                          read.
                        </span>
                      </span>
                    </label>
                  </div>

                  {settings.assistantProvider === 'local' ? (
                    <LocalModelPicker
                      selected={settings.assistantLocalModel}
                      onSelect={(id) => {
                        set({ assistantLocalModel: id });
                      }}
                    />
                  ) : settings.assistantProvider === 'ollama' ? (
                    <ModelPicker
                      selected={settings.assistantOllamaModel}
                      onSelect={(model) => {
                        set({ assistantOllamaModel: model });
                      }}
                    />
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
              ) : null}

              {category === 'network' ? (
                <Section title="Network">
                  <p className="px-1 text-[12px] leading-relaxed text-ink-muted">
                    Vela has no VPN of its own, because it runs no servers. A browser-branded “free
                    VPN” is a company reading your traffic instead of your ISP — a change of
                    audience, not an improvement. What Vela can do is send everything, private
                    windows included, through something you already trust. The free options below
                    are the ones that run on your own machine.
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
                    <span className="text-[13px] text-ink">Connection</span>
                    <select
                      value={presetForRules(settings.proxyRules).id}
                      onChange={(event) => {
                        const preset = PROXY_PRESETS.find(
                          (entry) => entry.id === event.target.value,
                        );
                        if (preset === undefined) return;
                        set({
                          proxyRules: preset.rules,
                          proxyEnabled: preset.id !== 'none',
                        });
                      }}
                      className="focus-ring rounded-lg border border-line bg-raised px-1 py-1 text-[13px] text-ink outline-none"
                    >
                      {PROXY_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name}
                        </option>
                      ))}
                    </select>
                    <span className="text-[11px] leading-relaxed text-ink-muted">
                      {presetForRules(settings.proxyRules).note}
                    </span>
                  </label>

                  <label className="flex flex-col gap-[3px] px-1 py-1">
                    <span className="text-[13px] text-ink">Address</span>
                    <input
                      value={settings.proxyRules}
                      onChange={(event) => {
                        set({ proxyRules: event.target.value });
                      }}
                      placeholder="socks5://127.0.0.1:1080"
                      spellCheck={false}
                      className="focus-ring rounded-lg border border-line bg-raised px-1 py-1 font-mono text-[12px] text-ink outline-none"
                    />
                  </label>
                </Section>
              ) : null}

              {category === 'data' ? (
                <Section title="Your data">
                  <p className="px-1 text-[12px] leading-relaxed text-ink-muted">
                    Vela collects nothing. There is no account, no server, and no analytics.
                    Everything it remembers is in one local JSON file, and the button below shows
                    you exactly what is in it.
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
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
