// Frames made up for the face tests: a trial's frames from the channels that are held, with a small
// jitter from a seeded generator (not Math.random, so the tests are the same every run). Not part
// of the app; only tests import it.

import { CHANNELS } from './template';
import type { TrialFrames } from './template';

/** A seeded generator, 0 to 1 (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Channel values by name. */
export type Values = Record<string, number>;

/** One frame: every channel at its value in `values`, else 0, each moved by up to ±`jitter`, never under 0. */
export function frameOf(values: Values, random: () => number, jitter = 0.01): Float32Array {
  const x = new Float32Array(CHANNELS.length);
  for (const name in values) {
    const i = CHANNELS.indexOf(name);
    if (i < 0) throw new Error(`No channel ${name}`);
    x[i] = Math.max(0, values[name] + (random() * 2 - 1) * jitter);
  }
  return x;
}

/**
 * A trial's frames: `held` frames with the `held` values, and `rest` with the `rest` values (a
 * channel in only one of them is 0 in the other), with their times at 67 ms steps.
 */
export function trialOf(held: Values, rest: Values, random: () => number, counts = { held: 40, rest: 60 }): TrialFrames {
  const heldAt = { ...Object.fromEntries(Object.keys(rest).map((k) => [k, 0])), ...held };
  const restAt = { ...Object.fromEntries(Object.keys(held).map((k) => [k, 0])), ...rest };
  return {
    held: Array.from({ length: counts.held }, () => frameOf(heldAt, random)),
    rest: Array.from({ length: counts.rest }, () => frameOf(restAt, random)),
    restT: Array.from({ length: counts.rest }, (_, i) => i * 67),
  };
}
