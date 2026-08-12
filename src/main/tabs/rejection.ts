/**
 * Noticing when a site has refused to sign you in because of what browser this
 * is, rather than because of anything you typed.
 *
 * Vela sends a plain Chrome user agent and the client hints to match, so a
 * check made against the headers passes. Google's is not made against the
 * headers. It reads the page's own JavaScript, where an Electron build gives
 * itself away: `navigator.userAgentData.brands` carries no `Google Chrome`
 * entry, and `window.chrome` is an empty object where a real Chrome has
 * `runtime`, `csi`, `loadTimes` and `app` hanging off it. Both are put back
 * for Google's sign-in hosts — see chrome-shim.ts — and on the page as
 * measured that is the whole of the gate.
 *
 * None of which is load-bearing. The check belongs to Google and can change
 * without notice, so this stays: when a refusal happens anyway, Vela
 * recognises it and says what happened, because "Couldn't sign you in" with no
 * explanation reads as Vela being broken, which is the one thing it is not.
 */

/** A sign-in refused for being the wrong browser, never for a wrong password. */
export interface SignInRejection {
  /** Whose sign-in refused, for the message. */
  service: string;
}

/**
 * Google's OAuth refusal. A client that is judged an embedded browser is sent
 * back to the app with this in the query rather than a code.
 */
const OAUTH_REJECTION = 'error=disallowed_useragent';

/**
 * Reads a URL and says whether it is a browser refusal.
 *
 * Both forms are the observed ones, not guesses. Signing in through the web
 * form lands on `accounts.google.com/v3/signin/rejected` — as an in-page
 * navigation, so whatever watches for this has to watch those too. The `v3` is
 * not matched on: Google has moved this path between versions before and the
 * suffix is what has stayed put.
 */
/**
 * Where to send someone who wants to finish signing in elsewhere.
 *
 * Never the refusal URL itself. That page is the end of a flow and its query
 * carries one-shot, session-bound parameters — `dsh`, `epd`, `rhlk`, `rrk` —
 * which mean nothing in a browser that was not part of the flow. Handing it
 * over verbatim gets a bare "400. That's an error. The server cannot process
 * the request because it is malformed", which is a worse dead end than the one
 * it was meant to escape.
 *
 * So the query goes, and with it the path where the path is itself the dead
 * end. What is wanted is the front door: a sign-in that can start cleanly.
 */
export function externalUrlForRejection(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') return null;

  // Google's own refusal page. Its front door is the sign-in root.
  if (parsed.host === 'accounts.google.com') return 'https://accounts.google.com/';

  // An OAuth refusal comes back to the application's callback, which is not
  // a page anyone can use on its own. The application's origin is.
  return `${parsed.origin}/`;
}

export function detectSignInRejection(url: string): SignInRejection | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.search.includes(OAUTH_REJECTION)) return { service: 'Google' };

  const google = parsed.host === 'accounts.google.com' || parsed.host.endsWith('.google.com');
  if (google && parsed.pathname.endsWith('/signin/rejected')) return { service: 'Google' };

  return null;
}
