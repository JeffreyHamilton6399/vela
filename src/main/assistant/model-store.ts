import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, stat, statfs, unlink } from 'node:fs/promises';
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
  | {
      state: 'downloading';
      receivedBytes: number;
      totalBytes: number;
      /** Recent throughput, smoothed. Zero until there is enough to say. */
      bytesPerSecond: number;
    }
  | { state: 'verifying' }
  | { state: 'ready' }
  | { state: 'failed'; error: string };

export interface ModelProgress {
  id: string;
  status: ModelStatus;
}

const PART_SUFFIX = '.part';
const REDIRECT_LIMIT = 5;

/**
 * How often a download may report itself, in milliseconds.
 *
 * Without this the report went out on every chunk. A four-gigabyte model
 * arriving in 64 KiB pieces is sixty-five thousand of them, each one a
 * structured clone across the IPC boundary and a React render at the other
 * end — enough to make the settings panel stutter while the thing it is
 * describing does nothing but wait for the network. Ten a second is more than
 * a progress bar can show and a fraction of a percent of the traffic.
 */
const PROGRESS_INTERVAL_MS = 100;

/**
 * How many times a download will pick itself back up, and how long it waits.
 *
 * A four-gigabyte transfer over a domestic connection is minutes long, and a
 * connection that drops once in that window is ordinary rather than
 * exceptional. Everything needed to carry on is already here — the part file
 * on disk and a ranged request to resume it — so the only thing that made a
 * dropped connection fatal was that nothing tried again.
 *
 * The wait doubles from a second, and the digest check at the end is what
 * makes retrying safe: a resume that stitched the wrong bytes together fails
 * there rather than becoming a model that loads and talks nonsense.
 */
const MAX_ATTEMPTS = 5;
const FIRST_BACKOFF_MS = 1000;

export class ModelStore {
  /** Downloads in flight, so two callers share one rather than racing. */
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly statuses = new Map<string, ModelStatus>();
  private readonly cancels = new Map<string, () => void>();
  /**
   * Downloads the user has called off.
   *
   * Separate from the callbacks above because a cancel has to survive the gap
   * between two attempts, when there is no request in flight to destroy and
   * nothing for a callback to do. Without it, cancelling during a backoff was
   * quietly ignored and the download resumed a second later.
   */
  private readonly cancelled = new Set<string>();

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
    this.cancelled.add(id);
    this.cancels.get(id)?.();
  }

  /**
   * Refuses a download that cannot fit before it starts.
   *
   * A model runs out of disk somewhere in its fourth gigabyte, twenty minutes
   * in, and the failure that surfaces is a write error rather than a reason.
   * Asking first costs nothing and turns that into a sentence the user can act
   * on. A filesystem that will not answer is not treated as an objection.
   */
  private async assertRoomFor(bytes: number): Promise<void> {
    let free: number;
    try {
      const info = await statfs(this.directory);
      free = info.bavail * info.bsize;
    } catch {
      return;
    }

    // A little headroom, so this does not fill the disk to the last byte.
    const needed = bytes + 256 * 1024 * 1024;
    if (free >= needed) return;
    throw new Error(
      `there is not enough room — this needs ${gigabytes(needed)} free and ${gigabytes(free)} is available`,
    );
  }

  /**
   * Fetches a model, or joins the fetch already running for it. Resolves when
   * the file is on disk and has been checked.
   */
  async download(id: string): Promise<void> {
    const existing = this.inFlight.get(id);
    if (existing !== undefined) return existing;

    // A fresh request clears a cancel left over from a previous one, or the
    // new download would abandon itself before it began.
    this.cancelled.delete(id);
    const run = this.run(id).finally(() => {
      this.inFlight.delete(id);
      this.cancels.delete(id);
      this.cancelled.delete(id);
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
      const startFrom = already > entry.bytes ? 0 : already;
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- the directory is app userData and the filename is a catalogue constant, never user input
      if (startFrom === 0 && already > 0) await unlink(part).catch(() => undefined);

      await this.assertRoomFor(entry.bytes - startFrom);

      this.set(id, {
        state: 'downloading',
        receivedBytes: startFrom,
        totalBytes: entry.bytes,
        bytesPerSecond: 0,
      });

      // Each attempt resumes from whatever is on disk, so a connection that
      // drops halfway costs the wait below rather than the whole download.
      for (let attempt = 1; ; attempt += 1) {
        try {
          await this.fetchInto(entry, part, await sizeOf(part), id);
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          // A cancel is the user's decision, not a transient failure.
          if (message === 'cancelled' || attempt >= MAX_ATTEMPTS) throw error;
          await delay(FIRST_BACKOFF_MS * 2 ** (attempt - 1));
          // Cancelling during the wait has no request to interrupt, so it is
          // noticed here instead. The failure that got us here is kept as the
          // cause: "cancelled" is what happened, not why it stopped retrying.
          if (this.cancelled.has(id)) throw new Error('cancelled', { cause: error });
        }
      }

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

          // Throughput, smoothed. A raw byte count between two ticks swings
          // wildly enough that an ETA built on it is unreadable; this weights
          // the newest reading a third and the history the rest, which settles
          // within a couple of seconds and still reacts to a real slowdown.
          let speed = 0;
          let lastAt = Date.now();
          let lastBytes = received;
          let reportedAt = 0;

          response.on('data', (chunk: Buffer) => {
            received += chunk.length;

            const now = Date.now();
            if (now - reportedAt < PROGRESS_INTERVAL_MS) return;
            reportedAt = now;

            const seconds = (now - lastAt) / 1000;
            if (seconds > 0) {
              const sample = (received - lastBytes) / seconds;
              speed = speed === 0 ? sample : speed * 0.7 + sample * 0.3;
              lastAt = now;
              lastBytes = received;
            }

            this.set(id, {
              state: 'downloading',
              receivedBytes: received,
              totalBytes: entry.bytes,
              bytesPerSecond: Math.max(0, Math.round(speed)),
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** A byte count as the sentence about disk space wants to say it. */
function gigabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
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
