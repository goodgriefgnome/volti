// Placed markings on a frame: where they are, which one is at a point, moving them, and giving one
// its cut's pass. Pure.

import { compactMarking, hitDistance, type Marking, type Point } from '../markings/model';
import { markExtent, type PlacedMark } from '../markings/placed';
import { passesOf, replaceMarking, setInk } from './edits';
import type { Frame, Placed } from './frames';
import { passOf, type Aspects, type Cut, type Score, type ScoreInk, type State } from './model';
import { claimMarking, shownBy } from './ownership';

/** A placed marking chosen on the music: the page whose ink holds it, the marking itself (found there by identity), and the cut it was chosen in, which shows it. */
export interface Selected { page: number; cut: string; mark: PlacedMark }

type Box = [x0: number, y0: number, x1: number, y1: number];

/** A placed marking's extent on a frame, with its background: x in frame widths, y in frame widths from its top. */
export function extentOnFrame(item: Placed, m: PlacedMark, aspect: number): Box | undefined {
  const e = markExtent(m);
  if (!e) return undefined;
  const x = m.at[0], y = item.top + (m.at[1] - item.cut.y0) * aspect;
  return [x + e[0] * m.size, y + e[1] * m.size, x + e[2] * m.size, y + e[3] * m.size];
}

/** A placed marking's centre on a frame, in the same coordinates as its extent. */
export function centreOnFrame(item: Placed, m: PlacedMark, aspect: number): [number, number] {
  return [m.at[0], item.top + (m.at[1] - item.cut.y0) * aspect];
}

/** The least a selected marking's box measures on screen, each way, in CSS pixels. */
export const MIN_BOX_PX = 24;

/**
 * The box shown round a selected marking: its extent grown, where smaller than `minFrame` (frame
 * widths) either way, to that, keeping its centre.
 */
export function selectionBox(ext: Box, minFrame: number): Box {
  const [x0, y0, x1, y1] = ext;
  const gx = Math.max(0, minFrame - (x1 - x0)) / 2, gy = Math.max(0, minFrame - (y1 - y0)) / 2;
  return [x0 - gx, y0 - gy, x1 + gx, y1 + gy];
}

/** The radius of a corner handle, in CSS pixels, for a box whose shorter side measures `shortSidePx`. */
export function handleRadius(shortSidePx: number): number {
  return Math.min(shortSidePx / 4, 8);
}

/**
 * What a press at p is on, given the selected marking's box and the handle radius `r` (the same
 * units as the box): a handle (outside the box, within `r` of a corner; the nearest corner when
 * two discs meet), the box itself (its edge included), or neither.
 */
export function pressOnSelection(box: Box, r: number, p: readonly [number, number]): { kind: 'handle'; corner: 0 | 1 | 2 | 3 } | { kind: 'box' } | undefined {
  const [x0, y0, x1, y1] = box;
  if (p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1) return { kind: 'box' };
  const corners: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const dist = corners.map(([x, y]) => Math.hypot(x - p[0], y - p[1]));
  const corner = dist.indexOf(Math.min(...dist)) as 0 | 1 | 2 | 3;
  return dist[corner] <= r ? { kind: 'handle', corner } : undefined;
}

/**
 * The marking shown on the frame with the least `hitDistance` from p (frame coordinates) within
 * `radius` (frame widths), among those `owned`; of those as near, the one drawn last.
 */
export function markingAt(
  frame: Frame, ink: ScoreInk, aspects: Aspects, p: readonly [number, number], radius: number, owned: (m: Marking) => boolean,
): { cut: Cut; mark: Marking } | undefined {
  let best: { cut: Cut; mark: Marking } | undefined, nearest = Infinity;
  for (const item of frame.items) {
    const { cut } = item, aspect = aspects[cut.page];
    // The point on this cut's page; a frame is a page wide, so frame widths are page widths.
    const q: Point = [p[0], cut.y0 + (p[1] - item.top) / aspect, 0];
    for (const m of shownBy(cut, ink)) {
      if (!owned(m)) continue;
      const d = hitDistance(m, q, radius, aspect);
      if (d !== undefined && d <= nearest) { nearest = d; best = { cut, mark: m }; }
    }
  }
  return best;
}

/** The smallest a resize makes a marking, as a share of its size. */
const MIN_SCALE = 0.25;

/**
 * Its centre and size after a corner of its extent (0 top left, 1 top right, 2 bottom right, 3
 * bottom left) is dragged to p, the opposite corner staying; never under 1/4 of its size. `at` is
 * its centre in the extent's coordinates. It scales by the drag's projection onto the line from
 * the fixed corner to the dragged one.
 */
export function resizedFrom(ext: Box, corner: 0 | 1 | 2 | 3, p: readonly [number, number], at: readonly [number, number], size: number): { at: [number, number]; size: number } {
  const [x0, y0, x1, y1] = ext;
  const corners: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const dragged = corners[corner], fixed = corners[(corner + 2) % 4];
  const vx = dragged[0] - fixed[0], vy = dragged[1] - fixed[1], len2 = vx * vx + vy * vy;
  if (!len2) return { at: [at[0], at[1]], size };
  const k = Math.max(MIN_SCALE, ((p[0] - fixed[0]) * vx + (p[1] - fixed[1]) * vy) / len2);
  return { at: [fixed[0] + (at[0] - fixed[0]) * k, fixed[1] + (at[1] - fixed[1]) * k], size: size * k };
}

/**
 * The state with a placed marking moved to `at` on the frame (frame coordinates) and, when `size`
 * is given, resized, put on the page of the cut holding most of it; and the marking as it is now.
 * A marking with a pass takes that cut's; one without stays without. `content` is spread over the
 * moved marking, for its new text, font and glyphs.
 */
export function movedTo(
  s: State, frame: Frame, from: Selected, at: readonly [number, number], aspects: Aspects, size = from.mark.size, content: Partial<PlacedMark> = {},
): { state: State; selected: Selected } {
  const claimed = claimMarking(frame, { ...from.mark, ...content, at: [at[0], at[1]], size }, aspects);
  if (!claimed) return { state: s, selected: from };
  const moved = compactMarking(claimed.marking) as PlacedMark;
  const mark = moved.pass === undefined ? moved : { ...moved, pass: passOf(claimed.cut) };
  const page = claimed.cut.page;
  const state = page === from.page
    ? replaceMarking(s, page, from.mark, mark)
    : (() => { const left = replaceMarking(s, from.page, from.mark); return setInk(left, page, [...(left.ink[page] ?? []), mark]); })();
  return { state, selected: { page, cut: claimed.cut.id, mark } };
}

/**
 * The "This time only" toggle for a selection: 'on' when its marking has a pass, 'off' when not;
 * undefined (hidden) when its page's cuts all have one pass and the marking has none.
 */
export function thisTimeOnly(score: Score, sel: Selected): 'on' | 'off' | undefined {
  if (sel.mark.pass !== undefined) return 'on';
  return passesOf(score, [sel.page]).length > 1 ? 'off' : undefined;
}

/** The state with the selected marking given its cut's pass (on) or none (off), and the marking as it is then. */
export function setThisTimeOnly(s: State, sel: Selected, on: boolean): { state: State; selected: Selected } {
  const cut = s.score.cuts.find((c) => c.id === sel.cut);
  const { pass: _, ...rest } = sel.mark;
  const mark: PlacedMark = on ? { ...rest, pass: cut ? passOf(cut) : 1 } : rest;
  return { state: replaceMarking(s, sel.page, sel.mark, mark), selected: { ...sel, mark } };
}
