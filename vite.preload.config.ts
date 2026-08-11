import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

/**
 * Sandboxed preloads must be CommonJS and cannot resolve bare specifiers at
 * runtime, so everything except `electron` is bundled into a single file.
 */
export default defineConfig({
  build: {
    outDir: 'out/preload',
    emptyOutDir: true,
    target: 'chrome130',
    minify: false,
    sourcemap: true,
    lib: {
      entry: 'src/preload/index.ts',
      formats: ['cjs'],
      fileName: () => 'index.cjs',
    },
    rollupOptions: {
      external: ['electron', ...builtinModules, ...builtinModules.map((name) => `node:${name}`)],
    },
  },
  clearScreen: false,
});
