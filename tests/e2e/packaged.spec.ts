import { existsSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { PROJECT_ROOT } from './launch-app.js';

/**
 * Smoke test for the packaged app, not the source tree.
 *
 * The two differ in ways that have bitten this project already: `extraResources`
 * land beside the asar rather than inside it, so a path that works in
 * development can silently disable ad blocking in the shipped build.
 *
 * Skipped unless `npm run package` has produced an unpacked build.
 */
const UNPACKED = [
  path.join(PROJECT_ROOT, 'release', 'win-unpacked', 'Vela.exe'),
  path.join(PROJECT_ROOT, 'release', 'linux-unpacked', 'vela'),
  path.join(PROJECT_ROOT, 'release', 'mac', 'Vela.app', 'Contents', 'MacOS', 'Vela'),
  path.join(PROJECT_ROOT, 'release', 'mac-universal', 'Vela.app', 'Contents', 'MacOS', 'Vela'),
].find((candidate) => existsSync(candidate));

test.describe('packaged build', () => {
  test.skip(UNPACKED === undefined, 'run `npm run package` first');

  test('launches, finds its resources, and blocks with them', async () => {
    if (UNPACKED === undefined) return;

    const app = await electron.launch({
      executablePath: UNPACKED,
      args: [],
      env: { ...process.env, VELA_USER_DATA_DIR: mkdtempSync(path.join(tmpdir(), 'vela-pkg-')) },
    });

    try {
      const chrome = await app.firstWindow();
      await chrome.waitForSelector('[role="tablist"]');

      const report = await chrome.evaluate(() =>
        (
          globalThis as unknown as {
            vela: { privacy: { getReport: () => Promise<{ adblockEnabled: boolean }> } };
          }
        ).vela.privacy.getReport(),
      );

      // False here means the shipped app could not find adblock-engine.bin.
      expect(report.adblockEnabled, 'packaged build could not load its filter engine').toBe(true);
    } finally {
      await app.close();
    }
  });
});
