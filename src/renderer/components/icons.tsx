import type { JSX, SVGProps } from 'react';

/**
 * A small stroked icon set drawn inline. No icon font, no sprite fetch —
 * nothing here costs a network request.
 */
// `path` and `d` are themselves SVG presentation attributes, so they are
// removed from the passthrough props to keep the shape prop unambiguous.
type IconProps = Omit<SVGProps<SVGSVGElement>, 'viewBox' | 'children' | 'path' | 'd'>;

function Icon({ shape, ...props }: IconProps & { shape: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d={shape} />
    </svg>
  );
}

export const ArrowLeftIcon = (props: IconProps): JSX.Element => (
  <Icon shape="M10 3.5 5.5 8l4.5 4.5" {...props} />
);

export const ArrowRightIcon = (props: IconProps): JSX.Element => (
  <Icon shape="M6 3.5 10.5 8 6 12.5" {...props} />
);

export const ReloadIcon = (props: IconProps): JSX.Element => (
  <Icon shape="M13 8a5 5 0 1 1-1.7-3.8M13 2.5V5h-2.5" {...props} />
);

export const CloseIcon = (props: IconProps): JSX.Element => (
  <Icon shape="M4 4l8 8M12 4l-8 8" {...props} />
);

export const PlusIcon = (props: IconProps): JSX.Element => (
  <Icon shape="M8 3.5v9M3.5 8h9" {...props} />
);

export const LockIcon = (props: IconProps): JSX.Element => (
  <Icon shape="M4.5 7V5.5a3.5 3.5 0 0 1 7 0V7M3.75 7h8.5v6h-8.5z" {...props} />
);

export const WarningIcon = (props: IconProps): JSX.Element => (
  <Icon shape="M8 2.5 14.5 13.5h-13zM8 6.5v3M8 11.5v.01" {...props} />
);

export const SearchIcon = (props: IconProps): JSX.Element => (
  <Icon shape="M7 11.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM10.5 10.5 14 14" {...props} />
);

export const ShieldIcon = (props: IconProps): JSX.Element => (
  <Icon shape="M8 2 13 4v4.5c0 3-2.1 4.8-5 5.5-2.9-.7-5-2.5-5-5.5V4z" {...props} />
);

export const PinIcon = (props: IconProps): JSX.Element => (
  <Icon shape="M6 2h4l-.5 4 2 2v1H4.5V8l2-2z M8 9v5" {...props} />
);

export const SidebarIcon = (props: IconProps): JSX.Element => (
  <Icon shape="M2.5 3.5h11v9h-11zM6.5 3.5v9" {...props} />
);

export const GridIcon = (props: IconProps): JSX.Element => (
  <Icon shape="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z" {...props} />
);

export const SettingsIcon = (props: IconProps): JSX.Element => (
  <Icon
    shape="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 1.5v1.6M8 12.9v1.6M2.9 2.9l1.1 1.1M12 12l1.1 1.1M1.5 8h1.6M12.9 8h1.6M2.9 13.1 4 12M12 4l1.1-1.1"
    {...props}
  />
);
