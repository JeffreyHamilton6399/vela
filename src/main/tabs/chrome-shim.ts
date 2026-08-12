import type { WebContents } from 'electron';

/**
 * Putting back the parts of Chrome's JavaScript surface Electron leaves out.
 *
 * Google's sign-in does not check the headers — Vela already sends a plain
 * Chrome user agent and matching client hints, which is why the sign-in page
 * loads. It checks the page's own JavaScript, and there an Electron build is
 * unmistakable: `window.chrome` is an empty object where a real Chrome carries
 * `app`, `runtime`, `csi` and `loadTimes`, and `navigator.userAgentData` lists
 * Chromium with no Google Chrome brand beside it. Fail either and the sign-in
 * ends on "This browser or app may not be secure".
 *
 * Restoring both is measured to be the whole of the gate: the same page, the
 * same address typed in, refuses an unmodified Vela and accepts one carrying
 * these four stubs and one brand.
 *
 * It has to be in place before the page's own scripts run. Injecting once the
 * document is ready — which is when the autofill runs, and the obvious place to
 * put this — is measurably too late: the shim is present and correct afterwards
 * and Google refuses anyway, because it has already read what it needed. So the
 * script is registered through the DevTools protocol, which is the one route
 * that runs in the page's own world at document-start.
 *
 * Three things this deliberately is not:
 *
 * - **Not a bridge.** Tabs keep `sandbox: true`, `contextIsolation: true` and
 *   no preload — measured on the running app, not assumed. The page gets four
 *   inert functions and a list of strings; nothing gets a route back into Vela.
 * - **Not load-bearing.** Google can add a check whenever it likes and this
 *   stops working, so the banner that explains a refusal stays exactly where it
 *   is. Best case sign-in works; worst case the behaviour is what it was, with
 *   an explanation rather than a mystery.
 * - **Not everywhere.** A document-start script is registered per tab rather
 *   than per address, so the guard is the first thing in the script itself:
 *   anywhere but Google's sign-in hosts it returns having done nothing, and the
 *   web at large sees an unmodified Vela.
 */

/** Where Google runs the check. Not the whole of google.com. */
const SIGN_IN_HOSTS = new Set(['accounts.google.com', 'accounts.youtube.com']);

export function needsChromeShim(url: string): boolean {
  try {
    return SIGN_IN_HOSTS.has(new URL(url).host);
  } catch {
    return false;
  }
}

/**
 * The stubs, as Chrome shapes them. `csi` and `loadTimes` are long-deprecated
 * and return plausible numbers rather than real ones — nothing reads them for
 * anything but their existence.
 */
const SHIM_SCRIPT = `(() => {
  // Registered for every document in the tab, so this is what keeps it to the
  // hosts that check. Everywhere else the script ends here.
  if (!%HOSTS%.includes(location.host)) return;

  const major = String(%MAJOR%);
  const full = %FULL%;

  const chrome = window.chrome ?? {};
  chrome.app ??= { isInstalled: false, InstallState: {}, RunningState: {} };
  chrome.runtime ??= {
    OnInstalledReason: {}, PlatformOs: {},
    connect: () => {}, sendMessage: () => {},
  };
  chrome.csi ??= () => ({ onloadT: Date.now(), startE: Date.now(), pageT: 1, tran: 15 });
  chrome.loadTimes ??= () => ({
    requestTime: Date.now() / 1000,
    finishLoadTime: Date.now() / 1000,
  });
  window.chrome = chrome;

  const existing = navigator.userAgentData?.brands ?? [];
  if (!existing.some((entry) => entry.brand === 'Google Chrome')) {
    const brands = [
      { brand: 'Not;A=Brand', version: '8' },
      { brand: 'Chromium', version: major },
      { brand: 'Google Chrome', version: major },
    ];
    const full_list = brands.map((entry) => ({ brand: entry.brand, version: full }));
    try {
      Object.defineProperty(navigator, 'userAgentData', {
        configurable: true,
        get: () => ({
          brands,
          mobile: false,
          platform: %PLATFORM%,
          getHighEntropyValues: async (hints) => ({
            architecture: 'x86', bitness: '64', model: '', mobile: false,
            platform: %PLATFORM%, platformVersion: '15.0.0',
            uaFullVersion: full, fullVersionList: full_list, brands,
          }),
          toJSON: () => ({ brands, mobile: false, platform: %PLATFORM% }),
        }),
      });
    } catch {
      // A build that will not let this be redefined keeps what it had.
    }
  }
  return true;
})()`;

export interface ChromeIdentity {
  chromeMajorVersion: string;
  chromeFullVersion: string;
  /** The `Sec-CH-UA-Platform` token, so the JS and the headers agree. */
  platform: string;
}

/** The script as it is registered, with this build's version baked in. */
export function buildShimScript(identity: ChromeIdentity): string {
  return SHIM_SCRIPT.replaceAll('%HOSTS%', JSON.stringify([...SIGN_IN_HOSTS]))
    .replaceAll('%MAJOR%', JSON.stringify(identity.chromeMajorVersion))
    .replaceAll('%FULL%', JSON.stringify(identity.chromeFullVersion))
    .replaceAll('%PLATFORM%', JSON.stringify(identity.platform));
}

/**
 * Registers the shim to run at document-start for every page this tab loads.
 *
 * Called once per view, before anything is navigated to. The debugger has to
 * be attached to a live renderer, which is why this happens after the blank
 * page rather than in the constructor — attaching earlier hangs on
 * `Page.enable` with nothing to enable.
 *
 * Failure is not fatal anywhere: a tab that will not take the script simply
 * behaves as Vela did before, refusal banner and all.
 */
export async function registerChromeShim(
  contents: WebContents,
  identity: ChromeIdentity,
): Promise<boolean> {
  try {
    if (!contents.debugger.isAttached()) contents.debugger.attach('1.3');
    await contents.debugger.sendCommand('Page.enable');
    await contents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
      source: buildShimScript(identity),
    });
    return true;
  } catch {
    return false;
  }
}
