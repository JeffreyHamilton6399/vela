import { randomUUID } from 'node:crypto';
import {
  BrowserWindow,
  session as electronSession,
  shell,
  type ContextMenuParams,
  type Session,
  type WebContents,
} from 'electron';
import { EVENT_CHANNELS, type BrowserState, type WindowState } from '../shared/types/ipc.js';
import type { Platform } from '../shared/types/ipc.js';
import type { SettingsStore } from './settings/store.js';
import type { Workspace } from '../shared/settings.js';
import type { BlockerHandle } from './privacy/adblock.js';
import type { BrowserIdentity } from './privacy/policies.js';
import type { FaviconCache } from './favicons/favicon-cache.js';
import type { HistoryStore } from './history/history-store.js';
import { DownloadManager } from './downloads/download-manager.js';
import { DownloadPopup } from './downloads/download-popup.js';
import { PanelManager } from './panels/panel-manager.js';
import { hardenSession } from './privacy/session-hardening.js';
import { createWindowOptions } from './window-options.js';
import { readWindowState } from './ipc/register-window-ipc.js';
import { popupPageMenu } from './menus/page-menu.js';
import { TabManager } from './tabs/tab-manager.js';
import type { Tab } from './tabs/tab.js';
import type { Vault } from './account/vault.js';
import { fillLogin, watchForLogin, FORM_WAIT_MS } from './account/autofill.js';

export interface VelaWindowOptions {
  platform: Platform;
  preloadPath: string;
  rendererHtml: string;
  devServerUrl: string | undefined;
  backgroundColor: string;
  iconPath: string;
  userAgent: string;
  /** Platform and Chromium version, shared by the UA and the client hints. */
  identity: BrowserIdentity;
  isDev: boolean;
  isPrivate: boolean;
  settings: SettingsStore;
  blocker: BlockerHandle | null;
  favicons: FaviconCache | null;
  history: HistoryStore | null;
  vault: Vault | null;
  onClosed: (window: VelaWindow) => void;
  onUnexpectedRequest: (url: string) => void;
}

/** There is always at least one workspace; the first run creates it. */
function ensureWorkspaces(settings: SettingsStore): readonly Workspace[] {
  const existing = settings.current.workspaces;
  if (existing.length > 0) return existing;

  const initial: Workspace[] = [{ id: randomUUID(), name: 'Default' }];
  settings.update({ workspaces: initial, activeWorkspaceId: initial[0]?.id ?? null });
  return settings.current.workspaces;
}

/**
 * One browser window: its chrome renderer, its tabs, and the session they
 * share. A private window gets a memory-only session that is destroyed when
 * the window closes.
 */
export class VelaWindow {
  readonly window: BrowserWindow;
  readonly manager: TabManager;
  readonly session: Session;
  readonly isPrivate: boolean;
  readonly downloads: DownloadManager;
  readonly downloadPopup: DownloadPopup;
  readonly panels: PanelManager;

  private blockedTotal = 0;
  private readonly disposers: (() => void)[] = [];

  /**
   * Logins Vela has seen typed but not been told what to do with.
   *
   * The password lives here rather than travelling to the chrome renderer with
   * the prompt: the renderer only ever learns the host and the username, and
   * answers by id.
   */
  private readonly pendingCaptures = new Map<
    string,
    { host: string; username: string; password: string }
  >();

  constructor(private readonly options: VelaWindowOptions) {
    this.isPrivate = options.isPrivate;

    // A partition without the `persist:` prefix lives only in memory, so a
    // private window never touches the disk in the first place.
    this.session = options.isPrivate
      ? electronSession.fromPartition(`vela-private-${randomUUID()}`)
      : electronSession.defaultSession;

    hardenSession(this.session, {
      userAgent: options.userAgent,
      identity: options.identity,
      isDev: options.isDev,
      stripReferer: () => options.settings.current.stripCrossOriginReferer,
      onUnexpectedRequest: options.onUnexpectedRequest,
    });

    this.window = new BrowserWindow(
      createWindowOptions({
        platform: options.platform,
        preloadPath: options.preloadPath,
        backgroundColor: options.backgroundColor,
        iconPath: options.iconPath,
      }),
    );

    this.downloadPopup = new DownloadPopup({
      window: this.window,
      preloadPath: options.preloadPath,
      rendererHtml: options.rendererHtml,
      devServerUrl: options.devServerUrl,
      // Read lazily: the tab manager below is what knows the page's rectangle.
      getContentBounds: () => this.manager.contentBounds,
    });

    this.downloads = new DownloadManager(this.session, {
      onChanged: (items) => {
        this.send(EVENT_CHANNELS.downloadsChanged, items);
      },
      // What a browser normally does: the bubble appears by itself when a
      // download starts and again when it lands, and withdraws on its own.
      onNotable: () => {
        this.downloadPopup.show({ autoHide: true });
      },
    });

    this.manager = new TabManager({
      window: this.window,
      session: this.session,
      onStateChanged: (state) => {
        this.send(EVENT_CHANNELS.browserStateChanged, state);
      },
      getSearchEngineId: () => options.settings.current.searchEngineId,
      getHttpsPolicy: () => ({
        enabled: options.settings.current.forceHttps,
        allowlist: options.settings.current.httpAllowlist,
      }),
      allowHttpHost: (host) => {
        const current = options.settings.current.httpAllowlist;
        if (!current.includes(host)) {
          options.settings.update({ httpAllowlist: [...current, host] });
        }
      },
      resolveFavicon: async (pageUrl, iconUrl) =>
        (await options.favicons?.resolve(pageUrl, iconUrl, this.session)) ?? null,
      getWorkspaces: () => ensureWorkspaces(options.settings),
      setWorkspaces: (workspaces, activeId) => {
        options.settings.update({ workspaces, activeWorkspaceId: activeId });
      },
      getIdleMinutes: () => options.settings.current.suspendAfterMinutes,
      recordVisit: (url, title) => {
        // A private window is never recorded, whatever the setting says.
        if (options.isPrivate || !options.settings.current.keepHistory) return;
        options.history?.record(url, title);
      },
      onPageReady: (tab) => {
        this.autofillLogin(tab);
        this.watchForLoginToSave(tab);
      },
      onPageContextMenu: (tab, params) => {
        const contents = tab.webContents;
        if (contents !== null) this.showPageMenu(contents, params, tab.id);
      },
      // Read through Object.entries rather than by index: a host is arbitrary
      // text from a page and never indexes into an object Vela owns.
      getZoomForHost: (host) =>
        Object.entries(options.settings.current.zoomLevels).find(([key]) => key === host)?.[1] ?? 0,
      onContentBounds: () => {
        this.downloadPopup.reposition();
      },
      setZoomForHost: (host, level) => {
        // Rebuilt rather than mutated: a host is arbitrary text from a page,
        // so it never indexes into an object Vela owns.
        const levels = Object.fromEntries(
          Object.entries(options.settings.current.zoomLevels).filter(([key]) => key !== host),
        );
        options.settings.update({
          zoomLevels: level === 0 ? levels : { ...levels, [host]: level },
        });
      },
      isPrivate: options.isPrivate,
    });

    this.panels = new PanelManager({
      window: this.window,
      session: this.session,
      onOpenInTab: (url) => {
        this.manager.create({ url, active: true });
      },
      onContextMenu: (contents, params) => {
        this.showPageMenu(contents, params);
      },
      onFavicon: (id, pageUrl, iconUrl) => {
        // Same rule as tabs: the icon is cached locally and only ever handed
        // to the UI as a data URL.
        void options.favicons?.resolve(pageUrl, iconUrl, this.session).then((dataUrl) => {
          if (dataUrl === null) return;
          const panels = options.settings.current.webPanels;
          const existing = panels.find((panel) => panel.id === id);
          if (existing === undefined || existing.icon === dataUrl) return;
          options.settings.update({
            webPanels: panels.map((panel) =>
              panel.id === id ? { ...panel, icon: dataUrl } : panel,
            ),
          });
        });
      },
    });

    this.applyProxy();
    this.applyBlocking();
    this.lockDownChrome();
    this.watchWindowState();
    this.disposers.push(
      options.settings.onChange((next) => {
        this.send(EVENT_CHANNELS.settingsChanged, next);
      }),
    );
    this.load();
  }

  get id(): number {
    return this.window.id;
  }

  get blockedCount(): number {
    return this.blockedTotal;
  }

  get state(): BrowserState {
    return this.manager.state;
  }

  /**
   * The renderers that are Vela's own chrome, and so may speak over IPC. The
   * downloads bubble is one of them: it is the same UI, in its own view only
   * because the page paints above the window's web contents.
   */
  owns(sender: unknown): boolean {
    if (this.window.isDestroyed()) return false;
    return sender === this.window.webContents || this.downloadPopup.owns(sender);
  }

  send(channel: string, payload: unknown): void {
    if (this.window.isDestroyed() || this.window.webContents.isDestroyed()) return;
    this.window.webContents.send(channel, payload);
    this.downloadPopup.webContents?.send(channel, payload);
  }

  broadcastWindowState(): void {
    const state: WindowState = readWindowState(this.window);
    this.send(EVENT_CHANNELS.windowStateChanged, state);
  }

  /* ----------------------------------------------------------------- */

  /**
   * The context menu for web content, shared by tabs and docked panels — a
   * right-click means the same thing in both, because both are pages.
   *
   * `openerId` is the tab a link should open beside; a panel has none, so its
   * links land at the end of the strip.
   */
  private showPageMenu(contents: WebContents, params: ContextMenuParams, openerId?: string): void {
    popupPageMenu({
      window: this.window,
      contents,
      params,
      openInNewTab: (url) => {
        this.manager.create(
          openerId === undefined ? { url, active: true } : { url, active: true, openerId },
        );
      },
      searchEngineId: () => this.options.settings.current.searchEngineId,
      isDev: this.options.isDev,
    });
  }

  /**
   * Fills a saved login as the page arrives.
   *
   * Every condition here is a gate on injecting anything at all: the setting
   * has to be on, the vault has to be unlocked, and the vault has to already
   * hold a credential for this exact host. A site you have never saved a
   * password for fails the third check and receives no script — which is what
   * keeps "Vela's tabs carry no bridge" true for the web at large while still
   * getting you into the handful of sites you actually sign in to.
   */
  private autofillLogin(tab: Tab): void {
    const { vault, settings } = this.options;
    const mode = settings.current.loginAutofill;
    if (vault === null || mode === 'off' || !vault.unlocked) return;

    const contents = tab.webContents;
    if (contents === null) return;

    let host: string;
    try {
      host = new URL(tab.url).host;
    } catch {
      return;
    }
    if (host === '') return;

    const entry = vault.findForHost(host);
    if (entry === null) return;

    const password = vault.reveal(entry.id);
    // eslint-disable-next-line security/detect-possible-timing-attacks -- a null check on our own decrypt result, not a secret comparison
    if (password === null) return;

    void fillLogin(contents, {
      username: entry.username,
      password,
      // Never overwrite what someone is part-way through typing.
      force: false,
      submit: mode === 'submit',
      waitMs: FORM_WAIT_MS,
    });
  }

  /**
   * Watches a page for a login being typed, so Vela can offer to remember it.
   *
   * This is the injection that reaches sites Vela holds nothing for, which is
   * the price of ever learning a first password without the user copying it
   * into Settings by hand. It is gated on the vault being unlocked and on the
   * setting, and the script it injects reads nothing until a login is actually
   * submitted.
   */
  private watchForLoginToSave(tab: Tab): void {
    const { vault, settings } = this.options;
    if (vault === null || !settings.current.offerToSaveLogins || !vault.unlocked) return;

    const contents = tab.webContents;
    if (contents === null) return;

    let host: string;
    try {
      host = new URL(tab.url).host;
    } catch {
      return;
    }
    if (host === '') return;

    void watchForLogin(contents).then((captured) => {
      if (captured === null || !vault.unlocked) return;

      // Nothing to offer when this is exactly what is already stored.
      const existing = vault.findForHost(host);
      const sameEntry = existing !== null && existing.username === captured.username;
      if (sameEntry && vault.reveal(existing.id) === captured.password) return;

      const id = randomUUID();
      this.pendingCaptures.set(id, {
        host,
        username: captured.username,
        password: captured.password,
      });
      this.send(EVENT_CHANNELS.loginCaptured, {
        id,
        host,
        username: captured.username,
        replacing: sameEntry,
      });
    });
  }

  /** Stores or discards a captured login the user has now answered for. */
  resolveCapture(id: string, save: boolean): { ok: boolean; error: string | null } {
    const pending = this.pendingCaptures.get(id);
    this.pendingCaptures.delete(id);

    if (pending === undefined) return { ok: false, error: 'That prompt has already gone.' };
    if (!save) return { ok: true, error: null };

    const { vault } = this.options;
    if (vault?.unlocked !== true) return { ok: false, error: 'Sign in first.' };

    return vault.save(pending.host, pending.username, pending.password)
      ? { ok: true, error: null }
      : { ok: false, error: 'Could not save that login.' };
  }

  /**
   * Routes this session through whatever proxy the user configured. Vela runs
   * no servers of its own, so this is the honest version of a "built-in VPN":
   * you point it at one you already trust.
   */
  private applyProxy(): void {
    const { settings } = this.options;

    const sync = (): void => {
      const rules = settings.current.proxyRules.trim();
      const active = settings.current.proxyEnabled && rules !== '';
      void this.session.setProxy(active ? { proxyRules: rules } : { mode: 'direct' });
    };

    sync();
    this.disposers.push(settings.onChange(sync));
  }

  private applyBlocking(): void {
    const { blocker, settings } = this.options;
    if (blocker === null) return;

    const sync = (): void => {
      if (settings.current.blockAdsAndTrackers) blocker.enableFor(this.session);
      else blocker.disableFor(this.session);
    };

    sync();
    this.disposers.push(settings.onChange(sync));
    this.disposers.push(
      blocker.onBlocked((webContentsId) => {
        if (this.manager.countBlocked(webContentsId)) this.blockedTotal += 1;
      }),
    );
  }

  /**
   * The chrome renderer draws UI only: it never navigates and never opens
   * windows. Web content lives in the tab views.
   */
  private lockDownChrome(): void {
    const contents = this.window.webContents;

    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url);
      return { action: 'deny' };
    });

    contents.on('will-navigate', (event, url) => {
      if (url !== contents.getURL()) event.preventDefault();
    });
  }

  private watchWindowState(): void {
    const push = (): void => {
      this.broadcastWindowState();
    };

    this.window.on('maximize', push);
    this.window.on('unmaximize', push);
    this.window.on('minimize', push);
    this.window.on('restore', push);
    this.window.on('enter-full-screen', push);
    this.window.on('leave-full-screen', push);
    this.window.on('focus', push);
    this.window.on('blur', push);

    this.window.once('ready-to-show', () => {
      this.window.show();
    });

    this.window.on('closed', () => {
      this.dispose();
      this.options.onClosed(this);
    });
  }

  private load(): void {
    const { devServerUrl, rendererHtml } = this.options;

    if (devServerUrl !== undefined && devServerUrl !== '') {
      void this.window.loadURL(devServerUrl);
      this.window.webContents.openDevTools({ mode: 'detach' });
    } else {
      void this.window.loadFile(rendererHtml);
    }

    this.window.webContents.once('did-finish-load', () => {
      this.manager.create();
    });
  }

  /**
   * Tears the window down. For a private window this is also where its
   * session's data dies: it only ever existed in memory.
   */
  dispose(): void {
    for (const dispose of this.disposers) dispose();
    this.disposers.length = 0;
    this.manager.dispose();
    this.downloads.dispose();
    this.downloadPopup.dispose();
    this.panels.dispose();

    if (this.isPrivate) {
      void this.session.clearStorageData();
    }
  }
}
