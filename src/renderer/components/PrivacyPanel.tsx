import { useEffect, useState, type JSX } from 'react';
import type { PrivacyReport } from '../../shared/types/ipc.js';
import { CloseIcon, ShieldIcon } from './icons.js';

interface PrivacyPanelProps {
  onClose: () => void;
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{value}</dd>
    </>
  );
}

/**
 * The plain answer to "what does Vela collect": nothing. Everything on this
 * panel is checkable — the settings file path, the one address Vela contacts
 * on its own behalf, and the exact user agent every install sends.
 */
export function PrivacyPanel({ onClose }: PrivacyPanelProps): JSX.Element {
  const [report, setReport] = useState<PrivacyReport | null>(null);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    let active = true;
    void window.vela.privacy.getReport().then((next) => {
      if (active) setReport(next);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 flex items-start justify-center overflow-auto bg-surface p-4"
      onClick={(event) => {
        // Clicking the empty surface around the card dismisses it.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="w-full max-w-[560px] rounded-card border border-line bg-raised p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1">
            <ShieldIcon width={18} height={18} className="text-ink" />
            <h1 className="text-[15px] font-semibold tracking-tight text-ink">
              What Vela collects
            </h1>
          </div>
          <button
            type="button"
            aria-label="Close privacy panel"
            onClick={onClose}
            className="focus-ring flex items-center gap-1 rounded-lg border border-line px-1 py-[3px] text-[12px] text-ink-muted hover:bg-hover hover:text-ink"
          >
            <CloseIcon width={10} height={10} />
            Close
          </button>
        </div>

        <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
          Nothing. Vela has no servers, no accounts, and no analytics. It makes three kinds of
          network request, and you ask for all of them: the pages you navigate to, one check for a
          new release, and an assistant model if you choose to download one. Everything it remembers
          lives in a single local file you can read, edit, or delete.
        </p>

        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[12px]">
          <Row
            label="Ad & tracker blocking"
            value={report?.adblockEnabled === true ? 'On' : 'Off'}
          />
          <Row
            label="Blocked in this window"
            value={report === null ? '—' : String(report.blockedThisWindow)}
          />
          <Row
            label="Session"
            value={report?.privateSession === true ? 'Private (memory only)' : 'Normal'}
          />
          <Row label="Settings file" value={report?.settingsPath ?? '—'} />
          <Row label="Update check" value={report?.updateFeedUrl ?? '—'} />
          <Row label="User agent" value={report?.userAgent ?? '—'} />
        </dl>

        <div className="mt-3 flex items-center gap-1 border-t border-line pt-2">
          <button
            type="button"
            className="focus-ring rounded-lg bg-ink px-2 py-1 text-[13px] font-medium text-surface transition-opacity duration-150 hover:opacity-90"
            onClick={() => {
              void window.vela.privacy.clearData().then(setCleared);
            }}
          >
            Clear cookies, cache and storage
          </button>
          {cleared ? <span className="text-[12px] text-ink-muted">Cleared.</span> : null}
        </div>
      </section>
    </div>
  );
}
