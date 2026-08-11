/**
 * Builds all three bundles: main, preload, renderer.
 * Plain Vite for every target — no extra build tooling in the dependency tree.
 */
import { build } from 'vite';

const TARGETS = [
  ['main', 'vite.main.config.ts'],
  ['preload', 'vite.preload.config.ts'],
  ['renderer', 'vite.config.ts'],
];

for (const [name, configFile] of TARGETS) {
  process.stdout.write(`\n▸ building ${name}\n`);
  await build({ configFile, mode: 'production' });
}

process.stdout.write('\n✓ build complete → out/\n');
