// Which cut owns a marking: the one that holds most of it. Used when a marking is made, when a cut
// is split, and when markings are copied to inserted pages. Works for every kind of marking,
// through markings/model.ts. Pure.

import { anchorOf, mapMarking, shareOf, type Marking, type Point } from '../markings/model';
import type { Frame } from './frames';
import type { Cut, ScoreInk } from './model';

/** A cut shows a marking, unclipped, when most of the marking lies within the cut. */
export const visible = (m: Marking, c: Cut, aspect: number) => shareOf(m, c.y0, c.y1, aspect) > 0.5;

/** Markings above and below y, each going to the side that holds most of it. */
export function _splitMarkings(list: readonly Marking[], y: number, aspect: number): [Marking[], Marking[]] {
  const up: Marking[] = [], down: Marking[] = [];
  for (const m of list) (shareOf(m, -Infinity, y, aspect) >= 0.5 ? up : down).push(m);
  return [up, down];
}

/**
 * The markings from the first time each part of a page is played: walk the page's cuts in
 * played order and take each marking that lies mostly in that cut and not in one walked before.
 */
export function _claimFirstPass(cuts: readonly Cut[], ink: ScoreInk, aspect: number): Marking[] {
  const out: Marking[] = [], walked: [number, number][] = [];
  for (const c of cuts) {
    for (const m of ink[c.id] ?? []) {
      if (shareOf(m, c.y0, c.y1, aspect) <= 0.5) continue;
      const before = walked.reduce((sum, [lo, hi]) => sum + shareOf(m, lo, hi, aspect), 0);
      if (before <= 0.5) out.push(m);
    }
    walked.push([c.y0, c.y1]);
  }
  return out;
}

/**
 * Give a marking made on a frame to the cut that holds most of it (the nearest cut, if none
 * does), with its points converted to that cut's page. Frame points have x as a fraction of
 * the frame width and y in page widths from the frame's top.
 */
export function claimMarking(frame: Frame, m: Marking, aspects: readonly number[]): { cut: Cut; marking: Marking } | null {
  if (!frame.items.length) return null;
  let best = frame.items[0], most = -1;
  for (const p of frame.items) {
    const v = shareOf(m, p.top, p.top + p.h, 1);
    if (v > most) { best = p; most = v; }
  }
  if (most <= 0) {
    const y = anchorOf(m)[1];
    const gap = (p: Frame['items'][number]) => Math.max(p.top - y, y - (p.top + p.h), 0);
    best = frame.items.reduce((a, b) => (gap(b) < gap(a) ? b : a));
  }
  const { cut, top } = best, a = aspects[cut.page];
  return { cut, marking: mapMarking(m, ([x, y, p]): Point => [x, cut.y0 + (y - top) / a, p]) };
}
