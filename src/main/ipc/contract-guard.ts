/**
 * The validation boundary. Nothing from the renderer reaches main-process logic
 * without being parsed by its zod schema first.
 */
import type { ZodType } from 'zod';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import {
  invokeContract,
  sendContract,
  type InvokeChannel,
  type InvokeRequest,
  type InvokeResponse,
  type SendChannel,
  type SendPayload,
} from '../../shared/types/ipc.js';

/** Structural subset of electron's `ipcMain`, so tests can supply a fake. */
export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
  ): void;
  on(channel: string, listener: (event: IpcMainEvent, ...args: unknown[]) => void): void;
}

/** Rejects traffic from any frame that is not Vela's own chrome. */
export type SenderPredicate = (event: { readonly sender: unknown }) => boolean;

export class IpcContractError extends Error {
  constructor(
    readonly channel: string,
    readonly detail: string,
  ) {
    super(`[ipc] ${channel}: ${detail}`);
    this.name = 'IpcContractError';
  }
}

export interface GuardOptions {
  ipcMain: IpcMainLike;
  isTrustedSender: SenderPredicate;
  onViolation?: (error: IpcContractError) => void;
}

function reject(options: GuardOptions, channel: string, detail: string): IpcContractError {
  const error = new IpcContractError(channel, detail);
  options.onViolation?.(error);
  return error;
}

/**
 * Registers a request/response channel. The request is validated on the way in
 * and the response on the way out, so a buggy handler is caught here too.
 */
export function handleInvoke<C extends InvokeChannel>(
  options: GuardOptions,
  channel: C,
  handler: (payload: InvokeRequest<C>) => Promise<InvokeResponse<C>> | InvokeResponse<C>,
): void {
  // `channel` is a literal from our own const map, never renderer input.
  // The lookup widens to a union of every channel's schemas, so it is narrowed
  // back to this channel's pair here.
  // eslint-disable-next-line security/detect-object-injection
  const contract = invokeContract[channel] as unknown as {
    request: ZodType<InvokeRequest<C>>;
    response: ZodType<InvokeResponse<C>>;
  };

  options.ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    if (!options.isTrustedSender(event)) {
      throw reject(options, channel, 'untrusted sender');
    }
    if (args.length > 1) {
      throw reject(
        options,
        channel,
        `expected at most 1 argument, received ${String(args.length)}`,
      );
    }

    const parsed = contract.request.safeParse(args[0]);
    if (!parsed.success) {
      throw reject(options, channel, `invalid request: ${parsed.error.issues[0]?.message ?? ''}`);
    }

    const result = await handler(parsed.data);

    const validated = contract.response.safeParse(result);
    if (!validated.success) {
      throw reject(
        options,
        channel,
        `invalid response: ${validated.error.issues[0]?.message ?? ''}`,
      );
    }
    return validated.data;
  });
}

/** Registers a fire-and-forget channel. Invalid payloads are dropped, not thrown. */
export function handleSend<C extends SendChannel>(
  options: GuardOptions,
  channel: C,
  handler: (payload: SendPayload<C>) => void,
): void {
  // Same narrowing as handleInvoke: the map lookup widens across channels.
  // eslint-disable-next-line security/detect-object-injection
  const schema = sendContract[channel] as unknown as ZodType<SendPayload<C>>;

  options.ipcMain.on(channel, (event, ...args: unknown[]) => {
    if (!options.isTrustedSender(event)) {
      reject(options, channel, 'untrusted sender');
      return;
    }
    if (args.length > 1) {
      reject(options, channel, `expected at most 1 argument, received ${String(args.length)}`);
      return;
    }

    const parsed = schema.safeParse(args[0]);
    if (!parsed.success) {
      reject(options, channel, `invalid payload: ${parsed.error.issues[0]?.message ?? ''}`);
      return;
    }

    handler(parsed.data);
  });
}
