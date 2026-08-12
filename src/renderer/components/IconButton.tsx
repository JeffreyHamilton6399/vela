import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  /** Square edge length in px. Kept off the 8px grid only for optical sizing. */
  size?: number;
  /**
   * A keyboard shortcut, shown in the tooltip but kept out of the accessible
   * name — a screen reader announcing "Back Alt+Left Arrow" as the button's
   * name is worse than it not knowing. Written with `mod` for the platform's
   * primary modifier.
   */
  hint?: string;
}

/**
 * Turns `mod+T` into the spelling this platform uses.
 *
 * Read at call time rather than at module load: a module-scope `window.vela`
 * would tie this file's import order to the preload's, for a string that is
 * only ever needed once a tooltip is being built.
 */
export function shortcut(keys: string): string {
  const mac = window.vela.platform === 'darwin';
  return keys.replace('mod+', mac ? '⌘' : 'Ctrl+').replace('alt+', mac ? '⌥' : 'Alt+');
}

/**
 * The one button shape used across the chrome: square, rounded, quiet until
 * hovered, gradient focus ring when reached by keyboard.
 */
export function IconButton({
  label,
  children,
  size = 32,
  className = '',
  hint,
  ...rest
}: IconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={hint === undefined ? label : `${label} (${shortcut(hint)})`}
      style={{ width: size, height: size }}
      className={`no-drag focus-ring press flex shrink-0 items-center justify-center rounded-lg text-ink hover:bg-hover disabled:pointer-events-none disabled:opacity-30 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
