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
/* Referer                                                             */
/* ------------------------------------------------------------------ */

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Drops `Referer` when it would tell a different origin where you came from.
 * Same-origin referers are kept: plenty of sites break without them, and they
 * leak nothing the destination does not already know.
 */
export function stripCrossOriginReferer(
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
  if (from !== null && from === to) return headers;

  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => name.toLowerCase() !== 'referer'),
  );
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
