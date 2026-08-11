import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
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

applySystemTheme();

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Renderer root element is missing');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
