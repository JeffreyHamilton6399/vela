import type { BrowserWindow, WindowOpenHandlerResponse } from 'electron';
import { REQUIRED_WEB_PREFERENCES } from '../window-options.js';
import {
  applyBrowserSurfaceToPopup,
  applyWebRtcPolicy,
  type PopupNavigation,
} from '../privacy/session-hardening.js';

/**
 * A `window.open` that asked for a sized window, which is Chrome's popup
 * disposition rather than its new-tab one.
 *
 * This is the shape every "Sign in with …" button uses. The page keeps the
 * returned handle to poll `closed` and to `postMessage` through, and the popup
 * answers through `window.opener`. Denying it and opening a tab instead severs
 * both halves: `window.open` hands the page `null`, every OAuth SDK reads that
 * as "popup blocked", and the sign-in stops before it starts. Chrome's own rule
 * is exactly this one — features mean a popup, no features mean a tab.
 */
export function isPopupDisposition(disposition: string): boolean {
  return disposition === 'new-window';
}

/**
 * The response that lets a real popup through. It is a genuine window rather
 * than a tab, but it carries none of Vela's bridge and none of Node: the same
 * four non-negotiable flags a tab gets, and no preload.
 */
export function allowPopup(): WindowOpenHandlerResponse {
  return {
    action: 'allow',
    // A sign-in popup belongs to the page that opened it. When that tab goes,
    // so does the popup — it has nothing left to report back to.
    outlivesOpener: false,
    overrideBrowserWindowOptions: {
      title: 'Vela',
      autoHideMenuBar: true,
      // Framed, unlike Vela's own window: a popup with no chrome and no
      // address bar is precisely the thing you should not type a password into.
      webPreferences: {
        ...REQUIRED_WEB_PREFERENCES,
        spellcheck: true,
      },
    },
  };
}

export interface PopupOptions {
  /** Same https vetting a tab's navigations go through. */
  vetNavigation: (url: string) => { url: string } | { interstitial: string } | null;
  /** A link in the popup that wants a tab: it lands in the opener's window. */
  openInNewTab: (url: string) => void;
  /** What `window.open` asked for, so the surface can get in front of it. */
  opened: PopupNavigation;
}

/**
 * Brings a popup up to a tab's standard once Electron has created it. A popup
 * has no Vela chrome to draw an interstitial into, so a plain-http address is
 * upgraded where it can be and otherwise left to the page's own error.
 */
export function configurePopup(window: BrowserWindow, options: PopupOptions): void {
  const contents = window.webContents;
  applyWebRtcPolicy(contents);
  // This window is already navigating, so the surface cannot simply be
  // registered beside it — see applyBrowserSurfaceToPopup, which holds that
  // navigation and re-issues it. A sign-in popup is the one window in Vela
  // where the surface has to be right.
  applyBrowserSurfaceToPopup(contents, options.opened);

  contents.on('will-navigate', (event, url) => {
    const verdict = options.vetNavigation(url);
    if (verdict === null || 'interstitial' in verdict) return;
    event.preventDefault();
    void contents.loadURL(verdict.url).catch(() => {
      // The popup shows the page's own error, as a tab would.
    });
  });

  // A popup does not get to spawn more popups: anything it opens becomes a tab
  // in the window the sign-in started from, and nothing but the web gets out.
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) options.openInNewTab(url);
    return { action: 'deny' };
  });
}
