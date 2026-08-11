import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  /** Square edge length in px. Kept off the 8px grid only for optical sizing. */
  size?: number;
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
  ...rest
}: IconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      style={{ width: size, height: size }}
      className={`no-drag focus-ring flex shrink-0 items-center justify-center rounded-lg text-ink transition-colors duration-150 hover:bg-hover disabled:pointer-events-none disabled:opacity-30 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
