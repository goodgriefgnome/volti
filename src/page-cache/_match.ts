// Which widths stand for which: when a page drawn at one width serves a request for another, and
// which pages to show first while the exact one is drawn. Pure.

/** Whether two widths (device pixels) are close enough for one page to serve for the other. */
export function equivalent(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(4, 0.01 * Math.max(a, b));
}

/** The widest of `widths` equivalent to `asked` (scaling down beats scaling up); undefined if none is. */
export function bestExact(widths: readonly number[], asked: number): number | undefined {
  let best: number | undefined;
  for (const w of widths) if (equivalent(w, asked) && (best === undefined || w > best)) best = w;
  return best;
}

/**
 * The pages to show while the one asked for is drawn, closer to it than the last: first the
 * narrowest held page wider than `asked`; failing that, the page of the closest width, held or
 * saved (the wider on a tie). None when some page is equivalent to `asked`.
 */
export function standIns(held: readonly number[], saved: readonly number[], asked: number): { pxWidth: number; held: boolean }[] {
  if (bestExact([...held, ...saved], asked) !== undefined) return [];
  let wider: number | undefined;
  for (const w of held) if (w > asked && (wider === undefined || w < wider)) wider = w;
  if (wider !== undefined) return [{ pxWidth: wider, held: true }];
  let closest: number | undefined;
  for (const w of [...held, ...saved]) {
    if (closest === undefined) closest = w;
    else {
      const d = Math.abs(w - asked), c = Math.abs(closest - asked);
      if (d < c || (d === c && w > closest)) closest = w;
    }
  }
  return closest === undefined ? [] : [{ pxWidth: closest, held: held.includes(closest) }];
}
