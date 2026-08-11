import type { JSX } from 'react';

interface WindowControlsProps {
  maximized: boolean;
}

const ICON_PROPS = {
  width: 10,
  height: 10,
  viewBox: '0 0 10 10',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1,
  'aria-hidden': true,
} as const;

function MinimizeIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M0 5.5h10" />
    </svg>
  );
}

function MaximizeIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <rect x="0.5" y="0.5" width="9" height="9" />
    </svg>
  );
}

function RestoreIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <rect x="0.5" y="2.5" width="7" height="7" />
      <path d="M2.5 2.5V0.5h7v7h-2" />
    </svg>
  );
}

function CloseIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />
    </svg>
  );
}

const BUTTON_BASE =
  'no-drag focus-ring flex h-full w-[46px] items-center justify-center text-ink transition-colors duration-150';

/**
 * Windows/Linux caption buttons. macOS uses its native traffic lights, so this
 * component is never rendered there.
 */
export function WindowControls({ maximized }: WindowControlsProps): JSX.Element {
  return (
    <div className="flex h-full items-stretch">
      <button
        type="button"
        aria-label="Minimize"
        className={`${BUTTON_BASE} hover:bg-hover`}
        onClick={() => {
          window.vela.window.minimize();
        }}
      >
        <MinimizeIcon />
      </button>
      <button
        type="button"
        aria-label={maximized ? 'Restore' : 'Maximize'}
        className={`${BUTTON_BASE} hover:bg-hover`}
        onClick={() => {
          window.vela.window.toggleMaximize();
        }}
      >
        {maximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>
      <button
        type="button"
        aria-label="Close"
        className={`${BUTTON_BASE} hover:bg-danger hover:text-white`}
        onClick={() => {
          window.vela.window.close();
        }}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
