/**
 * The single source of truth for main <-> renderer traffic.
 *
 * Both sides import this file. Every channel is named here, every payload has a
 * zod schema here, and the main process validates against these schemas at its
 * boundary. If a channel is not in this file it does not exist.
 */
import { z } from 'zod';
import {
  settingsPatchSchema,
  settingsSchema,
  type Settings,
  type SettingsPatch,
} from '../settings.js';

/**
 * What Vela knows about itself, for the settings panel to show plainly.
 * The honest answer to "what is collected" is "nothing", and these numbers
 * are what make that checkable rather than merely claimed.
 */
export const privacyReportSchema = z.object({
  adblockEnabled: z.boolean(),
  /** Where the local settings file lives — the only thing Vela writes. */
  settingsPath: z.string(),
  /** Blocked requests across every tab in this window since it opened. */
  blockedThisWindow: z.number().int().nonnegative(),
  privateSession: z.boolean(),
  /** The one address Vela contacts on its own behalf. */
  updateFeedUrl: z.string(),
  userAgent: z.string(),
});
export type PrivacyReport = z.infer<typeof privacyReportSchema>;

export const updateStateSchema = z.object({
  status: z.enum(['idle', 'checking', 'current', 'available', 'downloading', 'ready', 'error']),
  version: z.string().nullable(),
  message: z.string().nullable(),
});
export type UpdateState = z.infer<typeof updateStateSchema>;

export const assistantMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(20_000),
});
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;

export const assistantReplySchema = z.object({
  ok: z.boolean(),
  text: z.string(),
  error: z.string().nullable(),
});
export type AssistantReply = z.infer<typeof assistantReplySchema>;

export const settingsImportResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
});
export type SettingsImportResult = z.infer<typeof settingsImportResultSchema>;

/* ------------------------------------------------------------------ */
/* Payload schemas                                                     */
/* ------------------------------------------------------------------ */

export const platformSchema = z.enum(['darwin', 'win32', 'linux']);
export type Platform = z.infer<typeof platformSchema>;

export const windowStateSchema = z.object({
  maximized: z.boolean(),
  minimized: z.boolean(),
  fullScreen: z.boolean(),
  focused: z.boolean(),
});
export type WindowState = z.infer<typeof windowStateSchema>;

export const appInfoSchema = z.object({
  name: z.literal('Vela'),
  version: z.string().min(1),
  electronVersion: z.string().min(1),
  chromeVersion: z.string().min(1),
  platform: platformSchema,
  isDev: z.boolean(),
});
export type AppInfo = z.infer<typeof appInfoSchema>;

/** Payload-less channels use this so the contract stays uniform. */
export const emptySchema = z.undefined();

/** Vela's own pages, drawn by the chrome renderer rather than loaded as web content. */
export const internalPageSchema = z.enum(['newtab']);
export type InternalPage = z.infer<typeof internalPageSchema>;

const tabIdString = z.string().min(1).max(64);
/** Long enough for any real URL, short enough to bound what crosses the boundary. */
const addressString = z.string().max(4096);

export const downloadItemSchema = z.object({
  id: z.string().min(1).max(64),
  filename: z.string().max(500),
  url: z.string().max(4096),
  state: z.enum(['progressing', 'paused', 'completed', 'cancelled', 'interrupted']),
  receivedBytes: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  savePath: z.string().max(4096),
  startedAt: z.number().int().nonnegative(),
});
export type DownloadItem = z.infer<typeof downloadItemSchema>;

export const historyEntrySchema = z.object({
  url: z.string().max(4096),
  title: z.string().max(500),
  visitedAt: z.number().int().nonnegative(),
  visits: z.number().int().positive(),
});
export type HistoryEntry = z.infer<typeof historyEntrySchema>;

export const workspaceSummarySchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(60),
  tabCount: z.number().int().nonnegative(),
});
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;

export const tabSnapshotSchema = z.object({
  id: tabIdString,
  url: z.string(),
  title: z.string(),
  faviconUrl: z.string().nullable(),
  loading: z.boolean(),
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  pinned: z.boolean(),
  internal: internalPageSchema.nullable(),
  /** A suspended tab has given its renderer process back. */
  suspended: z.boolean(),
  /** 100 unless the user has zoomed this host. */
  zoomPercent: z.number().int().positive(),
  workspaceId: z.string().min(1).max(64),
  /** Set when an https upgrade failed and Vela is warning before plain http. */
  interstitialUrl: z.string().nullable(),
  blockedCount: z.number().int().nonnegative(),
});
export type TabSnapshot = z.infer<typeof tabSnapshotSchema>;

export const browserStateSchema = z.object({
  tabs: z.array(tabSnapshotSchema),
  activeTabId: tabIdString.nullable(),
  /** True in a private window, whose session is memory-only. */
  privateSession: z.boolean(),
  activeWorkspaceId: z.string().min(1).max(64),
  workspaces: z.array(workspaceSummarySchema),
});
export type BrowserState = z.infer<typeof browserStateSchema>;

const nonNegative = z.number().nonnegative();
export const contentInsetsSchema = z.object({
  top: nonNegative,
  right: nonNegative,
  bottom: nonNegative,
  left: nonNegative,
});
export type ContentInsetsPayload = z.infer<typeof contentInsetsSchema>;

export const tabRefSchema = z.object({ id: tabIdString });
export const speedDialAddSchema = z.object({
  url: addressString,
  title: z.string().max(120).optional(),
});
export type SpeedDialAddPayload = z.infer<typeof speedDialAddSchema>;
export const tabCreateSchema = z.object({
  url: addressString.optional(),
  active: z.boolean().optional(),
});
export type TabCreatePayload = z.infer<typeof tabCreateSchema>;
export const tabNavigateSchema = z.object({ id: tabIdString, input: addressString });
export const tabReloadSchema = z.object({ id: tabIdString, ignoreCache: z.boolean() });
export const tabMoveSchema = z.object({ id: tabIdString, toIndex: z.number().int().min(0) });
export const tabPinSchema = z.object({ id: tabIdString, pinned: z.boolean() });

/* ------------------------------------------------------------------ */
/* Channels                                                            */
/* ------------------------------------------------------------------ */

/** Renderer -> main, request/response. */
export const INVOKE_CHANNELS = {
  appGetInfo: 'app:get-info',
  windowGetState: 'window:get-state',
  browserGetState: 'browser:get-state',
  settingsGet: 'settings:get',
  settingsExport: 'settings:export',
  settingsImport: 'settings:import',
  updatesGetState: 'updates:get-state',
  downloadsGet: 'downloads:get',
  historySearch: 'history:search',
  historyClear: 'history:clear',
  assistantAsk: 'assistant:ask',
  privacyGetReport: 'privacy:get-report',
  privacyClearData: 'privacy:clear-data',
} as const;

/** Renderer -> main, fire and forget. */
export const SEND_CHANNELS = {
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowOpenPrivate: 'window:open-private',
  settingsSet: 'settings:set',
  tabsContinueInsecure: 'tabs:continue-insecure',
  tabsCreate: 'tabs:create',
  tabsClose: 'tabs:close',
  tabsActivate: 'tabs:activate',
  tabsMove: 'tabs:move',
  tabsSetPinned: 'tabs:set-pinned',
  tabsRestoreClosed: 'tabs:restore-closed',
  tabsNavigate: 'tabs:navigate',
  tabsGoBack: 'tabs:go-back',
  tabsGoForward: 'tabs:go-forward',
  tabsReload: 'tabs:reload',
  tabsStop: 'tabs:stop',
  tabsShowNewTab: 'tabs:show-newtab',
  tabsCloseOthers: 'tabs:close-others',
  tabsDuplicate: 'tabs:duplicate',
  menuTab: 'menu:tab',
  workspacesCreate: 'workspaces:create',
  workspacesRename: 'workspaces:rename',
  workspacesDelete: 'workspaces:delete',
  workspacesActivate: 'workspaces:activate',
  tabsSetWorkspace: 'tabs:set-workspace',
  downloadsOpen: 'downloads:open',
  downloadsShow: 'downloads:show',
  downloadsCancel: 'downloads:cancel',
  downloadsClear: 'downloads:clear',
  bookmarksAdd: 'bookmarks:add',
  bookmarksRemove: 'bookmarks:remove',
  bookmarksMove: 'bookmarks:move',
  zoomSet: 'zoom:set',
  updatesCheck: 'updates:check',
  updatesDownload: 'updates:download',
  updatesInstall: 'updates:install',
  toolsSetNotes: 'tools:set-notes',
  speedDialAdd: 'speeddial:add',
  speedDialRemove: 'speeddial:remove',
  speedDialMove: 'speeddial:move',
  layoutSetInsets: 'layout:set-insets',
  layoutSetOverlay: 'layout:set-overlay',
} as const;

/** Main -> renderer, push. */
export const EVENT_CHANNELS = {
  windowStateChanged: 'window:state-changed',
  browserStateChanged: 'browser:state-changed',
  settingsChanged: 'settings:changed',
  updateStateChanged: 'updates:state-changed',
  downloadsChanged: 'downloads:changed',
} as const;

export type InvokeChannel = (typeof INVOKE_CHANNELS)[keyof typeof INVOKE_CHANNELS];
export type SendChannel = (typeof SEND_CHANNELS)[keyof typeof SEND_CHANNELS];
export type EventChannel = (typeof EVENT_CHANNELS)[keyof typeof EVENT_CHANNELS];

/* ------------------------------------------------------------------ */
/* Channel -> schema maps                                              */
/* ------------------------------------------------------------------ */

export const invokeContract = {
  [INVOKE_CHANNELS.appGetInfo]: { request: emptySchema, response: appInfoSchema },
  [INVOKE_CHANNELS.windowGetState]: { request: emptySchema, response: windowStateSchema },
  [INVOKE_CHANNELS.browserGetState]: { request: emptySchema, response: browserStateSchema },
  [INVOKE_CHANNELS.settingsGet]: { request: emptySchema, response: settingsSchema },
  [INVOKE_CHANNELS.settingsExport]: { request: emptySchema, response: z.string() },
  [INVOKE_CHANNELS.settingsImport]: {
    request: z.object({ json: z.string().max(2_000_000) }),
    response: settingsImportResultSchema,
  },
  [INVOKE_CHANNELS.downloadsGet]: { request: emptySchema, response: z.array(downloadItemSchema) },
  [INVOKE_CHANNELS.historySearch]: {
    request: z.object({ query: z.string().max(200), limit: z.number().int().min(1).max(200) }),
    response: z.array(historyEntrySchema),
  },
  [INVOKE_CHANNELS.historyClear]: { request: emptySchema, response: z.boolean() },
  [INVOKE_CHANNELS.assistantAsk]: {
    request: z.object({ messages: z.array(assistantMessageSchema).max(40) }),
    response: assistantReplySchema,
  },
  [INVOKE_CHANNELS.updatesGetState]: { request: emptySchema, response: updateStateSchema },
  [INVOKE_CHANNELS.privacyGetReport]: { request: emptySchema, response: privacyReportSchema },
  [INVOKE_CHANNELS.privacyClearData]: { request: emptySchema, response: z.boolean() },
} as const satisfies Record<InvokeChannel, { request: z.ZodType; response: z.ZodType }>;

export const sendContract = {
  [SEND_CHANNELS.windowMinimize]: emptySchema,
  [SEND_CHANNELS.windowToggleMaximize]: emptySchema,
  [SEND_CHANNELS.windowClose]: emptySchema,
  [SEND_CHANNELS.windowOpenPrivate]: emptySchema,
  [SEND_CHANNELS.settingsSet]: settingsPatchSchema,
  [SEND_CHANNELS.tabsContinueInsecure]: tabRefSchema,
  [SEND_CHANNELS.tabsCreate]: tabCreateSchema,
  [SEND_CHANNELS.tabsClose]: tabRefSchema,
  [SEND_CHANNELS.tabsActivate]: tabRefSchema,
  [SEND_CHANNELS.tabsMove]: tabMoveSchema,
  [SEND_CHANNELS.tabsSetPinned]: tabPinSchema,
  [SEND_CHANNELS.tabsRestoreClosed]: emptySchema,
  [SEND_CHANNELS.tabsNavigate]: tabNavigateSchema,
  [SEND_CHANNELS.tabsGoBack]: tabRefSchema,
  [SEND_CHANNELS.tabsGoForward]: tabRefSchema,
  [SEND_CHANNELS.tabsReload]: tabReloadSchema,
  [SEND_CHANNELS.tabsStop]: tabRefSchema,
  [SEND_CHANNELS.tabsShowNewTab]: tabRefSchema,
  [SEND_CHANNELS.tabsCloseOthers]: tabRefSchema,
  [SEND_CHANNELS.tabsDuplicate]: tabRefSchema,
  [SEND_CHANNELS.menuTab]: tabRefSchema,
  [SEND_CHANNELS.workspacesCreate]: z.object({ name: z.string().min(1).max(60) }),
  [SEND_CHANNELS.workspacesRename]: z.object({ id: tabIdString, name: z.string().min(1).max(60) }),
  [SEND_CHANNELS.workspacesDelete]: z.object({ id: tabIdString }),
  [SEND_CHANNELS.workspacesActivate]: z.object({ id: tabIdString }),
  [SEND_CHANNELS.tabsSetWorkspace]: z.object({ id: tabIdString, workspaceId: tabIdString }),
  [SEND_CHANNELS.downloadsOpen]: z.object({ id: tabIdString }),
  [SEND_CHANNELS.downloadsShow]: z.object({ id: tabIdString }),
  [SEND_CHANNELS.downloadsCancel]: z.object({ id: tabIdString }),
  [SEND_CHANNELS.downloadsClear]: emptySchema,
  [SEND_CHANNELS.bookmarksAdd]: z.object({ url: addressString, title: z.string().max(200) }),
  [SEND_CHANNELS.bookmarksRemove]: z.object({ id: tabIdString }),
  [SEND_CHANNELS.bookmarksMove]: z.object({ id: tabIdString, toIndex: z.number().int().min(0) }),
  [SEND_CHANNELS.zoomSet]: z.object({ id: tabIdString, direction: z.enum(['in', 'out', 'reset']) }),
  [SEND_CHANNELS.updatesCheck]: emptySchema,
  [SEND_CHANNELS.updatesDownload]: emptySchema,
  [SEND_CHANNELS.updatesInstall]: emptySchema,
  [SEND_CHANNELS.toolsSetNotes]: z.object({ text: z.string().max(500_000) }),
  [SEND_CHANNELS.speedDialAdd]: speedDialAddSchema,
  [SEND_CHANNELS.speedDialRemove]: z.object({ id: tabIdString }),
  [SEND_CHANNELS.speedDialMove]: z.object({ id: tabIdString, toIndex: z.number().int().min(0) }),
  [SEND_CHANNELS.layoutSetInsets]: contentInsetsSchema,
  [SEND_CHANNELS.layoutSetOverlay]: z.object({ open: z.boolean() }),
} as const satisfies Record<SendChannel, z.ZodType>;

export const eventContract = {
  [EVENT_CHANNELS.windowStateChanged]: windowStateSchema,
  [EVENT_CHANNELS.browserStateChanged]: browserStateSchema,
  [EVENT_CHANNELS.settingsChanged]: settingsSchema,
  [EVENT_CHANNELS.updateStateChanged]: updateStateSchema,
  [EVENT_CHANNELS.downloadsChanged]: z.array(downloadItemSchema),
} as const satisfies Record<EventChannel, z.ZodType>;

export type InvokeRequest<C extends InvokeChannel> = z.infer<(typeof invokeContract)[C]['request']>;
export type InvokeResponse<C extends InvokeChannel> = z.infer<
  (typeof invokeContract)[C]['response']
>;
export type SendPayload<C extends SendChannel> = z.infer<(typeof sendContract)[C]>;
export type EventPayload<C extends EventChannel> = z.infer<(typeof eventContract)[C]>;

/** Every channel string Vela will ever put on the wire. */
export const ALL_CHANNELS: readonly string[] = [
  ...Object.values(INVOKE_CHANNELS),
  ...Object.values(SEND_CHANNELS),
  ...Object.values(EVENT_CHANNELS),
];

/* ------------------------------------------------------------------ */
/* The bridge surface exposed on window.vela                           */
/* ------------------------------------------------------------------ */

export type { Settings, SettingsPatch } from '../settings.js';

export interface VelaBridge {
  /**
   * Available synchronously so the titlebar can draw the correct window
   * controls on first paint instead of after an IPC round trip.
   */
  readonly platform: Platform;
  readonly app: {
    getInfo(): Promise<AppInfo>;
  };
  readonly window: {
    getState(): Promise<WindowState>;
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    /** Opens a window on a memory-only session that is destroyed on close. */
    openPrivate(): void;
    /** Returns an unsubscribe function. */
    onStateChanged(listener: (state: WindowState) => void): () => void;
  };
  readonly settings: {
    get(): Promise<Settings>;
    set(patch: SettingsPatch): void;
    export(): Promise<string>;
    import(json: string): Promise<SettingsImportResult>;
    onChanged(listener: (settings: Settings) => void): () => void;
  };
  readonly privacy: {
    getReport(): Promise<PrivacyReport>;
    /** Wipes cookies, cache, and storage for this window's session. */
    clearData(): Promise<boolean>;
  };
  readonly tabs: {
    getState(): Promise<BrowserState>;
    create(options?: TabCreatePayload): void;
    close(id: string): void;
    activate(id: string): void;
    move(id: string, toIndex: number): void;
    setPinned(id: string, pinned: boolean): void;
    restoreClosed(): void;
    navigate(id: string, input: string): void;
    goBack(id: string): void;
    goForward(id: string): void;
    reload(id: string, ignoreCache?: boolean): void;
    stop(id: string): void;
    showNewTabPage(id: string): void;
    closeOthers(id: string): void;
    duplicate(id: string): void;
    /** Opens the native tab context menu at the cursor. */
    openContextMenu(id: string): void;
    /** Accepts the plain-http interstitial for this tab's host. */
    continueInsecure(id: string): void;
    onStateChanged(listener: (state: BrowserState) => void): () => void;
  };
  readonly workspaces: {
    create(name: string): void;
    rename(id: string, name: string): void;
    remove(id: string): void;
    activate(id: string): void;
    /** Moves a tab into another workspace, suspending it on the way out. */
    moveTab(id: string, workspaceId: string): void;
  };
  readonly downloads: {
    list(): Promise<DownloadItem[]>;
    open(id: string): void;
    showInFolder(id: string): void;
    cancel(id: string): void;
    clear(): void;
    onChanged(listener: (items: DownloadItem[]) => void): () => void;
  };
  readonly assistant: {
    /** Uses the key in the local settings file; there is no shipped key. */
    ask(messages: readonly AssistantMessage[]): Promise<AssistantReply>;
  };
  readonly history: {
    search(query: string, limit?: number): Promise<HistoryEntry[]>;
    clear(): Promise<boolean>;
  };
  readonly bookmarks: {
    add(url: string, title: string): void;
    remove(id: string): void;
    move(id: string, toIndex: number): void;
  };
  readonly zoom: {
    set(id: string, direction: 'in' | 'out' | 'reset'): void;
  };
  readonly updates: {
    getState(): Promise<UpdateState>;
    check(): void;
    /** Downloads only when the user asks; nothing is fetched automatically. */
    download(): void;
    install(): void;
    onChanged(listener: (state: UpdateState) => void): () => void;
  };
  readonly tools: {
    /** Sidebar notes. Local file, never synced anywhere. */
    setNotes(text: string): void;
  };
  readonly speedDial: {
    add(entry: SpeedDialAddPayload): void;
    remove(id: string): void;
    move(id: string, toIndex: number): void;
  };
  readonly layout: {
    /** Tells main where the page view goes, as insets from the window edges. */
    setInsets(insets: ContentInsetsPayload): void;
    /** Hides the page while a chrome overlay owns the content region. */
    setOverlayOpen(open: boolean): void;
  };
}
