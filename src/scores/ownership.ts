// Which cut a marking is on: the page a marking made or moved on a frame goes on, and which cuts
// show a marking. Works for every kind of marking, through markings/model.ts. Pure.

import { anchorOf, mapMarking, type Marking, type Point } from '../markings/model';
import type { Frame } from './frames';
import { passOf, type Cut, type ScoreInk } from './model';

/** Whether cut `c` shows `m`, a marking of its page: its anchor between the cut's top and bottom (ends included), and no pass or the cut's. */
export function shows(c: Cut, m: Marking): boolean {
  const y = anchorOf(m)[1];
  return y >= c.y0 && y <= c.y1 && (m.pass === undefined || m.pass === passOf(c));
}

/** The markings `c` shows, in their order in its page's ink. */
export const shownBy = (c: Cut, ink: ScoreInk): Marking[] => (ink[c.page] ?? []).filter((m) => shows(c, m));

/**
 * Give a marking made on a frame to the cut holding its anchor (the first, at a seam; the nearest
 * cut, if none does), with its points converted to that cut's page, so that cut shows it, as
 * `shows` decides. Frame points have x as a fraction of the frame width and y in page widths from
 * the frame's top.
 */
export function claimMarking(frame: Frame, m: Marking, aspects: readonly number[]): { cut: Cut; marking: Marking } | null {
  if (!frame.items.length) return null;
  const y = anchorOf(m)[1];
  const gap = (p: Frame['items'][number]) => Math.max(p.top - y, y - (p.top + p.h), 0);
  const best = frame.items.reduce((a, b) => (gap(b) < gap(a) ? b : a));
  const { cut, top } = best, a = aspects[cut.page];
  return { cut, marking: mapMarking(m, ([x, y, p]): Point => [x, cut.y0 + (y - top) / a, p]) };
}
