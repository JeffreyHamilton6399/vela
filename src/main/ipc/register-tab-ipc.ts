import { INVOKE_CHANNELS, SEND_CHANNELS, type BrowserState } from '../../shared/types/ipc.js';
import type { TabManager } from '../tabs/tab-manager.js';
import { handleInvoke, handleSend, type GuardOptions } from './contract-guard.js';

export interface TabIpcDeps extends GuardOptions {
  getManager: () => TabManager | null;
}

/** Runs `action` with the live manager, or does nothing if the window is gone. */
function withManager(deps: TabIpcDeps, action: (manager: TabManager) => void): void {
  const manager = deps.getManager();
  if (manager !== null) action(manager);
}

const EMPTY_STATE: BrowserState = { tabs: [], activeTabId: null };

export function registerTabIpc(deps: TabIpcDeps): void {
  handleInvoke(
    deps,
    INVOKE_CHANNELS.browserGetState,
    () => deps.getManager()?.state ?? EMPTY_STATE,
  );

  handleSend(deps, SEND_CHANNELS.tabsCreate, (payload) => {
    withManager(deps, (manager) => {
      manager.create({
        ...(payload.url === undefined ? {} : { url: payload.url }),
        ...(payload.active === undefined ? {} : { active: payload.active }),
      });
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsClose, ({ id }) => {
    withManager(deps, (manager) => {
      manager.close(id);
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsActivate, ({ id }) => {
    withManager(deps, (manager) => {
      manager.activate(id);
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsMove, ({ id, toIndex }) => {
    withManager(deps, (manager) => {
      manager.move(id, toIndex);
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsSetPinned, ({ id, pinned }) => {
    withManager(deps, (manager) => {
      manager.setPinned(id, pinned);
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsRestoreClosed, () => {
    withManager(deps, (manager) => {
      manager.restoreClosed();
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsNavigate, ({ id, input }) => {
    withManager(deps, (manager) => {
      manager.navigate(id, input);
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsGoBack, ({ id }) => {
    withManager(deps, (manager) => {
      manager.goBack(id);
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsGoForward, ({ id }) => {
    withManager(deps, (manager) => {
      manager.goForward(id);
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsReload, ({ id, ignoreCache }) => {
    withManager(deps, (manager) => {
      manager.reload(id, ignoreCache);
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsStop, ({ id }) => {
    withManager(deps, (manager) => {
      manager.stop(id);
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsShowNewTab, ({ id }) => {
    withManager(deps, (manager) => {
      manager.showNewTabPage(id);
    });
  });

  handleSend(deps, SEND_CHANNELS.layoutSetInsets, (insets) => {
    withManager(deps, (manager) => {
      manager.setInsets(insets);
    });
  });

  handleSend(deps, SEND_CHANNELS.layoutSetOverlay, ({ open }) => {
    withManager(deps, (manager) => {
      manager.setOverlayOpen(open);
    });
  });
}
