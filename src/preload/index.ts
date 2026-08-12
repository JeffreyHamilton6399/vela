/**
 * The only thing that crosses the context boundary. `ipcRenderer` itself is
 * never exposed — the renderer sees exactly the methods below and nothing else.
 *
 * Runs in a sandboxed context, so this file must stay free of Node APIs.
 * Everything it needs is bundled in.
 */
import { z } from 'zod';
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { settingsSchema, type Settings, type SettingsPatch } from '../shared/settings.js';
import {
  EVENT_CHANNELS,
  INVOKE_CHANNELS,
  SEND_CHANNELS,
  appInfoSchema,
  browserStateSchema,
  privacyReportSchema,
  settingsImportResultSchema,
  updateStateSchema,
  downloadItemSchema,
  historyEntrySchema,
  assistantReplySchema,
  assistantStatusSchema,
  accountStateSchema,
  capturedLoginSchema,
  type CapturedLogin,
  actionResultSchema,
  localModelSchema,
  modelProgressSchema,
  vaultEntrySchema,
  windowStateSchema,
  type PrivacyReport,
  type SettingsImportResult,
  type SpeedDialAddPayload,
  type UpdateState,
  type DownloadItem,
  type HistoryEntry,
  type AssistantMessage,
  type AssistantReply,
  type AssistantStatus,
  type AccountState,
  type ActionResult,
  type LocalModelInfo,
  type ModelProgress,
  type VaultEntry,
  type AppInfo,
  type BrowserState,
  type ContentInsetsPayload,
  type TabCreatePayload,
  type VelaBridge,
  type WindowState,
} from '../shared/types/ipc.js';
import { resolvePlatform } from '../shared/platform.js';

const bridge: VelaBridge = {
  platform: resolvePlatform(process.platform),
  app: {
    async getInfo(): Promise<AppInfo> {
      return appInfoSchema.parse(await ipcRenderer.invoke(INVOKE_CHANNELS.appGetInfo));
    },
  },
  window: {
    async getState(): Promise<WindowState> {
      return windowStateSchema.parse(await ipcRenderer.invoke(INVOKE_CHANNELS.windowGetState));
    },
    minimize(): void {
      ipcRenderer.send(SEND_CHANNELS.windowMinimize);
    },
    toggleMaximize(): void {
      ipcRenderer.send(SEND_CHANNELS.windowToggleMaximize);
    },
    close(): void {
      ipcRenderer.send(SEND_CHANNELS.windowClose);
    },
    openPrivate(): void {
      ipcRenderer.send(SEND_CHANNELS.windowOpenPrivate);
    },
    onStateChanged(listener: (state: WindowState) => void): () => void {
      const wrapped = (_event: IpcRendererEvent, payload: unknown): void => {
        const parsed = windowStateSchema.safeParse(payload);
        if (parsed.success) {
          listener(parsed.data);
        }
      };
      ipcRenderer.on(EVENT_CHANNELS.windowStateChanged, wrapped);
      return () => {
        ipcRenderer.off(EVENT_CHANNELS.windowStateChanged, wrapped);
      };
    },
  },
  tabs: {
    async getState(): Promise<BrowserState> {
      return browserStateSchema.parse(await ipcRenderer.invoke(INVOKE_CHANNELS.browserGetState));
    },
    create(options: TabCreatePayload = {}): void {
      ipcRenderer.send(SEND_CHANNELS.tabsCreate, options);
    },
    close(id: string): void {
      ipcRenderer.send(SEND_CHANNELS.tabsClose, { id });
    },
    activate(id: string): void {
      ipcRenderer.send(SEND_CHANNELS.tabsActivate, { id });
    },
    move(id: string, toIndex: number): void {
      ipcRenderer.send(SEND_CHANNELS.tabsMove, { id, toIndex });
    },
    setPinned(id: string, pinned: boolean): void {
      ipcRenderer.send(SEND_CHANNELS.tabsSetPinned, { id, pinned });
    },
    restoreClosed(): void {
      ipcRenderer.send(SEND_CHANNELS.tabsRestoreClosed);
    },
    navigate(id: string, input: string): void {
      ipcRenderer.send(SEND_CHANNELS.tabsNavigate, { id, input });
    },
    goBack(id: string): void {
      ipcRenderer.send(SEND_CHANNELS.tabsGoBack, { id });
    },
    goForward(id: string): void {
      ipcRenderer.send(SEND_CHANNELS.tabsGoForward, { id });
    },
    reload(id: string, ignoreCache = false): void {
      ipcRenderer.send(SEND_CHANNELS.tabsReload, { id, ignoreCache });
    },
    stop(id: string): void {
      ipcRenderer.send(SEND_CHANNELS.tabsStop, { id });
    },
    showNewTabPage(id: string): void {
      ipcRenderer.send(SEND_CHANNELS.tabsShowNewTab, { id });
    },
    closeOthers(id: string): void {
      ipcRenderer.send(SEND_CHANNELS.tabsCloseOthers, { id });
    },
    duplicate(id: string): void {
      ipcRenderer.send(SEND_CHANNELS.tabsDuplicate, { id });
    },
    openContextMenu(id: string): void {
      ipcRenderer.send(SEND_CHANNELS.menuTab, { id });
    },
    continueInsecure(id: string): void {
      ipcRenderer.send(SEND_CHANNELS.tabsContinueInsecure, { id });
    },
    dismissRejection(id: string): void {
      ipcRenderer.send(SEND_CHANNELS.tabsDismissRejection, { id });
    },
    openExternally(id: string): void {
      ipcRenderer.send(SEND_CHANNELS.tabsOpenExternally, { id });
    },
    onStateChanged(listener: (state: BrowserState) => void): () => void {
      const wrapped = (_event: IpcRendererEvent, payload: unknown): void => {
        const parsed = browserStateSchema.safeParse(payload);
        if (parsed.success) {
          listener(parsed.data);
        }
      };
      ipcRenderer.on(EVENT_CHANNELS.browserStateChanged, wrapped);
      return () => {
        ipcRenderer.off(EVENT_CHANNELS.browserStateChanged, wrapped);
      };
    },
  },
  settings: {
    async get(): Promise<Settings> {
      return settingsSchema.parse(await ipcRenderer.invoke(INVOKE_CHANNELS.settingsGet));
    },
    set(patch: SettingsPatch): void {
      ipcRenderer.send(SEND_CHANNELS.settingsSet, patch);
    },
    async export(): Promise<string> {
      return z.string().parse(await ipcRenderer.invoke(INVOKE_CHANNELS.settingsExport));
    },
    async import(json: string): Promise<SettingsImportResult> {
      return settingsImportResultSchema.parse(
        await ipcRenderer.invoke(INVOKE_CHANNELS.settingsImport, { json }),
      );
    },
    onChanged(listener: (settings: Settings) => void): () => void {
      const wrapped = (_event: IpcRendererEvent, payload: unknown): void => {
        const parsed = settingsSchema.safeParse(payload);
        if (parsed.success) listener(parsed.data);
      };
      ipcRenderer.on(EVENT_CHANNELS.settingsChanged, wrapped);
      return () => {
        ipcRenderer.off(EVENT_CHANNELS.settingsChanged, wrapped);
      };
    },
  },
  privacy: {
    async getReport(): Promise<PrivacyReport> {
      return privacyReportSchema.parse(await ipcRenderer.invoke(INVOKE_CHANNELS.privacyGetReport));
    },
    async clearData(): Promise<boolean> {
      return z.boolean().parse(await ipcRenderer.invoke(INVOKE_CHANNELS.privacyClearData));
    },
  },
  workspaces: {
    create(name: string): void {
      ipcRenderer.send(SEND_CHANNELS.workspacesCreate, { name });
    },
    rename(id: string, name: string): void {
      ipcRenderer.send(SEND_CHANNELS.workspacesRename, { id, name });
    },
    remove(id: string): void {
      ipcRenderer.send(SEND_CHANNELS.workspacesDelete, { id });
    },
    activate(id: string): void {
      ipcRenderer.send(SEND_CHANNELS.workspacesActivate, { id });
    },
    moveTab(id: string, workspaceId: string): void {
      ipcRenderer.send(SEND_CHANNELS.tabsSetWorkspace, { id, workspaceId });
    },
  },
  downloads: {
    async list(): Promise<DownloadItem[]> {
      return z
        .array(downloadItemSchema)
        .parse(await ipcRenderer.invoke(INVOKE_CHANNELS.downloadsGet));
    },
    open(id: string): void {
      ipcRenderer.send(SEND_CHANNELS.downloadsOpen, { id });
    },
    showInFolder(id: string): void {
      ipcRenderer.send(SEND_CHANNELS.downloadsShow, { id });
    },
    cancel(id: string): void {
      ipcRenderer.send(SEND_CHANNELS.downloadsCancel, { id });
    },
    clear(): void {
      ipcRenderer.send(SEND_CHANNELS.downloadsClear);
    },
    togglePopup(): void {
      ipcRenderer.send(SEND_CHANNELS.downloadsPopupToggle);
    },
    closePopup(): void {
      ipcRenderer.send(SEND_CHANNELS.downloadsPopupClose);
    },
    reportPopupHeight(height: number): void {
      ipcRenderer.send(SEND_CHANNELS.downloadsPopupHeight, { height });
    },
    onChanged(listener: (items: DownloadItem[]) => void): () => void {
      const wrapped = (_event: IpcRendererEvent, payload: unknown): void => {
        const parsed = z.array(downloadItemSchema).safeParse(payload);
        if (parsed.success) listener(parsed.data);
      };
      ipcRenderer.on(EVENT_CHANNELS.downloadsChanged, wrapped);
      return () => {
        ipcRenderer.off(EVENT_CHANNELS.downloadsChanged, wrapped);
      };
    },
  },
  account: {
    async state(): Promise<AccountState> {
      return accountStateSchema.parse(await ipcRenderer.invoke(INVOKE_CHANNELS.accountState));
    },
    async create(email: string, masterPassword: string): Promise<ActionResult> {
      return actionResultSchema.parse(
        await ipcRenderer.invoke(INVOKE_CHANNELS.accountCreate, { email, masterPassword }),
      );
    },
    async unlock(masterPassword: string): Promise<ActionResult> {
      return actionResultSchema.parse(
        await ipcRenderer.invoke(INVOKE_CHANNELS.accountUnlock, { masterPassword }),
      );
    },
    async lock(): Promise<boolean> {
      return z.boolean().parse(await ipcRenderer.invoke(INVOKE_CHANNELS.accountLock));
    },
    async list(): Promise<VaultEntry[]> {
      return z.array(vaultEntrySchema).parse(await ipcRenderer.invoke(INVOKE_CHANNELS.vaultList));
    },
    async save(host: string, username: string, password: string): Promise<ActionResult> {
      return actionResultSchema.parse(
        await ipcRenderer.invoke(INVOKE_CHANNELS.vaultSave, { host, username, password }),
      );
    },
    async remove(id: string): Promise<boolean> {
      return z.boolean().parse(await ipcRenderer.invoke(INVOKE_CHANNELS.vaultRemove, { id }));
    },
    async fill(tabId: string): Promise<{ ok: boolean; error: string | null; filled: number }> {
      return z
        .object({ ok: z.boolean(), error: z.string().nullable(), filled: z.number() })
        .parse(await ipcRenderer.invoke(INVOKE_CHANNELS.vaultFill, { tabId }));
    },
    async resolveCapture(id: string, save: boolean): Promise<ActionResult> {
      return actionResultSchema.parse(
        await ipcRenderer.invoke(INVOKE_CHANNELS.vaultResolveCapture, { id, save }),
      );
    },
    onCaptured(listener: (captured: CapturedLogin) => void): () => void {
      const wrapped = (_event: IpcRendererEvent, payload: unknown): void => {
        const parsed = capturedLoginSchema.safeParse(payload);
        if (parsed.success) listener(parsed.data);
      };
      ipcRenderer.on(EVENT_CHANNELS.loginCaptured, wrapped);
      return () => {
        ipcRenderer.off(EVENT_CHANNELS.loginCaptured, wrapped);
      };
    },
  },
  assistant: {
    async status(): Promise<AssistantStatus> {
      return assistantStatusSchema.parse(await ipcRenderer.invoke(INVOKE_CHANNELS.assistantStatus));
    },
    async install(): Promise<{ opened: boolean; command: string }> {
      return z
        .object({ opened: z.boolean(), command: z.string() })
        .parse(await ipcRenderer.invoke(INVOKE_CHANNELS.assistantInstall));
    },
    async models(): Promise<LocalModelInfo[]> {
      return z
        .array(localModelSchema)
        .parse(await ipcRenderer.invoke(INVOKE_CHANNELS.assistantModels));
    },
    async getModel(id: string): Promise<ActionResult> {
      return actionResultSchema.parse(
        await ipcRenderer.invoke(INVOKE_CHANNELS.assistantModelGet, { id }),
      );
    },
    onModelProgress(listener: (progress: ModelProgress) => void): () => void {
      const wrapped = (_event: IpcRendererEvent, payload: unknown): void => {
        const parsed = modelProgressSchema.safeParse(payload);
        if (parsed.success) listener(parsed.data);
      };
      ipcRenderer.on(EVENT_CHANNELS.assistantModelProgress, wrapped);
      return () => {
        ipcRenderer.off(EVENT_CHANNELS.assistantModelProgress, wrapped);
      };
    },
    async pull(model: string): Promise<{ ok: boolean; error: string | null }> {
      return z
        .object({ ok: z.boolean(), error: z.string().nullable() })
        .parse(await ipcRenderer.invoke(INVOKE_CHANNELS.assistantPull, { model }));
    },
    async ask(messages: readonly AssistantMessage[]): Promise<AssistantReply> {
      return assistantReplySchema.parse(
        await ipcRenderer.invoke(INVOKE_CHANNELS.assistantAsk, { messages }),
      );
    },
  },
  history: {
    async search(query: string, limit = 20): Promise<HistoryEntry[]> {
      return z
        .array(historyEntrySchema)
        .parse(await ipcRenderer.invoke(INVOKE_CHANNELS.historySearch, { query, limit }));
    },
    async clear(): Promise<boolean> {
      return z.boolean().parse(await ipcRenderer.invoke(INVOKE_CHANNELS.historyClear));
    },
  },
  bookmarks: {
    add(url: string, title: string): void {
      ipcRenderer.send(SEND_CHANNELS.bookmarksAdd, { url, title });
    },
    remove(id: string): void {
      ipcRenderer.send(SEND_CHANNELS.bookmarksRemove, { id });
    },
    move(id: string, toIndex: number): void {
      ipcRenderer.send(SEND_CHANNELS.bookmarksMove, { id, toIndex });
    },
  },
  zoom: {
    set(id: string, direction: 'in' | 'out' | 'reset'): void {
      ipcRenderer.send(SEND_CHANNELS.zoomSet, { id, direction });
    },
  },
  updates: {
    async getState(): Promise<UpdateState> {
      return updateStateSchema.parse(await ipcRenderer.invoke(INVOKE_CHANNELS.updatesGetState));
    },
    check(): void {
      ipcRenderer.send(SEND_CHANNELS.updatesCheck);
    },
    download(): void {
      ipcRenderer.send(SEND_CHANNELS.updatesDownload);
    },
    install(): void {
      ipcRenderer.send(SEND_CHANNELS.updatesInstall);
    },
    onChanged(listener: (state: UpdateState) => void): () => void {
      const wrapped = (_event: IpcRendererEvent, payload: unknown): void => {
        const parsed = updateStateSchema.safeParse(payload);
        if (parsed.success) listener(parsed.data);
      };
      ipcRenderer.on(EVENT_CHANNELS.updateStateChanged, wrapped);
      return () => {
        ipcRenderer.off(EVENT_CHANNELS.updateStateChanged, wrapped);
      };
    },
  },
  tools: {
    setNotes(text: string): void {
      ipcRenderer.send(SEND_CHANNELS.toolsSetNotes, { text });
    },
  },
  panels: {
    open(id: string): void {
      ipcRenderer.send(SEND_CHANNELS.panelsOpen, { id });
    },
    close(): void {
      ipcRenderer.send(SEND_CHANNELS.panelsClose);
    },
    add(url: string, title: string): void {
      ipcRenderer.send(SEND_CHANNELS.panelsAdd, { url, title });
    },
    remove(id: string): void {
      ipcRenderer.send(SEND_CHANNELS.panelsRemove, { id });
    },
    setBounds(bounds: { x: number; y: number; width: number; height: number } | null): void {
      ipcRenderer.send(SEND_CHANNELS.panelsBounds, bounds);
    },
  },
  speedDial: {
    add(entry: SpeedDialAddPayload): void {
      ipcRenderer.send(SEND_CHANNELS.speedDialAdd, entry);
    },
    remove(id: string): void {
      ipcRenderer.send(SEND_CHANNELS.speedDialRemove, { id });
    },
    move(id: string, toIndex: number): void {
      ipcRenderer.send(SEND_CHANNELS.speedDialMove, { id, toIndex });
    },
  },
  layout: {
    setInsets(insets: ContentInsetsPayload): void {
      ipcRenderer.send(SEND_CHANNELS.layoutSetInsets, insets);
    },
    async openOverlay(open: boolean): Promise<string | null> {
      const reply: unknown = await ipcRenderer.invoke(INVOKE_CHANNELS.layoutOpenOverlay, { open });
      return z.object({ snapshot: z.string().nullable() }).parse(reply).snapshot;
    },
    setOverlayOpen(open: boolean): void {
      ipcRenderer.send(SEND_CHANNELS.layoutSetOverlay, { open });
    },
  },
};

contextBridge.exposeInMainWorld('vela', bridge);
