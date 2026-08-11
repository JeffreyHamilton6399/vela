import { mkdtempSync, readFile, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication } from '@playwright/test';

export const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

export function fixtureUrl(name: string): string {
  return `file:///${path.join(PROJECT_ROOT, 'tests', 'e2e', 'fixtures', name).replaceAll('\\', '/')}`;
}

export interface FixtureServer {
  origin: string;
  close: () => Promise<void>;
}

/**
 * Serves the fixtures over http://localhost.
 *
 * Some behaviour is deliberately scoped to real web origins — bookmarks and
 * history both refuse `file:` URLs — so exercising them needs a real origin.
 * localhost is exempt from the https upgrade, so nothing is rewritten.
 */
export async function startFixtureServer(): Promise<FixtureServer> {
  const root = path.join(PROJECT_ROOT, 'tests', 'e2e', 'fixtures');

  const server = createServer((request, response) => {
    const name = path.basename(new URL(request.url ?? '/', 'http://localhost').pathname);
    const file = path.join(root, name === '' ? 'page.html' : name);

    readFile(file, (error, body) => {
      if (error !== null) {
        response.writeHead(404).end('not found');
        return;
      }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;

  return {
    origin: `http://localhost:${String(port)}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}

export interface LaunchOptions {
  /**
   * Show the first-run screen. Off by default: it would otherwise cover the
   * content region in every spec, and only the onboarding spec wants it.
   */
  firstRun?: boolean;
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
export async function launchVela(options: LaunchOptions = {}): Promise<LaunchedApp> {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'vela-e2e-'));

  if (options.firstRun !== true) {
    // Seed the settings file the way a returning user's would look.
    writeFileSync(
      path.join(userDataDir, 'vela-settings.json'),
      JSON.stringify({ settings: { onboardingComplete: true } }),
      'utf8',
    );
  }

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
