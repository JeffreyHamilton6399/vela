import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

const NODE_EXTERNALS = [
  'electron',
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
      formats: ['cjs'],
      fileName: () => 'index.cjs',
    },
    rollupOptions: {
      external: NODE_EXTERNALS,
    },
  },
  clearScreen: false,
});
