// Working out a gesture's threshold from what the person does: their resting level, their
// attempts at the gesture, and the threshold between the two. Pure: the dialog collects the
// samples (face/gestures.ts `measure` of each frame) and asks for the results.

import { clamp, OTHER_RANGE, thresholdRange, GESTURES, type FaceGesture, type GestureTune } from './gestures';

/** The 95th percentile of a gesture's measures while resting. */
export function restLevel(samples: number[]): number {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];
}

/**
 * The attempts in a gesture step's samples, each its peak (and, for winks, the other eye at it). An
 * attempt starts when a value goes over a line, rest plus half the way to the highest value so
 * far, and ends when one falls back under it.
 */
export function attempts(samples: { value: number; other?: number }[], rest: number): { peak: number; other?: number }[] {
  const found: { peak: number; other?: number }[] = [];
  let highest = rest;
  let current: { peak: number; other?: number } | undefined;
  for (const s of samples) {
    highest = Math.max(highest, s.value);
    const line = rest + (highest - rest) / 2;
    if (s.value > line) {
      if (!current) {
        current = { peak: s.value, other: s.other };
        found.push(current);
      } else if (s.value > current.peak) {
        current.peak = s.value;
        current.other = s.other;
      }
    } else current = undefined;
  }
  return found;
}

/** How far over the rest level the lowest peak must be: a score, or degrees for the head and nod. */
const MIN_GAP = { score: 0.15, angle: 8 } as const;
/** How many attempts a step asks for. */
export const ATTEMPTS = 3;

/** The calibrated tune for a gesture, or why it isn't reliable. */
export function calibrated(g: FaceGesture, tune: GestureTune, rest: number, found: { peak: number; other?: number }[]):
  { tune: GestureTune } | { unreliable: true } {
  const kind = GESTURES.find((x) => x.id === g)!.kind;
  if (found.length < ATTEMPTS) return { unreliable: true };
  const lowest = Math.min(...found.map((a) => a.peak));
  if (lowest - rest < MIN_GAP[kind]) return { unreliable: true };
  const r = thresholdRange(g);
  const threshold = clamp(rest + 0.4 * (lowest - rest), r.min, r.max);
  const out: GestureTune = { ...tune, threshold };
  if (tune.otherBelow !== undefined) {
    // Halfway between the other eye's highest score at the peaks and the new threshold.
    const others = found.map((a) => a.other ?? 0);
    out.otherBelow = clamp((Math.max(...others) + threshold) / 2, OTHER_RANGE.min, OTHER_RANGE.max);
  }
  return { tune: out };
}
