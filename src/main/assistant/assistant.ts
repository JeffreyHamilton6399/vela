import type { AssistantMessage, AssistantReply, AssistantStatus } from '../../shared/types/ipc.js';

/**
 * The sidebar assistant.
 *
 * Two providers, and the default is the private one:
 *
 * - **Ollama**, running on this machine. No key, no account, and no request
 *   that leaves the computer — `localhost` is not the internet. This is what
 *   Vela uses unless you tell it otherwise.
 * - **A hosted service**, using a key the user pastes into Settings. Vela ships
 *   without a key and could not usefully ship with one: it is a downloadable
 *   app, so an embedded key sits in `app.asar` for anyone who unzips it.
 */
export const OLLAMA_ORIGIN = 'http://127.0.0.1:11434';
export const HOSTED_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export const DEFAULT_OLLAMA_MODEL = 'llama3.2';

/**
 * Models worth offering to someone who has just installed Ollama. Sizes are
 * the download, which is the number that actually decides whether a person
 * wants it.
 */
export const SUGGESTED_MODELS: readonly { name: string; size: string; note: string }[] = [
  { name: 'llama3.2', size: '2.0 GB', note: 'Good default. Fast on most machines.' },
  { name: 'llama3.2:1b', size: '1.3 GB', note: 'Smallest. Works on modest hardware.' },
  { name: 'qwen2.5:7b', size: '4.7 GB', note: 'Stronger reasoning, slower.' },
  { name: 'gemma2:2b', size: '1.6 GB', note: 'Small and quick.' },
  { name: 'phi3.5', size: '2.2 GB', note: 'Compact, good at code.' },
];
export const DEFAULT_HOSTED_MODEL = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT =
  'You are the assistant built into Vela, a privacy-focused web browser. ' +
  'Answer briefly and concretely. You cannot see the user’s tabs, history or ' +
  'any page content unless they paste it to you.';

const TIMEOUT_MS = 120_000;
const PROBE_TIMEOUT_MS = 2_000;
const MAX_HISTORY = 20;

export interface AssistantConfig {
  provider: 'ollama' | 'hosted';
  ollamaModel: string;
  hostedModel: string;
  apiKey: string;
}

interface ChatCompletion {
  choices?: { message?: { content?: unknown } }[];
  error?: { message?: unknown };
}

interface OllamaTags {
  models?: { name?: unknown }[];
}

/** Whether the local model server is up, and which models it has. */
export async function probeOllama(): Promise<{ running: boolean; models: string[] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(`${OLLAMA_ORIGIN}/api/tags`, { signal: controller.signal });
    if (!response.ok) return { running: false, models: [] };

    const body = (await response.json()) as OllamaTags;
    const models = (body.models ?? [])
      .map((entry) => entry.name)
      .filter((name): name is string => typeof name === 'string');

    return { running: true, models };
  } catch {
    return { running: false, models: [] };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Downloads a model through Ollama. Returns when the pull finishes, which for
 * a multi-gigabyte model is a while — the caller shows it as pending.
 */
export async function pullOllamaModel(
  name: string,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const response = await fetch(`${OLLAMA_ORIGIN}/api/pull`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: name, stream: false }),
    });

    if (!response.ok) {
      return { ok: false, error: `Ollama returned ${String(response.status)} pulling ${name}.` };
    }

    await response.json();
    return { ok: true, error: null };
  } catch {
    return { ok: false, error: 'Could not reach Ollama on this machine.' };
  }
}

export async function assistantStatus(config: AssistantConfig): Promise<AssistantStatus> {
  if (config.provider === 'hosted') {
    return {
      provider: 'hosted',
      ready: config.apiKey.trim() !== '',
      detail:
        config.apiKey.trim() === ''
          ? 'Add your API key in Settings, or switch to the local model.'
          : `Using ${config.hostedModel}. Your key, your account.`,
      models: [],
    };
  }

  const { running, models } = await probeOllama();
  return {
    provider: 'ollama',
    ready: running,
    detail: running
      ? `Running locally. Nothing leaves this machine.`
      : 'Ollama is not running. Install it from ollama.com, then run a model.',
    models,
  };
}

export async function askAssistant(
  config: AssistantConfig,
  messages: readonly AssistantMessage[],
): Promise<AssistantReply> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);

  const payload = {
    model: config.provider === 'ollama' ? config.ollamaModel : config.hostedModel,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages.slice(-MAX_HISTORY)],
    stream: false,
  };

  try {
    if (config.provider === 'hosted' && config.apiKey.trim() === '') {
      return {
        ok: false,
        text: '',
        error: 'Add your API key in Settings, or switch back to the local model.',
      };
    }

    const response = await fetch(
      config.provider === 'ollama' ? `${OLLAMA_ORIGIN}/v1/chat/completions` : HOSTED_ENDPOINT,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          // Ollama ignores the header; sending nothing secret to localhost.
          ...(config.provider === 'hosted' ? { authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify(payload),
      },
    );

    const body = (await response.json()) as ChatCompletion;

    if (!response.ok) {
      const detail = typeof body.error?.message === 'string' ? body.error.message : '';
      if (config.provider === 'ollama') {
        return {
          ok: false,
          text: '',
          error: `Ollama returned ${String(response.status)}. ${
            detail ||
            `Is the model "${config.ollamaModel}" pulled? Try: ollama pull ${config.ollamaModel}`
          }`,
        };
      }
      return {
        ok: false,
        text: '',
        error:
          response.status === 401
            ? 'That key was rejected. Check it in Settings.'
            : `The service returned ${String(response.status)}. ${detail}`.trim(),
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
    if (config.provider === 'ollama') {
      return {
        ok: false,
        text: '',
        error: 'Could not reach Ollama on this machine. Install it from ollama.com and start it.',
      };
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
