import { useEffect, useState } from 'react';
import type { AppInfo } from '../../shared/types/ipc.js';

/** `null` until the first round trip to main completes. */
export function useAppInfo(): AppInfo | null {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    let active = true;
    void window.vela.app.getInfo().then((next) => {
      if (active) setInfo(next);
    });
    return () => {
      active = false;
    };
  }, []);

  return info;
}
