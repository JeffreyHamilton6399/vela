/**
 * Noticing when a site has refused to sign you in because of what browser this
 * is, rather than because of anything you typed.
 *
 * Google's sign-in is the one that does this, and Vela now passes it: the
 * missing piece was the three members every real Chrome hangs off
 * `window.chrome` and Electron leaves off, injected at document-start. See
 * `buildBrowserSurfaceScript` in privacy/policies.ts for what goes in and what
 * was measured.
 *
 * A previous version concluded the check could not be passed at all, on the
 * strength of a run that refused the same address with the surface restored.
 * That run was driven through the devtools protocol with `--enable-automation`
 * set, so `navigator.webdriver` was true throughout and Google would have
 * refused whatever else was on the page. The surface work was reverted on the
 * back of that result; it was the harness that was wrong.
 *
 * This is kept because passing a check today is not the same as passing it
 * tomorrow. Google can change what it reads whenever it likes, and the failure
 * it produces — "Couldn't sign you in", no reason given — reads as Vela being
 * broken rather than as a door being held shut. If that comes back, this says
 * which it is and offers the way round.
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
