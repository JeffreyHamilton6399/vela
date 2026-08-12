import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import { get } from 'node:https';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { findModel, type CatalogueEntry } from './catalogue.js';

/**
 * The models on this machine: what is here, what is arriving, and getting the
 * rest of it down without starting again.
 *
 * Vela ships without a model on purpose. A four-gigabyte GGUF inside the
 * installer would be a miserable download for everyone who never opens the
 * assistant, and it would land in every auto-update besides. So the first use
 * fetches one, and after that single download the assistant never needs the
 * network again — which is the whole point of running it here rather than
 * sending your questions to somebody's server.
 *
 * Downloads resume from whatever is already on disk and are checked against
 * the digest in the catalogue before being accepted. A truncated GGUF does not
 * announce itself: llama.cpp fails somewhere deep inside with something
 * baffling, rather than with "the download did not finish".
 */

export type ModelStatus =
  | { state: 'absent' }
  | { state: 'downloading'; receivedBytes: number; totalBytes: number }
  | { state: 'verifying' }
  | { state: 'ready' }
  | { state: 'failed'; error: string };

export interface ModelProgress {
  id: string;
  status: ModelStatus;
}

const PART_SUFFIX = '.part';
const REDIRECT_LIMIT = 5;

export class ModelStore {
  /** Downloads in flight, so two callers share one rather than racing. */
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly statuses = new Map<string, ModelStatus>();
  private readonly cancels = new Map<string, () => void>();

  constructor(
    private readonly directory: string,
    private readonly onProgress: (progress: ModelProgress) => void,
  ) {}

  fileFor(entry: CatalogueEntry): string {
    return path.join(this.directory, entry.file);
  }

  /** Where a finished model lives, or null if it is not down yet. */
  async pathIfReady(id: string): Promise<string | null> {
    const entry = findModel(id);
    if (entry === null) return null;

    const file = this.fileFor(entry);
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- the directory is app userData and the filename is a catalogue constant, never user input
      const info = await stat(file);
      // Size is the cheap check. The digest was verified when it landed, and
      // re-hashing gigabytes on every question would be absurd.
      return info.size === entry.bytes ? file : null;
    } catch {
      return null;
    }
  }

  async status(id: string): Promise<ModelStatus> {
    const live = this.statuses.get(id);
    if (live !== undefined && live.state !== 'ready' && live.state !== 'absent') return live;
    return (await this.pathIfReady(id)) === null ? { state: 'absent' } : { state: 'ready' };
  }

  private set(id: string, status: ModelStatus): void {
    this.statuses.set(id, status);
    this.onProgress({ id, status });
  }

  cancel(id: string): void {
    this.cancels.get(id)?.();
  }

  /**
   * Fetches a model, or joins the fetch already running for it. Resolves when
   * the file is on disk and has been checked.
   */
  async download(id: string): Promise<void> {
    const existing = this.inFlight.get(id);
    if (existing !== undefined) return existing;

    const run = this.run(id).finally(() => {
      this.inFlight.delete(id);
      this.cancels.delete(id);
    });
    this.inFlight.set(id, run);
    return run;
  }

  private async run(id: string): Promise<void> {
    const entry = findModel(id);
    if (entry === null) {
      this.set(id, { state: 'failed', error: 'No such model.' });
      return;
    }

    if ((await this.pathIfReady(id)) !== null) {
      this.set(id, { state: 'ready' });
      return;
    }

    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the directory is app userData and the filename is a catalogue constant, never user input
    await mkdir(this.directory, { recursive: true });
    const target = this.fileFor(entry);
    const part = `${target}${PART_SUFFIX}`;

    try {
      const already = await sizeOf(part);
      // A part file bigger than the finished article is not a resume point,
      // it is a wrong or corrupted file. Start again rather than reason about it.
      const from = already > entry.bytes ? 0 : already;
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- the directory is app userData and the filename is a catalogue constant, never user input
      if (from === 0 && already > 0) await unlink(part).catch(() => undefined);

      this.set(id, { state: 'downloading', receivedBytes: from, totalBytes: entry.bytes });
      await this.fetchInto(entry, part, from, id);

      this.set(id, { state: 'verifying' });
      const digest = await sha256Of(part);
      if (digest !== entry.sha256) {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- the directory is app userData and the filename is a catalogue constant, never user input
        await unlink(part).catch(() => undefined);
        throw new Error('the download did not match its checksum, so it was not used');
      }

      // eslint-disable-next-line security/detect-non-literal-fs-filename -- the directory is app userData and the filename is a catalogue constant, never user input
      await rename(part, target);
      this.set(id, { state: 'ready' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.set(id, { state: 'failed', error: message });
    }
  }

  /** Appends to `part` from byte `from`, following redirects. */
  private fetchInto(entry: CatalogueEntry, part: string, from: number, id: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let cancelled = false;

      const attempt = (url: string, redirectsLeft: number): void => {
        const headers: Record<string, string> = { 'user-agent': 'vela' };
        if (from > 0) headers['range'] = `bytes=${String(from)}-`;

        const request = get(url, { headers }, (response: IncomingMessage) => {
          const status = response.statusCode ?? 0;
          const location = response.headers.location;

          if (status >= 300 && status < 400 && location !== undefined) {
            response.resume();
            if (redirectsLeft === 0) {
              reject(new Error('too many redirects'));
              return;
            }
            attempt(new URL(location, url).toString(), redirectsLeft - 1);
            return;
          }

          // 206 is the resume; 200 means the server ignored the range and is
          // sending the lot, so what is already on disk has to go.
          const restarting = status === 200 && from > 0;
          if (status !== 200 && status !== 206) {
            response.resume();
            reject(new Error(`the server returned ${String(status)}`));
            return;
          }

          let received = restarting ? 0 : from;
          // eslint-disable-next-line security/detect-non-literal-fs-filename -- the directory is app userData and the filename is a catalogue constant, never user input
          const sink = createWriteStream(part, { flags: restarting || from === 0 ? 'w' : 'a' });

          response.on('data', (chunk: Buffer) => {
            received += chunk.length;
            this.set(id, {
              state: 'downloading',
              receivedBytes: received,
              totalBytes: entry.bytes,
            });
          });

          this.cancels.set(id, () => {
            cancelled = true;
            request.destroy();
            response.destroy();
          });

          pipeline(response, sink)
            .then(async () => {
              if (cancelled) {
                reject(new Error('cancelled'));
                return;
              }
              const finalSize = await sizeOf(part);
              if (finalSize !== entry.bytes) {
                reject(
                  new Error(
                    `the download ended early — ${String(finalSize)} of ${String(entry.bytes)} bytes`,
                  ),
                );
                return;
              }
              resolve();
            })
            .catch(reject);
        });

        request.on('error', reject);
        request.setTimeout(120_000, () => {
          request.destroy(new Error('the connection timed out'));
        });
      };

      attempt(entry.url, REDIRECT_LIMIT);
    });
  }
}

async function sizeOf(file: string): Promise<number> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the directory is app userData and the filename is a catalogue constant, never user input
    return (await stat(file)).size;
  } catch {
    return 0;
  }
}

async function sha256Of(file: string): Promise<string> {
  const hash = createHash('sha256');
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the directory is app userData and the filename is a catalogue constant, never user input
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}
