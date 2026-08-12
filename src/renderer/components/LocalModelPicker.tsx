import { useEffect, useState, type JSX } from 'react';
import type { LocalModelInfo, ModelStatus } from '../../shared/types/ipc.js';

/**
 * Choosing which model runs inside Vela, and fetching it.
 *
 * Vela ships without one deliberately. A four-gigabyte GGUF in the installer
 * would be a miserable download for everyone who never opens the assistant,
 * and it would ride along in every update after that. So the file arrives once,
 * here, and from then on the assistant needs no network at all — which is the
 * point of running it on this machine rather than someone's server.
 *
 * Sizes are shown because the download is the number that actually decides
 * whether a person wants a model.
 */

function gigabytes(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function describe(status: ModelStatus): string {
  switch (status.state) {
    case 'ready':
      return 'On this machine';
    case 'downloading': {
      const percent = Math.floor((status.receivedBytes / Math.max(1, status.totalBytes)) * 100);
      return `Downloading — ${String(percent)}%`;
    }
    case 'verifying':
      return 'Checking the download';
    case 'failed':
      return status.error;
    default:
      return '';
  }
}

function Row({
  model,
  selected,
  onSelect,
}: {
  model: LocalModelInfo;
  selected: boolean;
  onSelect: () => void;
}): JSX.Element {
  const status = model.status;
  const busy = status.state === 'downloading' || status.state === 'verifying';
  const percent =
    status.state === 'downloading'
      ? Math.floor((status.receivedBytes / Math.max(1, status.totalBytes)) * 100)
      : 0;

  return (
    <li
      className={`flex flex-col gap-[3px] rounded-lg border p-2 ${
        selected ? 'border-ink' : 'border-line'
      }`}
    >
      <div className="flex items-baseline gap-2">
        <button
          type="button"
          onClick={onSelect}
          className="focus-ring min-w-0 flex-1 text-left text-[13px] font-medium text-ink"
        >
          {model.label}
        </button>
        <span className="shrink-0 text-[11px] tabular-nums text-ink-muted">
          {model.parameters} · {gigabytes(model.bytes)}
        </span>
      </div>

      <span className="text-[12px] leading-relaxed text-ink-muted">{model.blurb}</span>

      <div className="flex items-center gap-2">
        <span
          className={`min-w-0 flex-1 truncate text-[11px] ${
            status.state === 'failed' ? 'text-ink' : 'text-ink-muted'
          }`}
        >
          {describe(status)}
        </span>

        {status.state === 'ready' || busy ? null : (
          <button
            type="button"
            onClick={() => {
              void window.vela.assistant.getModel(model.id);
            }}
            className="focus-ring shrink-0 rounded-lg border border-line px-2 py-[1px] text-[11px] text-ink hover:bg-hover"
          >
            {status.state === 'failed' ? 'Try again' : 'Download'}
          </button>
        )}
      </div>

      {status.state === 'downloading' ? (
        <span className="h-[3px] w-full overflow-hidden rounded-full bg-hover">
          <span
            className="block h-full rounded-full transition-[width] duration-300"
            style={{ width: `${String(percent)}%`, background: 'var(--vela-gradient)' }}
          />
        </span>
      ) : null}
    </li>
  );
}

export function LocalModelPicker({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}): JSX.Element {
  const [models, setModels] = useState<LocalModelInfo[]>([]);

  useEffect(() => {
    let active = true;
    void window.vela.assistant.models().then((next) => {
      if (active) setModels(next);
    });

    // Progress arrives on its own channel: a multi-gigabyte download is not
    // something to hold an invoke open for.
    const unsubscribe = window.vela.assistant.onModelProgress((progress) => {
      setModels((current) =>
        current.map((model) =>
          model.id === progress.id ? { ...model, status: progress.status } : model,
        ),
      );
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <div className="flex flex-col gap-1 px-1 py-1">
      <span className="text-[13px] text-ink">Model</span>
      <p className="m-0 text-[12px] leading-relaxed text-ink-muted">
        Downloaded once, then run inside Vela. There is no second program to install and no server
        to talk to — the question never becomes a network request.
      </p>
      <ul className="mt-1 flex flex-col gap-1">
        {models.map((model) => (
          <Row
            key={model.id}
            model={model}
            selected={model.id === selected}
            onSelect={() => {
              onSelect(model.id);
            }}
          />
        ))}
      </ul>
    </div>
  );
}
