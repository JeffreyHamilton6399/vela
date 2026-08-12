/**
 * Noticing when a site has refused to sign you in because of what browser this
 * is, rather than because of anything you typed.
 *
 * Vela sends a plain Chrome user agent and the client hints to match, so a
 * check made against the headers passes. Google's is not made against the
 * headers. It reads the page's own JavaScript, where an Electron build cannot
 * pass: `navigator.userAgentData.brands` carries no `Google Chrome` entry, and
 * `window.chrome` is an empty object where a real Chrome has `runtime`, `csi`,
 * `loadTimes` and `app` hanging off it. Faking either means injecting script
 * into web content, and web content in Vela gets no bridge of any kind — the
 * whole security posture rests on that, and it is not worth trading for one
 * sign-in page.
 *
 * So Vela does not fight it. It recognises the refusal and says what happened,
 * because "Couldn't sign you in" with no explanation reads as Vela being
 * broken, which is the one thing it is not.
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
