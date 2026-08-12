/**
 * Pure privacy decisions. Everything here is a plain function over plain data
 * so the policy can be asserted by unit tests rather than trusted by comment.
 */

/* ------------------------------------------------------------------ */
/* User agent                                                          */
/* ------------------------------------------------------------------ */

/**
 * One user agent string for every Vela install on a platform. Randomising it
 * per install would be a fingerprint, not a defence — the point is that Vela
 * users are indistinguishable from one another.
 *
 * Vela is not named in the string: an unusual browser token is itself an
 * identifying bit. What ships is the plain Chrome UA for the platform.
 */
export function buildUserAgent(platform: string, chromeMajorVersion: string): string {
  const chrome = `Chrome/${chromeMajorVersion}.0.0.0`;
  const base = 'Mozilla/5.0';
  const suffix = `AppleWebKit/537.36 (KHTML, like Gecko) ${chrome} Safari/537.36`;

  switch (platform) {
    case 'darwin':
      return `${base} (Macintosh; Intel Mac OS X 10_15_7) ${suffix}`;
    case 'win32':
      return `${base} (Windows NT 10.0; Win64; x64) ${suffix}`;
    default:
      return `${base} (X11; Linux x86_64) ${suffix}`;
  }
}

/* ------------------------------------------------------------------ */
/* Browser identity                                                    */
/* ------------------------------------------------------------------ */

/**
 * Puts `Google Chrome` into a `Sec-CH-UA` brand list beside `Chromium`.
 *
 * The user agent string is only half of what a site reads. The other half is
 * the client-hint brand list, which Chromium builds from what it actually is:
 * an Electron embedder advertises `"Chromium";v="150"` and no Chrome brand.
 * The two halves then disagree — the UA says Chrome, the hints say a Chromium
 * that is not Chrome — and a sign-in page that checks concludes it is looking
 * at an embedded webview. Google's is the one that says "this browser or app
 * may not be secure".
 *
 * Every Chromium-derived browser resolves this the same way, by claiming the
 * Chrome brand it is compatible with. It also serves the rule the rest of this
 * file follows: one identity for every Vela install, and one that a very large
 * number of other machines also send.
 *
 * The version is copied from the Chromium entry rather than invented, so the
 * two brands can never disagree about which build this is.
 */
export function alignBrandListWithChrome(value: string): string {
  const entries = [...value.matchAll(/"((?:[^"\\]|\\.)*)";\s*v="((?:[^"\\]|\\.)*)"/g)].map(
    (match) => ({ brand: match[1] ?? '', version: match[2] ?? '' }),
  );
  if (entries.length === 0) return value;
  if (entries.some((entry) => entry.brand === 'Google Chrome')) return value;

  const chromium = entries.find((entry) => entry.brand === 'Chromium');
  if (chromium === undefined) return value;

  // Chrome's own order is GREASE, Chromium, Google Chrome. Appending matches
  // it, and the GREASE entry Chromium already generated is left alone.
  return [...entries, { brand: 'Google Chrome', version: chromium.version }]
    .map((entry) => `"${entry.brand}";v="${entry.version}"`)
    .join(', ');
}

/** The client-hint headers whose brand lists have to agree with the UA. */
const BRAND_LIST_HEADERS = new Set(['sec-ch-ua', 'sec-ch-ua-full-version-list']);

/** Chrome's own `Sec-CH-UA-Platform` token for a Node platform string. */
export function clientHintPlatform(platform: string): string {
  switch (platform) {
    case 'darwin':
      return 'macOS';
    case 'win32':
      return 'Windows';
    default:
      return 'Linux';
  }
}

export interface BrowserIdentity {
  platform: string;
  chromeMajorVersion: string;
}

/**
 * The low-entropy client hints Chrome puts on every request to a secure origin.
 *
 * Electron sends none of these — not one, whatever the user agent is set to,
 * because Chromium only emits them for an embedder that supplies user-agent
 * metadata and Electron exposes no way to. The result is a browser whose UA
 * string claims `Chrome/150` and which then sends no `Sec-CH-UA` at all, a
 * combination no real Chrome has ever produced. Sign-in and bot-detection
 * front ends read that gap the same way they read an outright webview.
 *
 * These are the three hints Chrome sends unprompted; the higher-entropy ones
 * are only sent when a site asks via `Accept-CH`, and Vela does not volunteer
 * them. Everything here is derived from the same two facts the user agent is
 * built from, so every Vela install on a platform sends exactly this.
 */
export function defaultClientHints(identity: BrowserIdentity): Record<string, string> {
  const version = identity.chromeMajorVersion;
  return {
    // The GREASE entry mirrors what this Chromium reports to `navigator
    // .userAgentData`, so the header and the JS API tell the same story.
    'Sec-CH-UA': `"Not;A=Brand";v="8", "Chromium";v="${version}", "Google Chrome";v="${version}"`,
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': `"${clientHintPlatform(identity.platform)}"`,
  };
}

/**
 * True where Chrome would send client hints at all: secure origins, plus the
 * loopback ones Chromium treats as trustworthy. A plain-http site learns
 * nothing about the browser beyond what the UA already told it.
 */
function isSecureContext(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'wss:') return true;
    return isLocalHost(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Puts Vela's browser identity on a request: brand lists that already exist are
 * aligned with the UA, and the hints Chromium never sent are added. Headers
 * Vela does not recognise are passed through untouched.
 */
export function applyClientHints(
  headers: Record<string, string | string[]>,
  requestUrl: string,
  identity: BrowserIdentity,
): Record<string, string | string[]> {
  const aligned = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => {
      if (!BRAND_LIST_HEADERS.has(name.toLowerCase()) || typeof value !== 'string') {
        return [name, value];
      }
      return [name, alignBrandListWithChrome(value)];
    }),
  );

  if (!isSecureContext(requestUrl)) return aligned;

  const present = new Set(Object.keys(aligned).map((name) => name.toLowerCase()));
  const missing = Object.entries(defaultClientHints(identity)).filter(
    ([name]) => !present.has(name.toLowerCase()),
  );

  return { ...aligned, ...Object.fromEntries(missing) };
}

/* ------------------------------------------------------------------ */
/* Referer                                                             */
/* ------------------------------------------------------------------ */

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Cuts `Referer` back to a bare origin when it would tell a different site
 * which page you came from, and drops it entirely on a downgrade to plain
 * http. Same-origin referers are kept whole: plenty of sites break without
 * them, and they leak nothing the destination does not already know.
 *
 * The origin is kept rather than the header removed, because removing it
 * breaks signing in. A cross-origin `POST` is the shape every login submit and
 * every OAuth hop takes, and CSRF middleware that has no `Origin` to check
 * falls back to `Referer` — Django rejects an https request outright when both
 * are missing. Sending the origin alone is exactly what Chrome and Firefox do
 * by default (`strict-origin-when-cross-origin`): the path and query, which is
 * where anything private lives, still never leave.
 */
export function trimCrossOriginReferer(
  headers: Record<string, string | string[]>,
  requestUrl: string,
): Record<string, string | string[]> {
  const key = Object.keys(headers).find((name) => name.toLowerCase() === 'referer');
  if (key === undefined) return headers;

  const raw = Object.entries(headers).find(([name]) => name === key)?.[1];
  const referer = Array.isArray(raw) ? raw[0] : raw;
  if (referer === undefined) return headers;

  const from = originOf(referer);
  const to = originOf(requestUrl);
  if (from === null) return headers;
  if (from === to) return headers;

  const without = Object.entries(headers).filter(([name]) => name.toLowerCase() !== 'referer');

  // https → http tells a network observer where you had been. Nothing survives
  // that hop, which is the one case where Chrome sends no referer either.
  if (isHttps(referer) && !isHttps(requestUrl)) return Object.fromEntries(without);

  return Object.fromEntries([...without, [key, `${from}/`]]);
}

/* ------------------------------------------------------------------ */
/* HTTPS upgrades                                                      */
/* ------------------------------------------------------------------ */

export type HttpsDecision =
  | { action: 'continue' }
  | { action: 'upgrade'; url: string }
  | { action: 'interstitial'; url: string };

/** Hosts where plain http is normal and upgrading would simply break. */
function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.local')
  );
}

/**
 * Decides what to do with a top-level navigation.
 *
 * Plain http is upgraded to https unless the user has already chosen to accept
 * http for that host, in which case they get the interstitial instead of a
 * silent downgrade.
 */
export function decideHttpsUpgrade(
  url: string,
  options: { enabled: boolean; allowlist: readonly string[] },
): HttpsDecision {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { action: 'continue' };
  }

  if (parsed.protocol !== 'http:') return { action: 'continue' };
  if (isLocalHost(parsed.hostname)) return { action: 'continue' };
  if (!options.enabled) return { action: 'continue' };

  if (options.allowlist.includes(parsed.host)) {
    return { action: 'interstitial', url };
  }

  const upgraded = new URL(parsed.toString());
  upgraded.protocol = 'https:';
  return { action: 'upgrade', url: upgraded.toString() };
}

/* ------------------------------------------------------------------ */
/* The two allowed network categories                                  */
/* ------------------------------------------------------------------ */

export const UPDATE_FEED_URL =
  'https://api.github.com/repos/JeffreyHamilton6399/vela/releases/latest';

/** The assistant's endpoint, contacted only when the user has set a key. */
export const ASSISTANT_HOST = 'api.groq.com';

export type RequestCategory = 'page' | 'update' | 'assistant' | 'unexpected';

/**
 * Vela makes two kinds of request on its own account: pages the user navigated
 * to, and the update check — plus the assistant, if and only if the user has
 * entered their own key. Anything else is a bug, and in development it is
 * reported as one rather than quietly going out.
 */
export function categorizeRequest(input: {
  url: string;
  /** The webContents that initiated it, if any. */
  fromWebContents: boolean;
}): RequestCategory {
  if (input.url.startsWith(UPDATE_FEED_URL)) return 'update';
  if (input.url.includes(ASSISTANT_HOST)) return 'assistant';
  if (input.fromWebContents) return 'page';
  return 'unexpected';
}
