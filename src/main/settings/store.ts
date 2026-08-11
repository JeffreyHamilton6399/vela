import ElectronStore from 'electron-store';
import {
  DEFAULT_SETTINGS,
  settingsSchema,
  type Settings,
  type SettingsPatch,
} from '../../shared/settings.js';

type Listener = (settings: Settings) => void;

/**
 * Vela's only persistence: one local JSON file. Nothing here is ever
 * transmitted, and the file is validated on every read so a corrupt or
 * hand-edited config degrades to defaults instead of crashing the app.
 */
export class SettingsStore {
  private readonly store: ElectronStore<{ settings: unknown }>;
  private cache: Settings;
  private readonly listeners = new Set<Listener>();

  constructor(name = 'vela-settings') {
    this.store = new ElectronStore<{ settings: unknown }>({ name });
    this.cache = this.read();
  }

  get path(): string {
    return this.store.path;
  }

  get current(): Settings {
    return this.cache;
  }

  private read(): Settings {
    const parsed = settingsSchema.safeParse(this.store.get('settings'));
    return parsed.success ? parsed.data : { ...DEFAULT_SETTINGS };
  }

  /** Merges a partial update, persists it, and notifies listeners. */
  update(patch: SettingsPatch | Partial<Settings>): Settings {
    const next = settingsSchema.parse({ ...this.cache, ...patch });
    this.cache = next;
    this.store.set('settings', next);
    for (const listener of this.listeners) listener(next);
    return next;
  }

  /** Replaces everything — used by settings import. Unknown keys are dropped. */
  replace(raw: unknown): Settings {
    const next = settingsSchema.parse(raw);
    this.cache = next;
    this.store.set('settings', next);
    for (const listener of this.listeners) listener(next);
    return next;
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Pretty JSON for the export button in the settings panel. */
  export(): string {
    return JSON.stringify(this.cache, null, 2);
  }
}
