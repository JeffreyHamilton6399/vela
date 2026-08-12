import { settingsSchema, type Settings } from '../../shared/settings.js';
import {
  INVOKE_CHANNELS,
  SEND_CHANNELS,
  type PrivacyReport,
  type SettingsImportResult,
  type UpdateState,
  type DownloadItem,
  type HistoryEntry,
  type LocalModelInfo,
  type ActionResult,
} from '../../shared/types/ipc.js';
import type { SettingsStore } from '../settings/store.js';
import type { Vault } from '../account/vault.js';
import { addTile, moveTile, normalizeUrl, removeTile } from '../speed-dial.js';
import { randomUUID } from 'node:crypto';
import { addBookmark, moveBookmark, removeBookmark } from '../../shared/bookmarks.js';
import {
  askAssistant,
  type LocalRunner,
  assistantStatus,
  pullOllamaModel,
  type AssistantConfig,
} from '../assistant/assistant.js';
import { handleInvoke, handleSend, type GuardOptions } from './contract-guard.js';

export interface SettingsIpcDeps extends GuardOptions {
  getStore: () => SettingsStore | null;
  getReport: (sender: unknown) => PrivacyReport;
  clearData: (sender: unknown) => Promise<boolean>;
  updater: {
    current: UpdateState;
    check: () => void;
    download: () => void;
    install: () => void;
  };
  /** Icon already on this machine for a URL, or null. Never fetches. */
  cachedFavicon: (url: string) => string | null;
  vault: Vault;
  /** Fills the saved login into the page of a tab the user is looking at. */
  fillLogin: (
    sender: unknown,
    tabId: string,
  ) => Promise<{ ok: boolean; error: string | null; filled: number }>;
  /** Answers a "save this login?" prompt for the window that raised it. */
  resolveCapture: (
    sender: unknown,
    id: string,
    save: boolean,
  ) => { ok: boolean; error: string | null };
  /** Opens Ollama's download page. Vela never runs an installer itself. */
  openOllamaDownload: (sender: unknown) => { opened: boolean; command: string };
  /** The in-process model, injected so this module never loads llama.cpp. */
  localRunner: LocalRunner;
  models: {
    list: () => Promise<LocalModelInfo[]>;
    /** Starts, or joins, the download of one catalogue model. */
    download: (id: string) => Promise<ActionResult>;
  };
  downloads: {
    list: (sender: unknown) => DownloadItem[];
    open: (sender: unknown, id: string) => void;
    showInFolder: (sender: unknown, id: string) => void;
    cancel: (sender: unknown, id: string) => void;
    clear: (sender: unknown) => void;
    togglePopup: (sender: unknown) => void;
    closePopup: (sender: unknown) => void;
    setPopupHeight: (sender: unknown, height: number) => void;
  };
  history: {
    search: (query: string, limit: number) => HistoryEntry[];
    clear: () => void;
  };
}

const FALLBACK: Settings = settingsSchema.parse({});

/** Reads the assistant configuration out of the live settings store. */
function assistantConfig(deps: SettingsIpcDeps): AssistantConfig {
  const current = deps.getStore()?.current ?? FALLBACK;
  return {
    provider: current.assistantProvider,
    localModel: current.assistantLocalModel,
    ollamaModel: current.assistantOllamaModel,
    hostedModel: current.assistantHostedModel,
    apiKey: current.assistantApiKey,
  };
}

export function registerSettingsIpc(deps: SettingsIpcDeps): void {
  handleInvoke(deps, INVOKE_CHANNELS.settingsGet, () => deps.getStore()?.current ?? FALLBACK);

  handleInvoke(deps, INVOKE_CHANNELS.settingsExport, () => deps.getStore()?.export() ?? '{}');

  handleInvoke(deps, INVOKE_CHANNELS.settingsImport, ({ json }): SettingsImportResult => {
    const store = deps.getStore();
    if (store === null) return { ok: false, message: 'Settings are not ready yet.' };

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return { ok: false, message: 'That file is not valid JSON.' };
    }

    const validated = settingsSchema.safeParse(parsed);
    if (!validated.success) {
      const issue = validated.error.issues[0];
      const where = issue?.path.join('.') ?? 'file';
      return { ok: false, message: `Not a Vela settings file (${where}).` };
    }

    store.replace(validated.data);
    return { ok: true, message: 'Settings imported.' };
  });

  handleInvoke(deps, INVOKE_CHANNELS.assistantAsk, async ({ messages }) =>
    askAssistant(assistantConfig(deps), messages, deps.localRunner),
  );

  handleInvoke(deps, INVOKE_CHANNELS.accountState, () => ({
    exists: deps.vault.exists,
    unlocked: deps.vault.unlocked,
    email: deps.vault.email,
  }));

  handleInvoke(deps, INVOKE_CHANNELS.accountCreate, ({ email, masterPassword }) =>
    deps.vault.create(email, masterPassword),
  );

  handleInvoke(deps, INVOKE_CHANNELS.accountUnlock, ({ masterPassword }) =>
    deps.vault.unlock(masterPassword),
  );

  handleInvoke(deps, INVOKE_CHANNELS.accountLock, () => {
    deps.vault.lock();
    return true;
  });

  handleInvoke(deps, INVOKE_CHANNELS.vaultList, () => deps.vault.list());

  handleInvoke(deps, INVOKE_CHANNELS.vaultSave, ({ host, username, password }) => {
    if (!deps.vault.unlocked) return { ok: false, error: 'Sign in first.' };
    const saved = deps.vault.save(host, username, password);
    return saved ? { ok: true, error: null } : { ok: false, error: 'Could not save.' };
  });

  handleInvoke(deps, INVOKE_CHANNELS.vaultRemove, ({ id }) => {
    deps.vault.remove(id);
    return true;
  });

  handleInvoke(deps, INVOKE_CHANNELS.vaultFill, async ({ tabId }, sender) =>
    deps.fillLogin(sender, tabId),
  );

  handleInvoke(deps, INVOKE_CHANNELS.vaultResolveCapture, ({ id, save }, sender) =>
    deps.resolveCapture(sender, id, save),
  );

  handleInvoke(deps, INVOKE_CHANNELS.assistantInstall, (_payload, sender) =>
    deps.openOllamaDownload(sender),
  );

  handleInvoke(deps, INVOKE_CHANNELS.assistantPull, async ({ model }) => pullOllamaModel(model));

  handleInvoke(deps, INVOKE_CHANNELS.assistantModels, async () => deps.models.list());

  handleInvoke(deps, INVOKE_CHANNELS.assistantModelGet, async ({ id }) => deps.models.download(id));

  handleInvoke(deps, INVOKE_CHANNELS.assistantStatus, async () =>
    assistantStatus(assistantConfig(deps), deps.localRunner),
  );

  handleInvoke(deps, INVOKE_CHANNELS.privacyGetReport, (_payload, sender) =>
    deps.getReport(sender),
  );

  handleInvoke(deps, INVOKE_CHANNELS.privacyClearData, async (_payload, sender) =>
    deps.clearData(sender),
  );

  handleSend(deps, SEND_CHANNELS.settingsSet, (patch) => {
    deps.getStore()?.update(patch);
  });

  handleInvoke(deps, INVOKE_CHANNELS.updatesGetState, () => deps.updater.current);

  handleSend(deps, SEND_CHANNELS.updatesCheck, () => {
    deps.updater.check();
  });

  handleSend(deps, SEND_CHANNELS.updatesDownload, () => {
    deps.updater.download();
  });

  handleSend(deps, SEND_CHANNELS.updatesInstall, () => {
    deps.updater.install();
  });

  handleInvoke(deps, INVOKE_CHANNELS.downloadsGet, (_payload, sender) =>
    deps.downloads.list(sender),
  );

  handleInvoke(deps, INVOKE_CHANNELS.historySearch, ({ query, limit }) =>
    deps.history.search(query, limit),
  );

  handleInvoke(deps, INVOKE_CHANNELS.historyClear, () => {
    deps.history.clear();
    return true;
  });

  handleSend(deps, SEND_CHANNELS.downloadsOpen, ({ id }, sender) => {
    deps.downloads.open(sender, id);
  });

  handleSend(deps, SEND_CHANNELS.downloadsShow, ({ id }, sender) => {
    deps.downloads.showInFolder(sender, id);
  });

  handleSend(deps, SEND_CHANNELS.downloadsCancel, ({ id }, sender) => {
    deps.downloads.cancel(sender, id);
  });

  handleSend(deps, SEND_CHANNELS.downloadsClear, (_payload, sender) => {
    deps.downloads.clear(sender);
  });

  handleSend(deps, SEND_CHANNELS.downloadsPopupToggle, (_payload, sender) => {
    deps.downloads.togglePopup(sender);
  });

  handleSend(deps, SEND_CHANNELS.downloadsPopupClose, (_payload, sender) => {
    deps.downloads.closePopup(sender);
  });

  handleSend(deps, SEND_CHANNELS.downloadsPopupHeight, ({ height }, sender) => {
    deps.downloads.setPopupHeight(sender, height);
  });

  handleSend(deps, SEND_CHANNELS.bookmarksAdd, ({ url, title }) => {
    const store = deps.getStore();
    if (store === null) return;
    store.update({
      bookmarks: addBookmark(
        store.current.bookmarks,
        url,
        title,
        deps.cachedFavicon(url),
        randomUUID,
      ),
    });
  });

  handleSend(deps, SEND_CHANNELS.bookmarksRemove, ({ id }) => {
    const store = deps.getStore();
    if (store === null) return;
    store.update({ bookmarks: removeBookmark(store.current.bookmarks, id) });
  });

  handleSend(deps, SEND_CHANNELS.bookmarksMove, ({ id, toIndex }) => {
    const store = deps.getStore();
    if (store === null) return;
    store.update({ bookmarks: moveBookmark(store.current.bookmarks, id, toIndex) });
  });

  handleSend(deps, SEND_CHANNELS.toolsSetNotes, ({ text }) => {
    deps.getStore()?.update({ notes: text });
  });

  handleSend(deps, SEND_CHANNELS.speedDialAdd, (entry) => {
    const store = deps.getStore();
    if (store === null) return;

    const normalized = normalizeUrl(entry.url);
    if (normalized === null) return;

    // Use whatever icon is already cached; a tile is not a reason to make a
    // request the user did not ask for.
    const icon = deps.cachedFavicon(normalized);
    store.update({
      speedDial: addTile(store.current.speedDial, { url: entry.url, title: entry.title }, icon),
    });
  });

  handleSend(deps, SEND_CHANNELS.speedDialRemove, ({ id }) => {
    const store = deps.getStore();
    if (store === null) return;
    store.update({ speedDial: removeTile(store.current.speedDial, id) });
  });

  handleSend(deps, SEND_CHANNELS.speedDialMove, ({ id, toIndex }) => {
    const store = deps.getStore();
    if (store === null) return;
    store.update({ speedDial: moveTile(store.current.speedDial, id, toIndex) });
  });
}
