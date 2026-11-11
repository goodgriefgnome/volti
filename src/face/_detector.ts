// Turning frames into page turns: which gestures are on, for how long, and how close each
// direction is to turning, for the button's ring. Pure: the watcher gives it each frame.

import type { Active, TurnDir } from './gestures';
import { score } from './template';

/** How close a direction is to turning, each 0..1: `near` the signal from its release level to its on level, `hold` the time held. */
export interface Progress { near: number; hold: number }

interface Seen {
  /** Since when it has been on (ms), while it waits for its hold. */
  since?: number;
  /** It turned, and hasn't been let go since. */
  turned: boolean;
}
/** What each gesture has seen, by its id. */
export type DetectorState = Record<string, Seen>;

export const NEW_DETECTOR: DetectorState = {};

const NONE: Record<TurnDir, Progress> = { next: { near: 0, hold: 0 }, prev: { near: 0, hold: 0 } };

/** How close a signal is to its on level, counted from its release level: 0..1. */
function near(v: number, g: Active): number {
  if (g.on <= g.release) return v >= g.on ? 1 : 0;
  return Math.max(0, Math.min(1, (v - g.release) / (g.on - g.release)));
}

/**
 * One frame's channels at `now` (ms), or `null` for a frame without a face (which lets every gesture
 * go). Gives the turn this frame makes, if any, and each direction's progress for the ring.
 */
export function step(s: DetectorState, x: Float32Array | null, active: Active[], now: number):
  { state: DetectorState; turn?: TurnDir; progress: Record<TurnDir, Progress> } {
  const state: DetectorState = {};
  const progress = { next: { ...NONE.next }, prev: { ...NONE.prev } };
  let turn: TurnDir | undefined;
  for (const g of active) {
    if (!x) {
      state[g.id] = { turned: false };
      continue;
    }
    const was = s[g.id] ?? { turned: false };
    const held = was.since !== undefined || was.turned;
    const y = score(g.template, x);
    if (!(held ? y >= g.release : y >= g.on)) {
      state[g.id] = { turned: false };
      bump(progress[g.direction], near(y, g), 0);
      continue;
    }
    if (was.turned) {
      state[g.id] = was;
      continue;
    }
    const since = was.since ?? now;
    if (!turn && now - since >= g.hold) {
      turn = g.direction;
      state[g.id] = { turned: true };
      continue;
    }
    state[g.id] = { since, turned: false };
    bump(progress[g.direction], 1, Math.min(1, (now - since) / g.hold));
  }
  return { state, turn, progress };
}

function bump(p: Progress, near: number, hold: number) {
  p.near = Math.max(p.near, near);
  p.hold = Math.max(p.hold, hold);
}
