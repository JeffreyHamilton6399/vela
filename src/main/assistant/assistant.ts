import type { AssistantReply, AssistantMessage } from '../../shared/types/ipc.js';

/**
 * The sidebar assistant.
 *
 * The key belongs to the user and lives in their local settings file. Vela
 * ships without one, and could not usefully ship with one: this is a
 * downloadable desktop app, so any embedded key sits in `app.asar` for anyone
 * who cares to unzip it, and would be billed to whoever put it there.
 *
 * This is the one feature that adds a network destination beyond the two Vela
 * otherwise promises, which is why it is off until a key is entered and why
 * the settings panel says so in as many words.
 */
export const ASSISTANT_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export const DEFAULT_ASSISTANT_MODEL = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT =
  'You are the assistant built into Vela, a privacy-focused web browser. ' +
  'Answer briefly and concretely. You cannot see the user’s tabs, history or ' +
  'any page content unless they paste it to you.';

const TIMEOUT_MS = 60_000;
const MAX_HISTORY = 20;

export interface AssistantRequest {
  apiKey: string;
  model: string;
  messages: readonly AssistantMessage[];
}

/** Shape we accept back. Anything else is treated as a failure. */
interface ChatCompletion {
  choices?: { message?: { content?: unknown } }[];
  error?: { message?: unknown };
}

export async function askAssistant(request: AssistantRequest): Promise<AssistantReply> {
  if (request.apiKey.trim() === '') {
    return { ok: false, text: '', error: 'Add your own API key in Settings to use the assistant.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);

  try {
    const response = await fetch(ASSISTANT_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${request.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...request.messages.slice(-MAX_HISTORY),
        ],
      }),
    });

    const body = (await response.json()) as ChatCompletion;

    if (!response.ok) {
      const detail = typeof body.error?.message === 'string' ? body.error.message : '';
      return {
        ok: false,
        text: '',
        error:
          response.status === 401
            ? 'That key was rejected. Check it in Settings.'
            : `The assistant service returned ${String(response.status)}. ${detail}`.trim(),
      };
    }

    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      return { ok: false, text: '', error: 'The assistant returned an empty reply.' };
    }

    return { ok: true, text: content, error: null };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, text: '', error: 'The assistant took too long and was cancelled.' };
    }
    return {
      ok: false,
      text: '',
      error: error instanceof Error ? error.message : 'Could not reach the assistant.',
    };
  } finally {
    clearTimeout(timer);
  }
}
