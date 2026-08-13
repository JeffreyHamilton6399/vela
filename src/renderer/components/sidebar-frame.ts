/**
 * The sidebar's footprint, in one place.
 *
 * The sidebar is loaded on demand, so there is a beat where it has been asked
 * for and has not arrived. What stands in for it during that beat has to be
 * exactly the same width: the page region is measured from the space left over,
 * and a placeholder of a different size would move the page view twice — out,
 * then back — for every first click on a sidebar tool.
 *
 * Its own module rather than an export from `Sidebar.tsx`, because importing it
 * from there would pull the sidebar back into the initial bundle and undo the
 * split it exists to support.
 */
export const SIDEBAR_FRAME = 'w-[280px] shrink-0 border-l border-line bg-raised';
