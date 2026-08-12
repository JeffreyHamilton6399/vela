import { useEffect, useState, type JSX } from 'react';
import type { CapturedLogin } from '../../shared/types/ipc.js';

/** The login Vela is currently offering to remember, if any. */
export function useCapturedLogin(): [CapturedLogin, (next: CapturedLogin) => void] {
  const [captured, setCaptured] = useState<CapturedLogin>(null);

  useEffect(() => window.vela.account.onCaptured(setCaptured), []);

  return [captured, setCaptured];
}

/**
 * "Save this login?", after you have signed in to a site by hand.
 *
 * The password is not here. It stayed in the main process when the prompt was
 * raised, and the buttons below answer by id — so the chrome renderer, which
 * is the part of Vela with a window and a DOM, never holds one.
 */
export function SaveLoginPrompt({
  captured,
  onResolved,
}: {
  captured: CapturedLogin;
  onResolved: () => void;
}): JSX.Element | null {
  if (captured === null) return null;

  const answer = (save: boolean): void => {
    void window.vela.account.resolveCapture(captured.id, save).then(onResolved);
  };

  return (
    <div className="flex h-4 shrink-0 items-center justify-center gap-2 border-b border-line bg-raised px-2 text-[12px]">
      <span className="min-w-0 truncate text-ink">
        {captured.replacing ? 'Update the saved password for' : 'Save this login for'}{' '}
        <strong className="font-semibold">{captured.host}</strong>
        <span className="text-ink-muted"> — {captured.username}</span>
      </span>
      <button
        type="button"
        onClick={() => {
          answer(true);
        }}
        className="focus-ring shrink-0 rounded-lg px-1 py-[2px] font-medium text-ink underline underline-offset-2"
      >
        {captured.replacing ? 'Update' : 'Save'}
      </button>
      <button
        type="button"
        onClick={() => {
          answer(false);
        }}
        className="focus-ring shrink-0 rounded-lg px-1 py-[2px] text-ink-muted hover:text-ink"
      >
        Not now
      </button>
    </div>
  );
}
