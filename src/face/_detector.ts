// Turning frames into page turns: which gestures are on, for how long, and how close each
// direction is to turning, for the button's ring. Pure: the watcher gives it each frame.

import { GESTURES, measure, type FaceFrame, type FaceGesture, type FaceSettings, type GestureTune, type TurnDir } from './gestures';

/** How close a direction is to turning, each 0..1: `near` the signal from its release level to its on level, `hold` the time held. */
export interface Progress { near: number; hold: number }

interface Seen {
  /** Since when it has been on (ms), while it waits for its hold. */
  since?: number;
  /** It turned, and hasn't been let go since. */
  turned: boolean;
}
export type DetectorState = Record<FaceGesture, Seen>;

export const NEW_DETECTOR: DetectorState = Object.fromEntries(GESTURES.map((g) => [g.id, { turned: false }])) as DetectorState;

const NONE: Record<TurnDir, Progress> = { next: { near: 0, hold: 0 }, prev: { near: 0, hold: 0 } };

/** How close a signal is to its on level, counted from its release level: 0..1. */
function near(v: number, t: GestureTune): number {
  if (t.threshold <= t.release) return v > t.threshold ? 1 : 0;
  return Math.max(0, Math.min(1, (v - t.release) / (t.threshold - t.release)));
}

/**
 * One frame at `now` (ms), or `null` for a frame without a face (which lets every gesture go).
 * Gives the turn this frame makes, if any, and each direction's progress for the ring.
 */
export function step(s: DetectorState, f: FaceFrame | null, settings: FaceSettings, now: number):
  { state: DetectorState; turn?: TurnDir; progress: Record<TurnDir, Progress> } {
  const state = { ...s };
  const progress = { next: { ...NONE.next }, prev: { ...NONE.prev } };
  let turn: TurnDir | undefined;
  for (const { id } of GESTURES) {
    const t = settings[id];
    if (t.direction === 'none' || !f) {
      state[id] = { turned: false };
      continue;
    }
    const was = s[id];
    const held = was.since !== undefined || was.turned;
    const v = measure(id, f);
    if (!(held ? v > t.release : v > t.threshold)) {
      state[id] = { turned: false };
      bump(progress[t.direction], near(v, t), 0);
      continue;
    }
    if (was.turned) continue;
    const since = was.since ?? now;
    if (!turn && now - since >= t.hold) {
      turn = t.direction;
      state[id] = { turned: true };
      continue;
    }
    state[id] = { since, turned: false };
    bump(progress[t.direction], 1, Math.min(1, (now - since) / t.hold));
  }
  return { state, turn, progress };
}

function bump(p: Progress, near: number, hold: number) {
  p.near = Math.max(p.near, near);
  p.hold = Math.max(p.hold, hold);
}
