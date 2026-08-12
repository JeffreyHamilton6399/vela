/**
 * The models Vela offers to run on this machine.
 *
 * Every entry is a Q4_K_M GGUF, one quantisation across the whole list, so
 * "bigger is smarter and slower" is the only axis anyone has to reason about.
 *
 * `bytes` and `sha256` come from HuggingFace's paths-info API, where `lfs.oid`
 * is the file's real SHA-256. To add an entry, fetch them — do not type them
 * from a file listing. A wrong digest fails every download with a checksum
 * error, and a wrong size makes an already-finished download read as
 * permanently incomplete. Newer HuggingFace repositories sometimes report a
 * xetHash instead, which is a different content-addressing scheme and will
 * look like a plausible digest while failing every check.
 *
 * `needsBytes` is roughly the resident memory the model wants — weights plus
 * the KV cache and overhead — and decides whether Vela shows it as comfortable
 * here. It errs generous, because a model that swaps is worse than one that
 * was never offered.
 */

const GB = 1024 * 1024 * 1024;

const hf = (repo: string, file: string): string =>
  `https://huggingface.co/${repo}/resolve/main/${file}`;

export interface CatalogueEntry {
  id: string;
  label: string;
  blurb: string;
  parameters: string;
  file: string;
  url: string;
  bytes: number;
  sha256: string;
  needsBytes: number;
}

export const MODEL_CATALOGUE: readonly CatalogueEntry[] = [
  {
    id: 'llama-3.2-1b-instruct-q4_k_m',
    label: 'Llama 3.2 1B',
    blurb: 'The smallest here. Undemanding, and fine on an old laptop.',
    parameters: '1B',
    file: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    url: hf('bartowski/Llama-3.2-1B-Instruct-GGUF', 'Llama-3.2-1B-Instruct-Q4_K_M.gguf'),
    bytes: 807694464,
    sha256: '6f85a640a97cf2bf5b8e764087b1e83da0fdb51d7c9fab7d0fece9385611df83',
    needsBytes: 1.5 * GB,
  },
  {
    id: 'gemma-3-4b-it-q4_k_m',
    label: 'Gemma 3 4B',
    blurb: "Google's small model. Writes the most naturally of anything this size.",
    parameters: '4B',
    file: 'gemma-3-4b-it-Q4_K_M.gguf',
    url: hf('unsloth/gemma-3-4b-it-GGUF', 'gemma-3-4b-it-Q4_K_M.gguf'),
    bytes: 2489894016,
    sha256: '04a43a22e8d2003deda5acc262f68ec1005fa76c735a9962a8c77042a74a7d19',
    needsBytes: 3.5 * GB,
  },
  {
    id: 'qwen3-4b-instruct-2507-q4_k_m',
    label: 'Qwen 3 4B',
    blurb: 'The best all-round choice for most machines. Quick, current, and rarely wrong.',
    parameters: '4B',
    file: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
    url: hf('unsloth/Qwen3-4B-Instruct-2507-GGUF', 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf'),
    bytes: 2497281120,
    sha256: '3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597',
    needsBytes: 3.5 * GB,
  },
  {
    id: 'qwen2.5-coder-7b-instruct-q4_k_m',
    label: 'Qwen 2.5 Coder 7B',
    blurb: 'Tuned for code and shell commands. Weaker at ordinary conversation.',
    parameters: '7B',
    file: 'qwen2.5-coder-7b-instruct-q4_k_m.gguf',
    url: hf('Qwen/Qwen2.5-Coder-7B-Instruct-GGUF', 'qwen2.5-coder-7b-instruct-q4_k_m.gguf'),
    bytes: 4683073536,
    sha256: '509287f78cb4d4cf6b3843734733b914b2c158e43e22a7f4bf5e963800894d3c',
    needsBytes: 6 * GB,
  },
  {
    id: 'qwen3-8b-q4_k_m',
    label: 'Qwen 3 8B',
    blurb: 'A clear step up from the 4B if the memory is there. Thinks before it answers.',
    parameters: '8B',
    file: 'Qwen3-8B-Q4_K_M.gguf',
    url: hf('unsloth/Qwen3-8B-GGUF', 'Qwen3-8B-Q4_K_M.gguf'),
    bytes: 5027784512,
    sha256: '120307ba529eb2439d6c430d94104dabd578497bc7bfe7e322b5d9933b449bd4',
    needsBytes: 6.5 * GB,
  },
];

/** What a fresh install picks: the best all-rounder that most machines fit. */
export const DEFAULT_LOCAL_MODEL = 'qwen3-4b-instruct-2507-q4_k_m';

export function findModel(id: string): CatalogueEntry | null {
  return MODEL_CATALOGUE.find((entry) => entry.id === id) ?? null;
}
