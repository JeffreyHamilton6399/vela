import { app } from 'electron';
import electronUpdater from 'electron-updater';
import type { UpdateState } from '../../shared/types/ipc.js';

const { autoUpdater } = electronUpdater;

export interface UpdaterOptions {
  isEnabled: () => boolean;
  onStateChanged: (state: UpdateState) => void;
}

/**
 * How many times a check will try, and how long it waits between.
 *
 * The release feed is a single GET to GitHub, and GitHub answers an
 * unauthenticated caller with a rate limit often enough that a one-shot check
 * reports "could not reach the release feed" for a service that is perfectly
 * healthy. Telling someone their browser cannot check for updates, when the
 * truth is that it should have waited two seconds, is the kind of small lie
 * that makes a user stop believing the rest of the interface.
 *
 * Deliberately short. This runs while someone is looking at a settings panel,
 * so it is worth a couple of seconds and is not worth a minute.
 */
const CHECK_ATTEMPTS = 3;
const CHECK_BACKOFF_MS = 2000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * The only request Vela makes on its own behalf.
 *
 * It is a plain GET for the release feed: `autoDownload` is off, so nothing is
 * fetched until the user asks; the request carries no query parameters, no
 * install identifier and no fingerprint; and the user agent is set to the
 * version string and nothing else.
 */
export class Updater {
  private state: UpdateState = { status: 'idle', version: null, message: null };

  constructor(private readonly options: UpdaterOptions) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.requestHeaders = { 'User-Agent': `Vela/${app.getVersion()}` };
    // The update check must never write a log file next to the user's data.
    autoUpdater.logger = null;

    autoUpdater.on('update-available', (info: { version: string }) => {
      this.set({ status: 'available', version: info.version, message: null });
    });

    autoUpdater.on('update-not-available', () => {
      this.set({ status: 'current', version: app.getVersion(), message: null });
    });

    autoUpdater.on('download-progress', (progress: { percent: number }) => {
      this.set({
        status: 'downloading',
        version: this.state.version,
        message: `${String(Math.round(progress.percent))}%`,
      });
    });

    autoUpdater.on('update-downloaded', (info: { version: string }) => {
      this.set({ status: 'ready', version: info.version, message: null });
    });

    autoUpdater.on('error', (error: Error) => {
      this.set({ status: 'error', version: null, message: error.message });
    });
  }

  get current(): UpdateState {
    return this.state;
  }

  private set(next: UpdateState): void {
    this.state = next;
    this.options.onStateChanged(next);
  }

  /** No-ops in development, where there is no release feed to ask. */
  check(): void {
    if (!app.isPackaged) {
      this.set({
        status: 'idle',
        version: app.getVersion(),
        message: 'Update checks are disabled in development.',
      });
      return;
    }

    if (!this.options.isEnabled()) {
      this.set({ status: 'idle', version: app.getVersion(), message: 'Update checks are off.' });
      return;
    }

    this.set({ status: 'checking', version: null, message: null });
    void this.checkWithRetries();
  }

  /**
   * Asks the feed, giving a flaky answer a second chance before believing it.
   *
   * The result arrives on the `update-available` / `update-not-available`
   * events rather than from the promise, so this only has to decide when to
   * stop asking and what to say if it never worked.
   */
  private async checkWithRetries(): Promise<void> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await autoUpdater.checkForUpdates();
        return;
      } catch (error) {
        // The user turned checks off, or closed the window, while this waited.
        if (!this.options.isEnabled()) return;

        if (attempt >= CHECK_ATTEMPTS) {
          this.set({
            status: 'error',
            version: null,
            message: error instanceof Error ? error.message : 'Could not reach the release feed.',
          });
          return;
        }
        await delay(CHECK_BACKOFF_MS * attempt);
      }
    }
  }

  /** Downloads only once the user has asked for it. */
  download(): void {
    if (!app.isPackaged || this.state.status !== 'available') return;
    this.set({ status: 'downloading', version: this.state.version, message: '0%' });
    void autoUpdater.downloadUpdate().catch((error: unknown) => {
      this.set({
        status: 'error',
        version: null,
        message: error instanceof Error ? error.message : 'Download failed.',
      });
    });
  }

  install(): void {
    if (this.state.status !== 'ready') return;
    autoUpdater.quitAndInstall();
  }
}
