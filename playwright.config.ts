import { defineConfig } from '@playwright/test';

/**
 * Electron E2E. Runs against the built output in `out/`, so `npm run build`
 * must precede it (the `test:e2e` script does that).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  expect: { timeout: 10_000 },
});
