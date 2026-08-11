/**
 * The only thing that crosses the context boundary. `ipcRenderer` itself is
 * never exposed — the renderer sees exactly the methods below and nothing else.
 *
 * Runs in a sandboxed context, so this file must stay free of Node APIs.
 * Everything it needs is bundled in.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  EVENT_CHANNELS,
  INVOKE_CHANNELS,
  SEND_CHANNELS,
  appInfoSchema,
  browserStateSchema,
  windowStateSchema,
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
  layout: {
    setInsets(insets: ContentInsetsPayload): void {
      ipcRenderer.send(SEND_CHANNELS.layoutSetInsets, insets);
    },
    setOverlayOpen(open: boolean): void {
      ipcRenderer.send(SEND_CHANNELS.layoutSetOverlay, { open });
    },
  },
};

contextBridge.exposeInMainWorld('vela', bridge);
