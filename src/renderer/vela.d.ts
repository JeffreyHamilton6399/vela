import type { VelaBridge } from '../shared/types/ipc.js';

declare global {
  interface Window {
    /** Injected by the preload bridge. The renderer's only route to main. */
    readonly vela: VelaBridge;
  }
}

export {};
