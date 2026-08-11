import type { JSX } from 'react';
import type { Platform } from '../../shared/types/ipc.js';
import { WindowControls } from './WindowControls.js';

interface TitleBarProps {
  platform: Platform;
  maximized: boolean;
  focused: boolean;
}

/**
 * 40px of chrome. The whole bar is a drag region except for the controls.
 * On macOS the left padding clears the native traffic lights.
 */
export function TitleBar({ platform, maximized, focused }: TitleBarProps): JSX.Element {
  const isMac = platform === 'darwin';

  return (
    <header
      className={`drag flex h-5 shrink-0 items-center justify-between border-b border-line bg-raised transition-opacity duration-200 ${
        focused ? 'opacity-100' : 'opacity-60'
      } ${isMac ? 'pl-10' : 'pl-2'}`}
    >
      <span className="text-[13px] font-semibold tracking-tight text-ink">Vela</span>

      {isMac ? <div className="w-2" /> : <WindowControls maximized={maximized} />}
    </header>
  );
}
