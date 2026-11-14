// Turning frames into page turns, by direction: each direction has a fill that rises while any of
// its gestures is on and drains while none is, and turns the page when it is full; and how close
// each direction is to turning, for the button's ring. Pure: the watcher gives it each frame.

import type { Active, TurnDir } from './gestures';
import { strength } from './_template';

/** How close a direction is to turning, each 0..1: `near` the largest share of the way from a gesture's zero point to its On, `hold` its fill over the hold. */
export interface Progress { near: number; hold: number }

/** How fast the fill moves toward turning, and away from it, per ms of frame time. */
const FILL_RATE = 1;
const DRAIN_RATE = 2;
/** The most frame time counted (ms), so a stall doesn't jump the fill. */
const MAX_STEP_MS = 200;

/** A direction's fill (ms, 0 to the hold), and whether it has turned and not yet been let go. */
interface DirectionState { fill: number; spent: boolean }
/** The time of the last frame (ms), and each direction's fill. */
export interface DetectorState { last?: number; next: DirectionState; prev: DirectionState }

const ARMED: DirectionState = { fill: 0, spent: false };
export const NEW_DETECTOR: DetectorState = { next: ARMED, prev: ARMED };

const DIRECTIONS: TurnDir[] = ['next', 'prev'];

/** How close a strength is to a gesture's On, counted from its zero point: 0..1. */
function near(y: number, g: Active): number {
  if (g.on <= g.zero) return y >= g.on ? 1 : 0;
  return Math.max(0, Math.min(1, (y - g.zero) / (g.on - g.zero)));
}

/**
 * One frame's channels at `now` (ms), or `null` for a frame without a face (which lets both
 * directions go: armed, at 0). A direction is on when any of its gestures has reached its On.
 * Armed, its fill rises while it is on and falls twice as fast while it isn't, and at the hold it
 * turns and is spent; spent, it falls while it isn't on and rises twice as fast while it is, and at
 * 0 it is armed again. One turn at a time: when a direction turns, the other is spent too, and if
 * both would turn on the same frame, Next does. Gives the turn this frame makes, if any, and each
 * direction's progress for the ring.
 */
export function step(s: DetectorState, x: Float32Array | null, active: Active[], now: number):
  { state: DetectorState; turn?: TurnDir; progress: Record<TurnDir, Progress> } {
  const progress: Record<TurnDir, Progress> = { next: { near: 0, hold: 0 }, prev: { near: 0, hold: 0 } };
  if (!x) return { state: { ...NEW_DETECTOR, last: now }, progress };
  const dt = s.last === undefined ? 0 : Math.min(MAX_STEP_MS, now - s.last);
  const state: DetectorState = { last: now, next: s.next, prev: s.prev };
  let turn: TurnDir | undefined;
  const holds: Record<TurnDir, number> = { next: 0, prev: 0 };
  for (const dir of DIRECTIONS) {
    const gestures = active.filter((g) => g.direction === dir);
    if (!gestures.length) continue;
    const hold = holds[dir] = gestures[0].hold;
    let on = false;
    let closest = 0;
    for (const g of gestures) {
      const y = strength(g.template, x);
      if (y >= g.on) on = true;
      closest = Math.max(closest, near(y, g));
    }
    let { fill, spent } = s[dir];
    if (spent) {
      fill = on ? Math.min(hold, fill + DRAIN_RATE * dt) : fill - FILL_RATE * dt;
      if (fill <= 0) {
        fill = 0;
        spent = false;
      }
    } else {
      fill = on ? fill + FILL_RATE * dt : Math.max(0, fill - DRAIN_RATE * dt);
      if (fill >= hold) {
        fill = hold;
        // Another direction may have turned already this frame: this one is spent below.
        if (!turn) {
          turn = dir;
          spent = true;
        }
      }
    }
    state[dir] = { fill, spent };
    progress[dir] = { near: closest, hold: fill / hold };
  }
  if (turn) {
    // One turn at a time: the other direction is spent with its fill full.
    const other: TurnDir = turn === 'next' ? 'prev' : 'next';
    state[other] = { fill: holds[other], spent: true };
    if (holds[other]) progress[other] = { near: progress[other].near, hold: 1 };
  }
  return { state, turn, progress };
}
