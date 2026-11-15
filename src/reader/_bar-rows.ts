// How many rows the reader's toolbar takes: one when everything fits on it, or when two would take
// too much of a short screen; else two. Pure: the toolbar measures, this decides.

/** The room the title keeps, at least, in a toolbar of one row that fits (px). */
export const TITLE_MIN_PX = 120;
/** How tall the toolbar is in two rows (px): two rows of 44, 8 between, 8 above and below. */
export const TWO_ROWS_PX = 112;

/**
 * How many rows the toolbar takes. `width` is the bar's inside width, `fixed` the back arrow,
 * ⋯ and the gaps between the row's four parts, `tools` the tools' own width, and `height` the
 * screen's height (all px).
 */
export function barRows(o: { width: number; fixed: number; tools: number; height: number }): 1 | 2 {
  if (o.fixed + o.tools + TITLE_MIN_PX <= o.width) return 1;
  return TWO_ROWS_PX > o.height / 5 ? 1 : 2;
}
