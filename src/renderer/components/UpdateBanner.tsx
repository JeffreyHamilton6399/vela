import { useEffect, useState, type JSX } from 'react';
import type { UpdateState } from '../../shared/types/ipc.js';

/** Mirrors the update state pushed from main. */
export function useUpdateState(): UpdateState {
  const [state, setState] = useState<UpdateState>({ status: 'idle', version: null, message: null });

  useEffect(() => {
    let active = true;
    void window.vela.updates.getState().then((next) => {
      if (active) setState(next);
    });
    const unsubscribe = window.vela.updates.onChanged(setState);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return state;
}

/**
 * A quiet strip that only appears when there is genuinely something to do.
 * Nothing downloads until the button is pressed.
 */
export function UpdateBanner({ state }: { state: UpdateState }): JSX.Element | null {
  if (state.status !== 'available' && state.status !== 'ready' && state.status !== 'downloading') {
    return null;
  }

  return (
    <div className="flex h-4 shrink-0 items-center justify-center gap-2 border-b border-line bg-raised px-2 text-[12px]">
      {state.status === 'available' ? (
        <>
          <span className="text-ink">Vela {state.version} is available.</span>
          <button
            type="button"
            className="focus-ring rounded-lg px-1 py-[2px] font-medium text-ink underline underline-offset-2"
            onClick={() => {
              window.vela.updates.download();
            }}
          >
            Download
          </button>
        </>
      ) : null}

      {state.status === 'downloading' ? (
        <span className="text-ink-muted">Downloading update… {state.message ?? ''}</span>
      ) : null}

      {state.status === 'ready' ? (
        <>
          <span className="text-ink">Vela {state.version} is ready to install.</span>
          <button
            type="button"
            className="focus-ring rounded-lg px-1 py-[2px] font-medium text-ink underline underline-offset-2"
            onClick={() => {
              window.vela.updates.install();
            }}
          >
            Restart and install
          </button>
        </>
      ) : null}
    </div>
  );
}
