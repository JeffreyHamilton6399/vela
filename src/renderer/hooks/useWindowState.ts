import { useEffect, useState } from 'react';
import type { WindowState } from '../../shared/types/ipc.js';

const INITIAL: WindowState = {
  maximized: false,
  minimized: false,
  fullScreen: false,
  focused: true,
};

/** Mirrors the main process's window state, kept fresh by push events. */
export function useWindowState(): WindowState {
  const [state, setState] = useState<WindowState>(INITIAL);

  useEffect(() => {
    let active = true;

    void window.vela.window.getState().then((next) => {
      if (active) setState(next);
    });

    const unsubscribe = window.vela.window.onStateChanged(setState);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return state;
}
