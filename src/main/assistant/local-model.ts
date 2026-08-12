import type { AssistantMessage } from '../../shared/types/ipc.js';

/**
 * Running a model inside Vela, with no server of any kind.
 *
 * This is the difference between "nothing leaves this machine" as a promise
 * about where a request is sent and as a statement about whether a request
 * exists at all. There is no localhost port here and no second program to
 * install: llama.cpp is linked into the process, and a question never becomes
 * a network request in the first place.
 *
 * `node-llama-cpp` is loaded lazily and kept. It pulls in a native binary and
 * takes the better part of a second to initialise, which is not a cost to pay
 * on a launch where nobody opens the assistant — and a model, once resident,
 * is hundreds of megabytes that should not be loaded twice.
 */

/** Kept loose: the module is imported dynamically and is native underneath. */
interface LlamaModule {
  getLlama: (options?: Record<string, unknown>) => Promise<LlamaHandle>;
  LlamaChatSession: new (options: {
    contextSequence: unknown;
    systemPrompt?: string;
  }) => ChatSession;
}

interface LlamaHandle {
  loadModel: (options: { modelPath: string }) => Promise<LoadedModel>;
}

interface LoadedModel {
  createContext: (options?: { contextSize?: number }) => Promise<LlamaContext>;
  dispose: () => Promise<void>;
}

interface LlamaContext {
  getSequence: () => ContextSequence;
  dispose: () => Promise<void>;
}

/**
 * A context hands out a fixed number of these — one, by default — and a
 * session holds one for as long as it lives. Taking one per question without
 * giving it back leaves the second question with "No sequences left".
 */
interface ContextSequence {
  dispose: () => void;
}

interface ChatSession {
  prompt: (text: string, options?: Record<string, unknown>) => Promise<string>;
}

const SYSTEM_PROMPT =
  'You are the assistant built into Vela, a privacy-focused web browser. ' +
  'Answer briefly and concretely. You cannot see the user’s tabs, history or ' +
  'any page content unless they paste it to you.';

/** Enough for a sidebar conversation without asking for the memory of a server. */
const CONTEXT_SIZE = 4096;
const MAX_HISTORY = 12;

let modulePromise: Promise<LlamaModule> | null = null;

async function loadModule(): Promise<LlamaModule> {
  modulePromise ??= import('node-llama-cpp') as unknown as Promise<LlamaModule>;
  return modulePromise;
}

/**
 * One model held open between questions.
 *
 * Loading is the expensive part — seconds, and the whole file into memory — so
 * a conversation reuses it and only a change of model pays it again.
 */
export class LocalModel {
  private loaded: { path: string; model: LoadedModel; context: LlamaContext } | null = null;
  private loading: Promise<void> | null = null;

  /** True once a model is resident and ready to answer without further waiting. */
  get residentPath(): string | null {
    return this.loaded?.path ?? null;
  }

  async ask(modelPath: string, messages: readonly AssistantMessage[]): Promise<string> {
    await this.ensure(modelPath);
    const current = this.loaded;
    if (current === null) throw new Error('the model did not load');

    const { LlamaChatSession } = await loadModule();

    // The session is fresh each time, so the history is replayed as one prompt
    // rather than kept as state that could drift from what the UI shows. That
    // means a new sequence each time too, and it has to be handed back — a
    // context owns a fixed number of them.
    const sequence = current.context.getSequence();
    try {
      const session = new LlamaChatSession({
        contextSequence: sequence,
        systemPrompt: SYSTEM_PROMPT,
      });

      const recent = messages.slice(-MAX_HISTORY);
      const transcript = recent
        .map((entry) => `${entry.role === 'user' ? 'User' : 'Assistant'}: ${entry.content}`)
        .join('\n\n');

      const reply = await session.prompt(
        recent.length <= 1 ? (recent[0]?.content ?? '') : `${transcript}\n\nAssistant:`,
      );
      return reply.trim();
    } finally {
      sequence.dispose();
    }
  }

  private async ensure(modelPath: string): Promise<void> {
    if (this.loaded?.path === modelPath) return;
    // A second question arriving mid-load waits for the same load.
    if (this.loading !== null) {
      await this.loading;
      if (this.loaded?.path === modelPath) return;
    }

    this.loading = this.load(modelPath).finally(() => {
      this.loading = null;
    });
    await this.loading;
  }

  private async load(modelPath: string): Promise<void> {
    await this.unload();

    const { getLlama } = await loadModule();
    // `build: 'never'` so a machine without a compiler is never asked to have
    // one: the prebuilt binary ships with the app or the assistant does not run.
    const llama = await getLlama({ build: 'never', progressLogs: false });
    const model = await llama.loadModel({ modelPath });
    const context = await model.createContext({ contextSize: CONTEXT_SIZE });
    this.loaded = { path: modelPath, model, context };
  }

  async unload(): Promise<void> {
    const current = this.loaded;
    this.loaded = null;
    if (current === null) return;
    await current.context.dispose().catch(() => undefined);
    await current.model.dispose().catch(() => undefined);
  }
}
