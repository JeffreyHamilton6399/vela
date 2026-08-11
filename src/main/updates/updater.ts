import { app } from 'electron';
import electronUpdater from 'electron-updater';
import type { UpdateState } from '../../shared/types/ipc.js';

const { autoUpdater } = electronUpdater;

export interface UpdaterOptions {
  isEnabled: () => boolean;
  onStateChanged: (state: UpdateState) => void;
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
    void autoUpdater.checkForUpdates().catch((error: unknown) => {
      this.set({
        status: 'error',
        version: null,
        message: error instanceof Error ? error.message : 'Could not reach the release feed.',
      });
    });
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
