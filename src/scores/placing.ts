// Placed markings on a frame: where they are, which one is at a point, and moving them. Pure.

import { emExtent, type PlacedMark } from '../markings/placed';
import type { Frame, Placed } from './frames';
import type { Aspects, Cut, ScoreInk } from './model';
import { visible } from './ownership';

/** A placed marking chosen on the music: the cut that holds it, and the marking itself (found in the ink by identity). */
export interface Selected { cut: string; mark: PlacedMark }

type Box = [x0: number, y0: number, x1: number, y1: number];

/** A placed marking's extent on a frame: x in frame widths, y in frame widths from its top. */
export function extentOnFrame(item: Placed, m: PlacedMark, aspect: number): Box | undefined {
  const e = emExtent(m);
  if (!e) return undefined;
  const x = m.at[0], y = item.top + (m.at[1] - item.cut.y0) * aspect;
  return [x + e[0] * m.size, y + e[1] * m.size, x + e[2] * m.size, y + e[3] * m.size];
}

/**
 * The placed marking shown on the frame whose extent, grown by `margin`, holds p (frame
 * coordinates): the one drawn last first.
 */
export function placedAt(frame: Frame, ink: ScoreInk, aspects: Aspects, p: readonly [number, number], margin: number): { cut: Cut; mark: PlacedMark } | undefined {
  for (const item of [...frame.items].reverse()) {
    const aspect = aspects[item.cut.page];
    const list = ink[item.cut.id] ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (!('kind' in m) || !visible(m, item.cut, aspect)) continue;
      const e = extentOnFrame(item, m, aspect);
      if (e && p[0] >= e[0] - margin && p[0] <= e[2] + margin && p[1] >= e[1] - margin && p[1] <= e[3] + margin) return { cut: item.cut, mark: m };
    }
  }
  return undefined;
}
