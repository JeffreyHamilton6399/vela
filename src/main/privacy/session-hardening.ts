import type { PostBody, Referrer, Session, WebContents } from 'electron';
import {
  ACCEPT_LANGUAGES,
  allowsPermission,
  applyClientHints,
  buildBrowserSurfaceScript,
  categorizeRequest,
  trimCrossOriginReferer,
  type BrowserIdentity,
} from './policies.js';

/**
 * The surface script each hardened session's pages get, keyed by that session.
 *
 * Kept here rather than threaded through every view that shows a page: the
 * script and the client hints are two halves of one claim, so the thing that
 * put the headers on the session is the right thing to hold the script that
 * has to agree with them. A session Vela never hardened has no entry and its
 * pages get nothing, which is the safe direction to fail in.
 */
const SURFACE_SCRIPTS = new WeakMap<Session, string>();

export interface HardenOptions {
  userAgent: string;
  /** The platform and Chromium version the client hints have to agree with. */
  identity: BrowserIdentity;
  isDev: boolean;
  stripReferer: () => boolean;
  /** Development-only report of a request Vela should never have made. */
  onUnexpectedRequest: (url: string) => void;
}

/**
 * Applies Vela's session-wide privacy posture. Called once per session,
 * including the throwaway session behind each private window.
 */
export function hardenSession(session: Session, options: HardenOptions): void {
  // One UA for every install, and one set of languages. No per-install
  // randomisation of either: the point is that Vela users look like each other.
  session.setUserAgent(options.userAgent, ACCEPT_LANGUAGES);

  // What the pages on this session will claim in JavaScript, built from the
  // same identity as the headers set below.
  SURFACE_SCRIPTS.set(session, buildBrowserSurfaceScript(options.identity));

  // Nothing that reaches past the page gets a capability just for asking. The
  // handful that only change how a page uses its own window are allowed, and
  // both handlers answer from the same list so a page cannot be told it has
  // something it will then be refused.
  session.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(allowsPermission(permission));
  });
  session.setPermissionCheckHandler((_contents, permission) => allowsPermission(permission));

  session.webRequest.onBeforeSendHeaders((details, callback) => {
    const referer = options.stripReferer()
      ? trimCrossOriginReferer(details.requestHeaders, details.url)
      : details.requestHeaders;

    // The UA above claims Chrome; the client hints have to say the same thing,
    // or a sign-in page reads the disagreement as an embedded webview.
    callback({ requestHeaders: applyClientHints(referer, details.url, options.identity) });
  });

  if (options.isDev) {
    // The assertion the master prompt asks for: anything that is neither a
    // page the user navigated to nor the update check is a bug, and it is
    // caught here during development rather than after shipping.
    session.webRequest.onBeforeRequest((details, callback) => {
      const category = categorizeRequest({
        url: details.url,
        fromWebContents: details.webContentsId !== undefined,
      });
      if (category === 'unexpected') options.onUnexpectedRequest(details.url);
      callback({});
    });
  }
}

/**
 * WebRTC can otherwise enumerate local interfaces and hand a site your LAN
 * address even through a VPN. This restricts it to the public interface.
 */
export function applyWebRtcPolicy(contents: WebContents): void {
  contents.setWebRTCIPHandlingPolicy('default_public_interface_only');
}

/**
 * A page's browser surface, installed on demand.
 *
 * Nothing happens until `ready` is called, and it is called by whatever is
 * about to put a document in the view. The laziness is the point: installing
 * needs a renderer process, the only way to get one is to load something, and
 * a tab sitting on the new tab page deliberately has neither. Priming every
 * view as it was created handed each idle tab a document it never asked for,
 * which is a real difference in what the browser is doing even when the user
 * cannot see it.
 */
export interface BrowserSurface {
  /**
   * Installs the surface, resolving once a document created after this point
   * will see it. Safe to call repeatedly — the work happens once.
   */
  ready: () => Promise<void>;
}

/**
 * Gives a page the JavaScript half of Vela's browser identity.
 *
 * It has to run at document-start, before the page's own scripts: the same
 * script applied at `dom-ready` leaves Google's sign-in refusing the address,
 * and applied a moment earlier lets it through. Electron has no document-start
 * hook into the main world — a preload runs in the isolated world, which is
 * the whole point of `contextIsolation` and not a flag Vela will trade — so
 * this goes in over the devtools protocol, which does.
 *
 * The cost is a debugger attachment per page, and it is a real one: opening
 * DevTools takes the attachment away, so the `detach` handler lets the next
 * navigation put it back. Everything here fails soft. A page that does not get
 * the script is a page that browses normally and may be turned away by a
 * sign-in — never a page that fails to load.
 */
export function applyBrowserSurface(
  contents: WebContents,
  options: { prime: boolean },
): BrowserSurface {
  const source = SURFACE_SCRIPTS.get(contents.session);
  if (source === undefined) return { ready: () => Promise.resolve() };

  let installed = false;
  /** Set once something has actually asked for the surface. */
  let started = false;
  /** The one in-flight or finished install, so `ready` is idempotent. */
  let pending: Promise<void> | null = null;

  /**
   * Set the moment this page starts going away.
   *
   * Load-bearing, not tidiness. Every step below is a call into a live
   * WebContents, and a tab closed while the handshake is in flight — which is
   * a tab opened and closed inside a second, and every e2e spec that does so —
   * takes the whole app down if one of them lands after it. `isDestroyed()`
   * alone is not enough: it is still false while the close is under way.
   */
  let gone = false;
  const alive = (): boolean => !gone && !contents.isDestroyed();
  contents.once('destroyed', () => {
    gone = true;
  });

  /**
   * Takes this page's devtools attachment, and takes it early.
   *
   * A WebContents has exactly one attachment to give, and it is given to
   * whoever asks first. Asking at view-creation time means asking while there
   * is no renderer and no document — before the page is something any other
   * client can find, so there is nobody to take it from and nobody to lose it
   * to. Asking later means racing whatever else is driving the browser, which
   * during an e2e run is the harness, and one of the two then loses its
   * session mid-test.
   *
   * Safe with no renderer: attaching does not need one. Only `Page.enable`
   * does, which is why the rest of the work waits for `ready`.
   */
  const claimDebugger = (): void => {
    if (!alive() || contents.debugger.isAttached()) return;
    try {
      contents.debugger.attach('1.3');
    } catch {
      // Something else holds it — DevTools, or a harness that got there first.
      // The page browses on without the surface.
    }
  };

  const register = async (): Promise<void> => {
    if (installed || !alive()) return;

    claimDebugger();

    // A view that has never loaded anything has no renderer process, and the
    // devtools Page domain has nothing to enable without one — the command
    // simply never settles. `about:blank` gives it one; it costs a few
    // milliseconds and is taken back out of the history below. Only for a view
    // Vela is about to load itself: doing it to a popup would cancel the
    // navigation it was opened for.
    if (options.prime && contents.getOSProcessId() === 0 && contents.getURL() === '') {
      await contents.loadURL('about:blank').catch(() => undefined);
      if (!alive()) return;
      forgetPrimeEntry(contents);
    }

    // `Page.enable` before registering. Without it the registration is accepted
    // and silently does nothing, which from here is indistinguishable from
    // success — that is exactly how this was written off as unfixable once.
    await contents.debugger.sendCommand('Page.enable');
    if (!alive()) return;

    await contents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source });
    installed = alive();
  };

  const install = (): Promise<void> =>
    register().catch(() => {
      // DevTools holds the attachment, or the page went away mid-handshake.
      // A page without the script browses normally; it may just be turned
      // away by a sign-in that checks.
      installed = false;
    });

  contents.debugger.on('detach', () => {
    installed = false;
  });

  // Puts it back after DevTools hands the attachment over, and covers a first
  // attempt that lost its race with the page going away. Only ever a repair:
  // it never starts the work on a view that has not asked for it.
  contents.on('did-start-navigation', () => {
    if (started && alive()) void install();
  });

  // Eagerly, and only this. Everything that would give the view a document
  // waits until something actually wants to put a page in it.
  claimDebugger();

  return {
    ready: () => {
      started = true;
      pending ??= install();
      return pending;
    },
  };
}

/** What a `window.open` asked for, as `did-create-window` reports it. */
export interface PopupNavigation {
  url: string;
  referrer: Referrer;
  /** Only a form that targeted a new window has one. */
  postBody?: PostBody | undefined;
}

/**
 * How long a popup will wait for its surface before being loaded regardless.
 *
 * The install is a handful of local devtools round trips and lands in single
 * -digit milliseconds; this is not a budget, it is a stop. A popup held still
 * for a surface that never arrives is a sign-in window that stays blank
 * forever, which is a far worse outcome than one that signs in without the
 * script and gets turned away with a message explaining why.
 */
const POPUP_SURFACE_WAIT_MS = 2000;

/**
 * Puts the surface in front of a popup's first document.
 *
 * A tab can simply wait: nothing has been asked of it until Vela calls
 * `loadUrl`, so the load is chained behind `ready` and the script is always
 * there first. A popup is the other way round. Electron creates the window,
 * starts the navigation `window.open` asked for, and only then hands it over
 * on `did-create-window` — so by the time anything here runs, the document is
 * already on its way and registering a script for the *next* one is too late.
 *
 * Measured, not assumed: a popup configured the obvious way sees an empty
 * `window.chrome`, while the tab beside it sees all three members. That gap is
 * precisely what Google's sign-in looks through, and every "Sign in with …"
 * button opens a popup — so the browser passed the check in a tab and failed
 * it in the one window that does the signing in.
 *
 * The fix is to hold the navigation, install, and re-issue it. The referrer
 * and any post body are carried across because the flow that opened this
 * window is entitled to both, and an OAuth endpoint reached without its
 * referrer is refused on different grounds entirely. `window.opener` survives
 * this: the handle belongs to the window, not to the document in it.
 *
 * A popup opened with no URL of its own is left alone. That window is a blank
 * document the opener writes into directly, so there is no navigation to hold
 * and re-issuing one would throw away whatever has already been written.
 */
export function applyBrowserSurfaceToPopup(contents: WebContents, opened: PopupNavigation): void {
  const surface = applyBrowserSurface(contents, { prime: false });
  const web = opened.url.startsWith('https://') || opened.url.startsWith('http://');
  if (!web) {
    void surface.ready();
    return;
  }

  contents.stop();

  let reissued = false;
  const reissue = (): void => {
    if (reissued) return;
    reissued = true;
    clearTimeout(timer);
    if (contents.isDestroyed()) return;
    const post = opened.postBody?.data;
    void contents
      .loadURL(opened.url, {
        httpReferrer: opened.referrer,
        // Omitted rather than passed as undefined: a load told it has no post
        // data is a different request from one never told anything.
        ...(post === undefined ? {} : { postData: post }),
      })
      .catch(() => {
        // The popup shows the page's own error, exactly as a tab would.
      });
  };

  // Whichever comes first: the surface, or the stop above outliving its
  // welcome. Both paths lead to the same single load.
  const timer = setTimeout(reissue, POPUP_SURFACE_WAIT_MS);
  void surface.ready().then(reissue, reissue);
}

/**
 * Drops the `about:blank` the prime left in a view's navigation history.
 *
 * The prime is Vela's own business and the user never asked for it, so it must
 * not turn up in theirs: left in place it becomes the entry behind the first
 * page you open, and Back from that page lands on a blank document instead of
 * the new tab page it has always gone to.
 *
 * Waits for the real page, because an entry cannot be removed while it is the
 * current one. By then history is exactly `[about:blank, the page]` — nothing
 * of the user's can be at index 0 — and the check on the URL says so before
 * anything is removed.
 */
function forgetPrimeEntry(contents: WebContents): void {
  const drop = (): void => {
    if (contents.isDestroyed()) return;

    const history = contents.navigationHistory;
    // Nothing to do until a real page has committed on top of the blank: an
    // entry cannot be removed while it is the current one.
    if (history.length() < 2) return;
    if (history.getAllEntries()[0]?.url !== 'about:blank') {
      contents.off('did-navigate', onNavigated);
      return;
    }

    history.removeEntryAtIndex(0);
    contents.off('did-navigate', onNavigated);
  };

  // Deliberately not `once`. The prime's own navigation fires this event too,
  // and a one-shot listener is spent on it — leaving the blank in place for
  // the real page that follows, which is the whole thing this exists to
  // prevent. It stays until the entry is actually gone.
  const onNavigated = (): void => {
    // After the commit, so the page rather than the blank is current.
    setImmediate(drop);
  };

  contents.on('did-navigate', onNavigated);
}

/**
 * Hands the devtools attachment back before a page is closed.
 *
 * Tearing down a WebContents with a session still attached is what turns a tab
 * closed mid-handshake into a dead application rather than a closed tab.
 */
export function releaseBrowserSurface(contents: WebContents): void {
  try {
    if (!contents.isDestroyed() && contents.debugger.isAttached()) contents.debugger.detach();
  } catch {
    // Already gone, or never attached. Nothing to give back either way.
  }
}

/** Wipes cookies, cache, and every storage backend for a session. */
export async function clearBrowsingData(session: Session): Promise<void> {
  await session.clearStorageData();
  await session.clearCache();
  await session.clearAuthCache();
  await session.clearHostResolverCache();
}
