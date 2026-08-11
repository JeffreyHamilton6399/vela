import { platformSchema, type Platform } from './types/ipc.js';

/**
 * Narrows a raw `process.platform` to the three targets Vela ships for.
 * Anything exotic (freebsd, sunos, ...) behaves like Linux, which is the
 * closest match for window decoration and window-control layout.
 *
 * Used by main and by the preload bridge; never by the renderer, which has no
 * `process` of its own.
 */
export function resolvePlatform(raw: string): Platform {
  const parsed = platformSchema.safeParse(raw);
  return parsed.success ? parsed.data : 'linux';
}
