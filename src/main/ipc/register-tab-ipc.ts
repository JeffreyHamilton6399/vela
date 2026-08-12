import { INVOKE_CHANNELS, SEND_CHANNELS, type BrowserState } from '../../shared/types/ipc.js';
import type { TabManager } from '../tabs/tab-manager.js';
import type { PanelManager } from '../panels/panel-manager.js';
import { handleInvoke, handleSend, type GuardOptions } from './contract-guard.js';

export interface TabIpcDeps extends GuardOptions {
  getPanels: (sender: unknown) => PanelManager | null;
  /** The saved panel list, so open() knows which URL to load. */
  findPanel: (id: string) => { id: string; url: string } | null;
  addPanel: (url: string, title: string) => void;
  removePanel: (id: string) => void;
  getManager: (sender: unknown) => TabManager | null;
  /** Pops the native tab context menu at the cursor. */
  popupTabMenu: (manager: TabManager, id: string, sender: unknown) => void;
}

/** Runs `action` with the live manager, or does nothing if the window is gone. */
function withManager(
  deps: TabIpcDeps,
  sender: unknown,
  action: (manager: TabManager) => void,
): void {
  const manager = deps.getManager(sender);
  if (manager !== null) action(manager);
}

const EMPTY_STATE: BrowserState = {
  tabs: [],
  activeTabId: null,
  privateSession: false,
  activeWorkspaceId: 'default',
  workspaces: [],
};

export function registerTabIpc(deps: TabIpcDeps): void {
  handleInvoke(
    deps,
    INVOKE_CHANNELS.browserGetState,
    (_payload, sender) => deps.getManager(sender)?.state ?? EMPTY_STATE,
  );

  handleSend(deps, SEND_CHANNELS.tabsCreate, (payload, sender) => {
    withManager(deps, sender, (manager) => {
      manager.create({
        ...(payload.url === undefined ? {} : { url: payload.url }),
        ...(payload.active === undefined ? {} : { active: payload.active }),
      });
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsClose, ({ id }, sender) => {
    withManager(deps, sender, (manager) => {
      manager.close(id);
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsActivate, ({ id }, sender) => {
    withManager(deps, sender, (manager) => {
      manager.activate(id);
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsMove, ({ id, toIndex }, sender) => {
    withManager(deps, sender, (manager) => {
      manager.move(id, toIndex);
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsSetPinned, ({ id, pinned }, sender) => {
    withManager(deps, sender, (manager) => {
      manager.setPinned(id, pinned);
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsRestoreClosed, (_payload, sender) => {
    withManager(deps, sender, (manager) => {
      manager.restoreClosed();
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsNavigate, ({ id, input }, sender) => {
    withManager(deps, sender, (manager) => {
      manager.navigate(id, input);
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsGoBack, ({ id }, sender) => {
    withManager(deps, sender, (manager) => {
      manager.goBack(id);
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsGoForward, ({ id }, sender) => {
    withManager(deps, sender, (manager) => {
      manager.goForward(id);
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsReload, ({ id, ignoreCache }, sender) => {
    withManager(deps, sender, (manager) => {
      manager.reload(id, ignoreCache);
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsStop, ({ id }, sender) => {
    withManager(deps, sender, (manager) => {
      manager.stop(id);
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsShowNewTab, ({ id }, sender) => {
    withManager(deps, sender, (manager) => {
      manager.showNewTabPage(id);
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsCloseOthers, ({ id }, sender) => {
    withManager(deps, sender, (manager) => {
      manager.closeOthers(id);
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsDuplicate, ({ id }, sender) => {
    withManager(deps, sender, (manager) => {
      manager.duplicate(id);
    });
  });

  handleSend(deps, SEND_CHANNELS.menuTab, ({ id }, sender) => {
    withManager(deps, sender, (manager) => {
      deps.popupTabMenu(manager, id, sender);
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsContinueInsecure, ({ id }, sender) => {
    withManager(deps, sender, (manager) => {
      manager.continueInsecure(id);
    });
  });

  handleSend(deps, SEND_CHANNELS.workspacesCreate, ({ name }, sender) => {
    withManager(deps, sender, (manager) => {
      manager.createWorkspace(name);
    });
  });

  handleSend(deps, SEND_CHANNELS.workspacesRename, ({ id, name }, sender) => {
    withManager(deps, sender, (manager) => {
      manager.renameWorkspace(id, name);
    });
  });

  handleSend(deps, SEND_CHANNELS.workspacesDelete, ({ id }, sender) => {
    withManager(deps, sender, (manager) => {
      manager.deleteWorkspace(id);
    });
  });

  handleSend(deps, SEND_CHANNELS.workspacesActivate, ({ id }, sender) => {
    withManager(deps, sender, (manager) => {
      manager.activateWorkspace(id);
    });
  });

  handleSend(deps, SEND_CHANNELS.tabsSetWorkspace, ({ id, workspaceId }, sender) => {
    withManager(deps, sender, (manager) => {
      manager.moveToWorkspace(id, workspaceId);
    });
  });

  handleSend(deps, SEND_CHANNELS.zoomSet, ({ id, direction }, sender) => {
    withManager(deps, sender, (manager) => {
      manager.setZoom(id, direction);
    });
  });

  handleSend(deps, SEND_CHANNELS.panelsOpen, ({ id }, sender) => {
    const panel = deps.findPanel(id);
    if (panel !== null) deps.getPanels(sender)?.open(panel.id, panel.url);
  });

  handleSend(deps, SEND_CHANNELS.panelsClose, (_payload, sender) => {
    deps.getPanels(sender)?.close();
  });

  handleSend(deps, SEND_CHANNELS.panelsAdd, ({ url, title }) => {
    deps.addPanel(url, title);
  });

  handleSend(deps, SEND_CHANNELS.panelsRemove, ({ id }, sender) => {
    deps.getPanels(sender)?.forget(id);
    deps.removePanel(id);
  });

  handleSend(deps, SEND_CHANNELS.panelsBounds, (bounds, sender) => {
    deps.getPanels(sender)?.setBounds(bounds);
  });

  handleSend(deps, SEND_CHANNELS.layoutSetInsets, (insets, sender) => {
    withManager(deps, sender, (manager) => {
      manager.setInsets(insets);
    });
  });

  handleSend(deps, SEND_CHANNELS.layoutSetOverlay, ({ open }, sender) => {
    withManager(deps, sender, (manager) => {
      manager.setOverlayOpen(open);
    });
  });

  handleInvoke(deps, INVOKE_CHANNELS.layoutOpenOverlay, async ({ open }, sender) => {
    const manager = deps.getManager(sender);
    if (manager === null) return { snapshot: null };
    return { snapshot: await manager.openOverlay(open) };
  });
}
