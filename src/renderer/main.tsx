import { StrictMode, type JSX } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { DownloadsBubble } from './components/DownloadsPanel.js';
import { useThemePreference, useSettings } from './hooks/useSettings.js';
import './styles.css';

/**
 * Follows the OS theme. Stage 7's settings panel will flip this attribute
 * directly to override it.
 */
function applySystemTheme(): void {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = (dark: boolean): void => {
    document.documentElement.dataset['theme'] = dark ? 'dark' : 'light';
  };
  apply(query.matches);
  query.addEventListener('change', (event) => {
    apply(event.matches);
  });
}

/**
 * The downloads bubble is the same bundle in its own view, because the page
 * paints above the window's web contents and a bubble that appears by itself
 * must not blank the page to be seen. It follows the same theme setting the
 * rest of the chrome does.
 */
function Bubble(): JSX.Element {
  const settings = useSettings();
  useThemePreference(settings.theme);
  return <DownloadsBubble />;
}

applySystemTheme();

const isBubble = window.location.hash === '#downloads';
if (isBubble) document.documentElement.dataset['surface'] = 'transparent';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Renderer root element is missing');
}

createRoot(container).render(<StrictMode>{isBubble ? <Bubble /> : <App />}</StrictMode>);
