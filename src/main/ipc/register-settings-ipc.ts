import { settingsSchema, type Settings } from '../../shared/settings.js';
import {
  INVOKE_CHANNELS,
  SEND_CHANNELS,
  type PrivacyReport,
  type SettingsImportResult,
} from '../../shared/types/ipc.js';
import type { SettingsStore } from '../settings/store.js';
import { handleInvoke, handleSend, type GuardOptions } from './contract-guard.js';

export interface SettingsIpcDeps extends GuardOptions {
  getStore: () => SettingsStore | null;
  getReport: (sender: unknown) => PrivacyReport;
  clearData: (sender: unknown) => Promise<boolean>;
}

const FALLBACK: Settings = settingsSchema.parse({});

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

  handleInvoke(deps, INVOKE_CHANNELS.privacyGetReport, (_payload, sender) =>
    deps.getReport(sender),
  );

  handleInvoke(deps, INVOKE_CHANNELS.privacyClearData, async (_payload, sender) =>
    deps.clearData(sender),
  );

  handleSend(deps, SEND_CHANNELS.settingsSet, (patch) => {
    deps.getStore()?.update(patch);
  });
}
