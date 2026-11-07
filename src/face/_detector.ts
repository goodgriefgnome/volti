// Turning frames into page turns: which gestures are on, for how long, and how close each
// direction is to turning, for the button's ring. Pure: the watcher gives it each frame.

import { GESTURES, measure, otherEye, type FaceFrame, type FaceGesture, type FaceSettings, type GestureTune, type TurnDir } from './gestures';

/** How close a direction is to turning, each 0..1: `near` the score to its threshold, `hold` the time held. */
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

/** Whether the other eye of a wink is under its level (always true for the other gestures). */
function otherUnder(g: FaceGesture, t: GestureTune, f: FaceFrame): boolean {
  const o = otherEye(g, f);
  return o === undefined || o < (t.otherBelow ?? 0);
}

/** Whether a gesture is on in a frame. */
function isOn(g: FaceGesture, t: GestureTune, f: FaceFrame): boolean {
  return measure(g, f) > t.threshold && otherUnder(g, t, f);
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
    if (t.direction === 'none' || !f || !isOn(id, t, f)) {
      state[id] = { turned: false };
      // A wink whose other eye isn't under its level shows nothing; the others fall under their threshold.
      if (t.direction !== 'none' && f && otherUnder(id, t, f)) {
        bump(progress[t.direction], Math.max(0, Math.min(1, measure(id, f) / t.threshold)), 0);
      }
      continue;
    }
    let seen = state[id];
    if (!seen.turned) {
      const since = seen.since ?? now;
      seen = { since, turned: false };
      if (!turn && now - since >= t.hold) {
        turn = t.direction;
        seen = { turned: true };
      }
      state[id] = seen;
    }
    if (!seen.turned) bump(progress[t.direction], Math.min(1, measure(id, f) / t.threshold), Math.min(1, (now - seen.since!) / t.hold));
  }
  return { state, turn, progress };
}

function bump(p: Progress, near: number, hold: number) {
  p.near = Math.max(p.near, near);
  p.hold = Math.max(p.hold, hold);
}
