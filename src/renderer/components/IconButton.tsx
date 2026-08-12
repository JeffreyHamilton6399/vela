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
 * Turns `mod+shift+T` into the spelling this platform uses.
 *
 * Windows and Linux name their modifiers and join them with `+`. macOS uses
 * symbols, no separators, and a fixed order regardless of how the chord was
 * written — ⌥⇧⌘ — so the two are built rather than substituted.
 *
 * Read at call time rather than at module load: a module-scope `window.vela`
 * would tie this file's import order to the preload's, for a string that is
 * only ever needed once a tooltip is being built.
 */
const MODIFIER_NAMES: Record<string, string> = { mod: 'Ctrl', alt: 'Alt', shift: 'Shift' };

export function shortcut(keys: string): string {
  const modifiers = keys.split('+');
  const key = (modifiers.pop() ?? '').toUpperCase();

  if (window.vela.platform !== 'darwin') {
    return [...modifiers.map((part) => MODIFIER_NAMES[part] ?? part), key].join('+');
  }

  const symbol = (name: string, glyph: string): string => (modifiers.includes(name) ? glyph : '');
  return `${symbol('alt', '⌥')}${symbol('shift', '⇧')}${symbol('mod', '⌘')}${key}`;
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
