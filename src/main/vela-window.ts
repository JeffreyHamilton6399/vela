import { randomUUID } from 'node:crypto';
import { BrowserWindow, session as electronSession, shell, type Session } from 'electron';
import { EVENT_CHANNELS, type BrowserState, type WindowState } from '../shared/types/ipc.js';
import type { Platform } from '../shared/types/ipc.js';
import type { SettingsStore } from './settings/store.js';
import type { Workspace } from '../shared/settings.js';
import type { BlockerHandle } from './privacy/adblock.js';
import type { FaviconCache } from './favicons/favicon-cache.js';
import type { HistoryStore } from './history/history-store.js';
import { DownloadManager } from './downloads/download-manager.js';
import { PanelManager } from './panels/panel-manager.js';
import { hardenSession } from './privacy/session-hardening.js';
import { createWindowOptions } from './window-options.js';
import { readWindowState } from './ipc/register-window-ipc.js';
import { TabManager } from './tabs/tab-manager.js';

export interface VelaWindowOptions {
  platform: Platform;
  preloadPath: string;
  rendererHtml: string;
  devServerUrl: string | undefined;
  backgroundColor: string;
  userAgent: string;
  isDev: boolean;
  isPrivate: boolean;
  settings: SettingsStore;
  blocker: BlockerHandle | null;
  favicons: FaviconCache | null;
  history: HistoryStore | null;
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
  readonly panels: PanelManager;

  private blockedTotal = 0;
  private readonly disposers: (() => void)[] = [];

  constructor(private readonly options: VelaWindowOptions) {
    this.isPrivate = options.isPrivate;

    // A partition without the `persist:` prefix lives only in memory, so a
    // private window never touches the disk in the first place.
    this.session = options.isPrivate
      ? electronSession.fromPartition(`vela-private-${randomUUID()}`)
      : electronSession.defaultSession;

    hardenSession(this.session, {
      userAgent: options.userAgent,
      isDev: options.isDev,
      stripReferer: () => options.settings.current.stripCrossOriginReferer,
      onUnexpectedRequest: options.onUnexpectedRequest,
    });

    this.window = new BrowserWindow(
      createWindowOptions({
        platform: options.platform,
        preloadPath: options.preloadPath,
        backgroundColor: options.backgroundColor,
      }),
    );

    this.downloads = new DownloadManager(this.session, (items) => {
      this.send(EVENT_CHANNELS.downloadsChanged, items);
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
      // Read through Object.entries rather than by index: a host is arbitrary
      // text from a page and never indexes into an object Vela owns.
      getZoomForHost: (host) =>
        Object.entries(options.settings.current.zoomLevels).find(([key]) => key === host)?.[1] ?? 0,
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

  owns(sender: unknown): boolean {
    return !this.window.isDestroyed() && sender === this.window.webContents;
  }

  send(channel: string, payload: unknown): void {
    if (this.window.isDestroyed() || this.window.webContents.isDestroyed()) return;
    this.window.webContents.send(channel, payload);
  }

  broadcastWindowState(): void {
    const state: WindowState = readWindowState(this.window);
    this.send(EVENT_CHANNELS.windowStateChanged, state);
  }

  /* ----------------------------------------------------------------- */

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
    this.panels.dispose();

    if (this.isPrivate) {
      void this.session.clearStorageData();
    }
  }
}
