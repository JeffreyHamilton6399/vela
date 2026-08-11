/**
 * Lists Vela offers rather than invents.
 *
 * Kept in `shared` so the settings panel and the main process agree on the same
 * names, and so a reader can see in one file exactly which third parties this
 * browser will ever suggest.
 */

/** Local models worth offering someone who has just installed Ollama. */
export const SUGGESTED_MODELS: readonly { name: string; size: string; note: string }[] = [
  { name: 'llama3.2', size: '2.0 GB', note: 'Good default. Fast on most machines.' },
  { name: 'llama3.2:1b', size: '1.3 GB', note: 'Smallest. Works on modest hardware.' },
  { name: 'qwen2.5:7b', size: '4.7 GB', note: 'Stronger reasoning, slower.' },
  { name: 'gemma2:2b', size: '1.6 GB', note: 'Small and quick.' },
  { name: 'phi3.5', size: '2.2 GB', note: 'Compact, good at code.' },
];

export interface ProxyPreset {
  readonly id: string;
  readonly name: string;
  readonly rules: string;
  readonly note: string;
}

/**
 * Ways to route Vela's traffic.
 *
 * None of these is "Vela's VPN": Vela runs no servers, so it has none to give.
 * What it can do is send everything through something you already trust — and
 * the honest observation is that the free options below are the local ones. A
 * free VPN run by someone else is a company reading your traffic instead of
 * your ISP, which is a change of audience rather than an improvement.
 */
export const PROXY_PRESETS: readonly ProxyPreset[] = [
  {
    id: 'none',
    name: 'Direct connection',
    rules: '',
    note: 'No proxy. Your ISP can see which sites you visit.',
  },
  {
    id: 'tor',
    name: 'Tor — free, if you run the daemon',
    rules: 'socks5://127.0.0.1:9050',
    note: 'Genuinely anonymising and costs nothing. Noticeably slower.',
  },
  {
    id: 'tor-browser',
    name: 'Tor Browser’s proxy',
    rules: 'socks5://127.0.0.1:9150',
    note: 'The same network, on the port Tor Browser opens while it is running.',
  },
  {
    id: 'ssh',
    name: 'SSH tunnel to your own server',
    rules: 'socks5://127.0.0.1:1080',
    note: 'From `ssh -D 1080 you@your-server`. Hides traffic from the local network.',
  },
  {
    id: 'custom',
    name: 'Custom — a VPN or proxy you pay for',
    rules: '',
    note: 'Any provider exposing a SOCKS or HTTP endpoint. Mullvad, Proton and others do.',
  },
];

/** The preset matching a rules string, or the custom entry. */
export function presetForRules(rules: string): ProxyPreset {
  const trimmed = rules.trim();
  const match = PROXY_PRESETS.find((preset) => preset.rules === trimmed && preset.id !== 'custom');
  if (match !== undefined) return match;

  const custom = PROXY_PRESETS.find((preset) => preset.id === 'custom');
  const direct = PROXY_PRESETS[0];
  if (trimmed === '' && direct !== undefined) return direct;
  return custom ?? { id: 'custom', name: 'Custom', rules: trimmed, note: '' };
}
