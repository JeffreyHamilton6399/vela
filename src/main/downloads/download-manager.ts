import { randomUUID } from 'node:crypto';
import { shell, type DownloadItem as ElectronDownloadItem, type Session } from 'electron';
import type { DownloadItem } from '../../shared/types/ipc.js';

const MAX_REMEMBERED = 50;

/**
 * Tracks downloads for one window's session.
 *
 * The list lives in memory only: a record of what you downloaded is exactly
 * the sort of thing a private browser should not leave lying around. The files
 * themselves go wherever the save dialog put them.
 */
export class DownloadManager {
  private items: DownloadItem[] = [];
  private readonly handles = new Map<string, ElectronDownloadItem>();

  constructor(
    session: Session,
    private readonly onChanged: (items: DownloadItem[]) => void,
  ) {
    session.on('will-download', (_event, item) => {
      this.track(item);
    });
  }

  get list(): DownloadItem[] {
    return this.items;
  }

  private track(item: ElectronDownloadItem): void {
    const id = randomUUID();
    this.handles.set(id, item);

    const snapshot = (): DownloadItem => ({
      id,
      filename: item.getFilename(),
      url: item.getURL(),
      state: readState(item),
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
      savePath: item.getSavePath(),
      startedAt: item.getStartTime() * 1000,
    });

    this.items = [snapshot(), ...this.items].slice(0, MAX_REMEMBERED);
    this.emit();

    item.on('updated', () => {
      this.replace(id, snapshot());
    });

    item.once('done', () => {
      this.replace(id, snapshot());
    });
  }

  private replace(id: string, next: DownloadItem): void {
    this.items = this.items.map((item) => (item.id === id ? next : item));
    this.emit();
  }

  private emit(): void {
    this.onChanged(this.items);
  }

  /** Opens a finished download with whatever the OS considers its handler. */
  open(id: string): void {
    const item = this.items.find((candidate) => candidate.id === id);
    if (item?.state !== 'completed') return;
    void shell.openPath(item.savePath);
  }

  showInFolder(id: string): void {
    const item = this.items.find((candidate) => candidate.id === id);
    if (item === undefined || item.savePath === '') return;
    shell.showItemInFolder(item.savePath);
  }

  cancel(id: string): void {
    this.handles.get(id)?.cancel();
  }

  /** Clears the list. Files already on disk are left alone. */
  clear(): void {
    this.items = this.items.filter((item) => item.state === 'progressing');
    this.emit();
  }

  dispose(): void {
    this.handles.clear();
    this.items = [];
  }
}

function readState(item: ElectronDownloadItem): DownloadItem['state'] {
  const state = item.getState();
  if (state === 'progressing') return item.isPaused() ? 'paused' : 'progressing';
  if (state === 'completed') return 'completed';
  if (state === 'cancelled') return 'cancelled';
  return 'interrupted';
}
