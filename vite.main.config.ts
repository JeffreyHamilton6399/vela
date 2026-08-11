import { builtinModules, createRequire } from 'node:module';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);
const { dependencies } = require('./package.json') as { dependencies: Record<string, string> };

/**
 * Runtime dependencies stay external and are loaded from `node_modules`.
 *
 * Bundling them is not just wasteful here: several ship ESM that computes
 * paths from `import.meta.url`, which a bundler cannot preserve. electron-
 * builder packages `dependencies`, so they are present beside the app.
 */
const NODE_EXTERNALS = [
  'electron',
  ...Object.keys(dependencies),
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
];

export default defineConfig({
  build: {
    outDir: 'out/main',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    sourcemap: true,
    lib: {
      entry: 'src/main/index.ts',
      // ESM, so `import.meta.url` in dependencies keeps working and Electron
      // loads the same module graph Node would.
      formats: ['es'],
      fileName: () => 'index.mjs',
    },
    rollupOptions: {
      external: (id) =>
        NODE_EXTERNALS.includes(id) || NODE_EXTERNALS.some((name) => id.startsWith(`${name}/`)),
    },
  },
  clearScreen: false,
});
