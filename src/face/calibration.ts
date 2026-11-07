// Working out a gesture's on and release levels from what the person does: their resting level,
// their attempts at the gesture, and the levels between the two. Pure: the dialog collects the
// samples (face/gestures.ts `measure` of each frame) and asks for the results.

import { clamp, thresholdRange, GESTURES, type FaceGesture, type GestureTune } from './gestures';

/** The 95th percentile of a gesture's measures while resting. */
export function restLevel(samples: number[]): number {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];
}

/**
 * The attempts in a gesture step's samples, each its peak. An attempt starts when a value goes over
 * a line, rest plus half the way to the highest value so far, and ends when one falls back under it.
 */
export function attempts(samples: number[], rest: number): number[] {
  const found: number[] = [];
  let highest = rest;
  let current = -1;
  for (const v of samples) {
    highest = Math.max(highest, v);
    const line = rest + (highest - rest) / 2;
    if (v > line) {
      if (current < 0) {
        current = found.length;
        found.push(v);
      } else if (v > found[current]) found[current] = v;
    } else current = -1;
  }
  return found;
}

/** How far over the rest level the lowest peak must be: a score, or degrees for the head and nod. */
const MIN_GAP = { score: 0.15, angle: 8 } as const;
/** How many attempts a step asks for. */
export const ATTEMPTS = 3;

/** The calibrated tune for a gesture, or why it isn't reliable. */
export function calibrated(g: FaceGesture, tune: GestureTune, rest: number, peaks: number[]):
  { tune: GestureTune } | { unreliable: true } {
  const kind = GESTURES.find((x) => x.id === g)!.kind;
  if (peaks.length < ATTEMPTS) return { unreliable: true };
  const lowest = Math.min(...peaks);
  if (lowest - rest < MIN_GAP[kind]) return { unreliable: true };
  const r = thresholdRange(g);
  const threshold = clamp(rest + 0.4 * (lowest - rest), r.min, r.max);
  const release = clamp(rest + (threshold - rest) / 2, r.min, threshold);
  return { tune: { ...tune, threshold, release } };
}
