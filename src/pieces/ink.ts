import type { Point, Stroke } from '../ink/model';
import type { Frame } from './frames';
import type { Cut, PieceInk } from './model';

/**
 * How much of a path lies between lo and hi in y, as a fraction of its length. Lengths are in
 * page widths, so y is scaled by `aspect`. A path of no length counts as wholly where it starts.
 */
export function share(points: readonly Point[], lo: number, hi: number, aspect: number): number {
  let inside = 0, total = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i];
    const len = Math.hypot(bx - ax, (by - ay) * aspect);
    if (!len) continue;
    total += len;
    const top = Math.min(ay, by), bottom = Math.max(ay, by);
    if (bottom === top) { if (top >= lo && top <= hi) inside += len; continue; }
    inside += len * Math.max(0, Math.min(hi, bottom) - Math.max(lo, top)) / (bottom - top);
  }
  if (!total) return points.length && points[0][1] >= lo && points[0][1] <= hi ? 1 : 0;
  return inside / total;
}

/** A cut shows a stroke, unclipped, when most of the stroke lies within the cut. */
export const visible = (s: Stroke, c: Cut, aspect: number) => share(s.points, c.y0, c.y1, aspect) > 0.5;

/** Strokes above and below y, each going to the side that holds most of it. */
export function splitStrokes(strokes: readonly Stroke[], y: number, aspect: number): [Stroke[], Stroke[]] {
  const up: Stroke[] = [], down: Stroke[] = [];
  for (const s of strokes) (share(s.points, -Infinity, y, aspect) >= 0.5 ? up : down).push(s);
  return [up, down];
}

/**
 * The markings from the first time each part of a page is played: walk the page's cuts in
 * played order and take each stroke that lies mostly in that cut and not in one walked before.
 */
export function claimFirstPass(cuts: readonly Cut[], ink: PieceInk, aspect: number): Stroke[] {
  const out: Stroke[] = [], walked: [number, number][] = [];
  for (const c of cuts) {
    for (const s of ink[c.id] ?? []) {
      if (share(s.points, c.y0, c.y1, aspect) <= 0.5) continue;
      const before = walked.reduce((sum, [lo, hi]) => sum + share(s.points, lo, hi, aspect), 0);
      if (before <= 0.5) out.push(s);
    }
    walked.push([c.y0, c.y1]);
  }
  return out;
}

/**
 * Give a stroke drawn on a frame to the cut that holds most of it (the nearest cut, if none
 * does), with its points converted to that cut's page. Frame points have x as a fraction of
 * the frame width and y in page widths from the frame's top.
 */
export function claimStroke(frame: Frame, stroke: Stroke, aspects: readonly number[]): { cut: Cut; stroke: Stroke } | null {
  if (!frame.items.length) return null;
  let best = frame.items[0], most = -1;
  for (const p of frame.items) {
    const v = share(stroke.points, p.top, p.top + p.h, 1);
    if (v > most) { best = p; most = v; }
  }
  if (most <= 0) {
    const y = stroke.points[0][1];
    const gap = (p: Frame['items'][number]) => Math.max(p.top - y, y - (p.top + p.h), 0);
    best = frame.items.reduce((a, b) => (gap(b) < gap(a) ? b : a));
  }
  const { cut, top } = best, a = aspects[cut.page];
  const points = stroke.points.map(([x, y, p]): Point => [x, cut.y0 + (y - top) / a, p]);
  return { cut, stroke: { ...stroke, points } };
}
