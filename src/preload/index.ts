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
  windowStateSchema,
  type AppInfo,
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
};

contextBridge.exposeInMainWorld('vela', bridge);
