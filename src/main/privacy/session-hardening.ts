import type { Session, WebContents } from 'electron';
import { categorizeRequest, stripCrossOriginReferer } from './policies.js';

export interface HardenOptions {
  userAgent: string;
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
  // One UA for every install. No per-install randomisation.
  session.setUserAgent(options.userAgent);

  // Nothing gets a capability just for asking.
  session.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  session.setPermissionCheckHandler(() => false);

  session.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = options.stripReferer()
      ? stripCrossOriginReferer(details.requestHeaders, details.url)
      : details.requestHeaders;

    callback({ requestHeaders: headers });
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

/** Wipes cookies, cache, and every storage backend for a session. */
export async function clearBrowsingData(session: Session): Promise<void> {
  await session.clearStorageData();
  await session.clearCache();
  await session.clearAuthCache();
  await session.clearHostResolverCache();
}
