// The frames on a screen: the widths their
// pages are drawn at. Pure: no DOM. Where they sit is render/strip.ts's; pages kept offline are
// drawn at the widths offlinePageWidths gives (offline/pages.ts).

import type { Frame } from '../scores/frames';
import { stripPageWidths } from './strip';

/** Each page the frames are cut from, with the widest of their slots it is drawn into (CSS pixels). */
export function pageWidths(frames: readonly Frame[], widths: readonly number[]): Map<number, number> {
  const out = new Map<number, number>();
  frames.forEach((f, i) => { for (const p of f.items) out.set(p.cut.page, Math.max(out.get(p.cut.page) ?? 0, widths[i])); });
  return out;
}

/**
 * The widths (CSS pixels) of every page shown reading the frames at `W`×`H` and, the screen turned,
 * at `H`×`W`: what is kept offline, as a tablet is read in either orientation. Each frame is drawn
 * at its fitted size (render/strip.ts), which depends on the smallest scale and not on Advance.
 */
export function offlinePageWidths(frames: readonly Frame[], W: number, H: number, scale: number, smallest: number): Map<number, Set<number>> {
  const out = stripPageWidths(frames, W, H, scale, smallest);
  for (const [p, ws] of stripPageWidths(frames, H, W, scale, smallest)) {
    const have = out.get(p) ?? new Set<number>();
    for (const w of ws) have.add(w);
    out.set(p, have);
  }
  return out;
}
