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
/**
 * The margins are part of the footprint, not decoration: the sidebar is a card
 * on the chrome exactly as the page is, and the gap between the two is what
 * separates them now that neither has a rule drawn down its edge. They are in
 * this constant rather than on the elements so that the placeholder reserves
 * the same space, which is the whole reason this module exists.
 */
export const SIDEBAR_FRAME =
  'mr-[6px] mb-[6px] ml-[6px] w-[280px] shrink-0 overflow-hidden rounded-[var(--page-radius)] bg-raised shadow-[0_1px_4px_rgb(0_0_0/0.08)]';
