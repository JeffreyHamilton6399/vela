import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ipcMain, type Session } from 'electron';
import { ElectronBlocker } from '@ghostery/adblocker-electron';

/** Registered globally by the adblocker, not per session. */
const COSMETIC_CHANNELS = [
  '@ghostery/adblocker/inject-cosmetic-filters',
  '@ghostery/adblocker/is-mutation-observer-enabled',
] as const;

export interface BlockerHandle {
  /** Turns blocking on for a session (each private window gets its own). */
  enableFor: (session: Session) => void;
  disableFor: (session: Session) => void;
  /** Called with the webContents id whose request was blocked. */
  onBlocked: (listener: (webContentsId: number) => void) => () => void;
}

/**
 * Loads the blocking engine that was compiled into the app at build time.
 *
 * Deliberately never fetches a filter list at runtime: that would be a third
 * category of network request, and Vela promises exactly two. Lists are
 * refreshed by shipping a new build.
 */
export async function loadBlocker(resourcesDir: string): Promise<BlockerHandle | null> {
  let blocker: ElectronBlocker;

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- resourcesDir is the app's own install path, never user input
    const serialized = await readFile(path.join(resourcesDir, 'adblock-engine.bin'));
    blocker = ElectronBlocker.deserialize(new Uint8Array(serialized));
  } catch {
    // Missing engine means blocking is off, not that the browser fails to
    // start. `npm run filters:update` builds it.
    return null;
  }

  const listeners = new Set<(webContentsId: number) => void>();

  blocker.on('request-blocked', (request: { tabId: number }) => {
    for (const listener of listeners) listener(request.tabId);
  });

  return {
    enableFor: (session) => {
      // Blocking is per session, but the adblocker's cosmetic-filter IPC
      // handlers are registered on the global `ipcMain` and throw if they
      // already exist. They close over the blocker rather than the session, so
      // clearing them first lets a second session (a private window) enable
      // blocking without breaking the first.
      for (const channel of COSMETIC_CHANNELS) ipcMain.removeHandler(channel);
      blocker.enableBlockingInSession(session);
    },
    disableFor: (session) => {
      blocker.disableBlockingInSession(session);
    },
    onBlocked: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
