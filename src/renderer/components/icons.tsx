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

export const DownloadIcon = (props: IconProps): JSX.Element => (
  <Icon shape="M8 2v8M4.5 7 8 10.5 11.5 7M3 13h10" {...props} />
);

export const StarIcon = (props: IconProps): JSX.Element => (
  <Icon
    shape="M8 2.5l1.7 3.5 3.8.5-2.8 2.7.7 3.8L8 11.2l-3.4 1.8.7-3.8L2.5 6.5l3.8-.5z"
    {...props}
  />
);

export const ClockIcon = (props: IconProps): JSX.Element => (
  <Icon shape="M8 13.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM8 5v3.2l2.2 1.3" {...props} />
);

export const NotesIcon = (props: IconProps): JSX.Element => (
  <Icon shape="M4 2.5h8v11H4zM6 5.5h4M6 8h4M6 10.5h2" {...props} />
);

export const UnitsIcon = (props: IconProps): JSX.Element => (
  <Icon shape="M2.5 6h11M11 3.5 13.5 6 11 8.5M13.5 10.5h-11M5 8 2.5 10.5 5 13" {...props} />
);

export const CalculatorIcon = (props: IconProps): JSX.Element => (
  <Icon
    shape="M3.5 2.5h9v11h-9zM5.5 5.5h5M5.5 8.5h1M7.5 8.5h1M9.5 8.5h1M5.5 11h1M7.5 11h1M9.5 11h1"
    {...props}
  />
);

export const GlobeIcon = (props: IconProps): JSX.Element => (
  <Icon
    shape="M8 13.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM2.5 8h11M8 2.5c1.5 1.6 2.2 3.5 2.2 5.5S9.5 11.9 8 13.5C6.5 11.9 5.8 10 5.8 8S6.5 4.1 8 2.5z"
    {...props}
  />
);

export const LayersIcon = (props: IconProps): JSX.Element => (
  <Icon shape="M8 2 2.5 5 8 8l5.5-3zM2.5 8 8 11l5.5-3M2.5 11 8 14l5.5-3" {...props} />
);

export const BriefcaseIcon = (props: IconProps): JSX.Element => (
  <Icon shape="M2.5 5.5h11v8h-11zM6 5.5V3.5h4v2M2.5 9h11" {...props} />
);

export const HomeIcon = (props: IconProps): JSX.Element => (
  <Icon shape="M2.5 7.5 8 2.5l5.5 5M4 8.5v5h8v-5" {...props} />
);

export const BeakerIcon = (props: IconProps): JSX.Element => (
  <Icon shape="M6.5 2.5v4L3 12.5h10L9.5 6.5v-4M5.5 2.5h5M5 9.5h6" {...props} />
);

export const BookIcon = (props: IconProps): JSX.Element => (
  <Icon
    shape="M3 3h4.5c.8 0 1.5.7 1.5 1.5V13c0-.8-.7-1.5-1.5-1.5H3zM13 3H8.5C7.7 3 7 3.7 7 4.5V13c0-.8.7-1.5 1.5-1.5H13z"
    {...props}
  />
);

export const KeyIcon = (props: IconProps): JSX.Element => (
  <Icon
    shape="M10.5 2.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM8.4 7.6 2.5 13.5M4.5 11.5l1.5 1.5M6 10l1.5 1.5"
    {...props}
  />
);

export const SparkIcon = (props: IconProps): JSX.Element => (
  <Icon
    shape="M8 2v3.2M8 10.8V14M2 8h3.2M10.8 8H14M4.2 4.2l2.2 2.2M9.6 9.6l2.2 2.2M11.8 4.2 9.6 6.4M6.4 9.6l-2.2 2.2"
    {...props}
  />
);

export const SettingsIcon = (props: IconProps): JSX.Element => (
  <Icon
    shape="M6.9 1.9h2.2l.25 1.6 1.15.66 1.5-.6 1.1 1.9-1.2 1.05v1.32l1.2 1.05-1.1 1.9-1.5-.6-1.15.66-.25 1.6H6.9l-.25-1.6-1.15-.66-1.5.6-1.1-1.9L4.1 9.43V8.11L2.9 7.06l1.1-1.9 1.5.6 1.15-.66zM8 6.1a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8z"
    {...props}
  />
);
