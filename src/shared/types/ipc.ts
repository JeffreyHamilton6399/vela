/**
 * The single source of truth for main <-> renderer traffic.
 *
 * Both sides import this file. Every channel is named here, every payload has a
 * zod schema here, and the main process validates against these schemas at its
 * boundary. If a channel is not in this file it does not exist.
 */
import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Payload schemas                                                     */
/* ------------------------------------------------------------------ */

export const platformSchema = z.enum(['darwin', 'win32', 'linux']);
export type Platform = z.infer<typeof platformSchema>;

export const windowStateSchema = z.object({
  maximized: z.boolean(),
  minimized: z.boolean(),
  fullScreen: z.boolean(),
  focused: z.boolean(),
});
export type WindowState = z.infer<typeof windowStateSchema>;

export const appInfoSchema = z.object({
  name: z.literal('Vela'),
  version: z.string().min(1),
  electronVersion: z.string().min(1),
  chromeVersion: z.string().min(1),
  platform: platformSchema,
  isDev: z.boolean(),
});
export type AppInfo = z.infer<typeof appInfoSchema>;

/** Payload-less channels use this so the contract stays uniform. */
export const emptySchema = z.undefined();

/* ------------------------------------------------------------------ */
/* Channels                                                            */
/* ------------------------------------------------------------------ */

/** Renderer -> main, request/response. */
export const INVOKE_CHANNELS = {
  appGetInfo: 'app:get-info',
  windowGetState: 'window:get-state',
} as const;

/** Renderer -> main, fire and forget. */
export const SEND_CHANNELS = {
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
} as const;

/** Main -> renderer, push. */
export const EVENT_CHANNELS = {
  windowStateChanged: 'window:state-changed',
} as const;

export type InvokeChannel = (typeof INVOKE_CHANNELS)[keyof typeof INVOKE_CHANNELS];
export type SendChannel = (typeof SEND_CHANNELS)[keyof typeof SEND_CHANNELS];
export type EventChannel = (typeof EVENT_CHANNELS)[keyof typeof EVENT_CHANNELS];

/* ------------------------------------------------------------------ */
/* Channel -> schema maps                                              */
/* ------------------------------------------------------------------ */

export const invokeContract = {
  [INVOKE_CHANNELS.appGetInfo]: { request: emptySchema, response: appInfoSchema },
  [INVOKE_CHANNELS.windowGetState]: { request: emptySchema, response: windowStateSchema },
} as const satisfies Record<InvokeChannel, { request: z.ZodType; response: z.ZodType }>;

export const sendContract = {
  [SEND_CHANNELS.windowMinimize]: emptySchema,
  [SEND_CHANNELS.windowToggleMaximize]: emptySchema,
  [SEND_CHANNELS.windowClose]: emptySchema,
} as const satisfies Record<SendChannel, z.ZodType>;

export const eventContract = {
  [EVENT_CHANNELS.windowStateChanged]: windowStateSchema,
} as const satisfies Record<EventChannel, z.ZodType>;

export type InvokeRequest<C extends InvokeChannel> = z.infer<(typeof invokeContract)[C]['request']>;
export type InvokeResponse<C extends InvokeChannel> = z.infer<
  (typeof invokeContract)[C]['response']
>;
export type SendPayload<C extends SendChannel> = z.infer<(typeof sendContract)[C]>;
export type EventPayload<C extends EventChannel> = z.infer<(typeof eventContract)[C]>;

/** Every channel string Vela will ever put on the wire. */
export const ALL_CHANNELS: readonly string[] = [
  ...Object.values(INVOKE_CHANNELS),
  ...Object.values(SEND_CHANNELS),
  ...Object.values(EVENT_CHANNELS),
];

/* ------------------------------------------------------------------ */
/* The bridge surface exposed on window.vela                           */
/* ------------------------------------------------------------------ */

export interface VelaBridge {
  /**
   * Available synchronously so the titlebar can draw the correct window
   * controls on first paint instead of after an IPC round trip.
   */
  readonly platform: Platform;
  readonly app: {
    getInfo(): Promise<AppInfo>;
  };
  readonly window: {
    getState(): Promise<WindowState>;
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    /** Returns an unsubscribe function. */
    onStateChanged(listener: (state: WindowState) => void): () => void;
  };
}
