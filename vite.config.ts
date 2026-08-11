import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The chrome renderer is local UI only, so its CSP can be near-total lockdown.
 * Development loosens exactly enough for Vite's HMR socket and nothing more.
 */
const PRODUCTION_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
].join('; ');

const DEVELOPMENT_CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' ws://localhost:* http://localhost:*",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

function cspPlugin(isDev: boolean): Plugin {
  return {
    name: 'vela-csp',
    transformIndexHtml(html) {
      const policy = isDev ? DEVELOPMENT_CSP : PRODUCTION_CSP;
      return html.replace(
        '<!--vela-csp-->',
        `<meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      );
    },
  };
}

export default defineConfig(({ command }) => ({
  root: 'src/renderer',
  // Loaded over file:// in production.
  base: './',
  plugins: [react(), tailwindcss(), cspPlugin(command === 'serve')],
  build: {
    outDir: '../../out/renderer',
    emptyOutDir: true,
    target: 'chrome130',
    sourcemap: true,
  },
  server: {
    port: 5273,
    strictPort: true,
  },
  clearScreen: false,
}));
