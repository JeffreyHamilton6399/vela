import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication } from '@playwright/test';

export const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

export function fixtureUrl(name: string): string {
  return `file:///${path.join(PROJECT_ROOT, 'tests', 'e2e', 'fixtures', name).replaceAll('\\', '/')}`;
}

export interface LaunchedApp {
  app: ElectronApplication;
  userDataDir: string;
  close: () => Promise<void>;
}

/**
 * Launches Vela against a throwaway profile.
 *
 * Every spec gets its own userData directory, so a test that creates a
 * workspace or a Speed Dial tile cannot touch the profile of whoever is
 * running the suite — and cannot leak state into the next spec either.
 */
export async function launchVela(): Promise<LaunchedApp> {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'vela-e2e-'));

  const app = await electron.launch({
    args: [PROJECT_ROOT],
    env: { ...process.env, VELA_USER_DATA_DIR: userDataDir },
  });

  return {
    app,
    userDataDir,
    close: async () => {
      await app.close();
      try {
        rmSync(userDataDir, { recursive: true, force: true });
      } catch {
        // Windows sometimes still holds a handle; a temp dir is no great loss.
      }
    },
  };
}
