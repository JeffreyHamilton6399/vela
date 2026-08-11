import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '../../shared/settings.js';

/** Mirrors the persisted settings, kept fresh by push events from main. */
export function useSettings(): Settings {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let active = true;

    void window.vela.settings.get().then((next) => {
      if (active) setSettings(next);
    });

    const unsubscribe = window.vela.settings.onChanged(setSettings);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return settings;
}

/** Applies the theme preference to the document. */
export function useThemePreference(preference: Settings['theme']): void {
  useEffect(() => {
    const root = document.documentElement;

    if (preference !== 'system') {
      root.dataset['theme'] = preference;
      return;
    }

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (): void => {
      root.dataset['theme'] = query.matches ? 'dark' : 'light';
    };
    apply();
    query.addEventListener('change', apply);
    return () => {
      query.removeEventListener('change', apply);
    };
  }, [preference]);
}
