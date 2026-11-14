// Recording a gesture's trials: a trial as stored, its held and rest frames, a trial's timetable of
// tones, and a recorder that takes its frames. docs/face-classifier-spec.md says how a trial goes.
// Pure: no DOM, no audio, no storage (_tones.ts plays the tones, _recording-screen.ts drives the recording).

import { CHANNELS, type TrialFrames } from './_template';

/** What a stored frame holds: its time (ms from the trial's start), the 52 channels, yaw and pitch (degrees). */
export const STRIDE = 55;
/** A trial as stored: the times of its third tones (ms from its start), its frames, and how many. */
export interface Trial { tUp: number; tDown: number; n: number; data: Float32Array; /** Kept, but left out of the fit. */ disabled?: true }

/** Frames this close to a third tone (ms) are left out: the change is expected within that second. */
export const GUARD = 500;

/** A trial's held and rest frames, by the labels of face-classifier-spec.md (500 ms either side of each tone left out). */
export function framesOf(t: Trial): TrialFrames {
  const out: TrialFrames = { held: [], rest: [], restT: [] };
  for (let i = 0; i < t.n; i++) {
    const o = i * STRIDE;
    const at = t.data[o];
    if (Math.abs(at - t.tUp) < GUARD || Math.abs(at - t.tDown) < GUARD) continue;
    const x = t.data.slice(o + 1, o + 1 + CHANNELS.length);
    if (at > t.tUp && at < t.tDown) out.held.push(x);
    else {
      out.rest.push(x);
      out.restT.push(at);
    }
  }
  return out;
}

/** A trial's timetable, in ms from its start: the rising and falling tones (three each), and its end. */
export interface TrialPlan { ups: number[]; downs: number[]; end: number }

/** A trial's timetable: a lead-in of 2 to 4 s, a hold of 3 to 5 s, 2 s after; `random` gives 0 to 1. */
export function planTrial(random: () => number): TrialPlan {
  const lead = 2000 + 2000 * random();
  const hold = 3000 + 2000 * random();
  const ups = [lead, lead + 1000, lead + 2000];
  const downs = [lead + hold, lead + hold + 1000, lead + hold + 2000];
  return { ups, downs, end: downs[2] + 2000 };
}

/** The tones' pitches (Hz), rising; falling is the reverse. The third of each is TONE_LONG_MS long, the others TONE_MS. */
export const TONES: readonly number[] = [523, 659, 784];
export const TONE_MS = 120;
export const TONE_LONG_MS = 250;
/** The least held and rest frames a trial must have to be kept. */
export const MIN_FRAMES = 15;

/** Collects one trial's frames. */
export interface Recorder {
  /** A frame at `t` (ms from the trial's start). */
  push(t: number, x: Float32Array, yaw: number, pitch: number): void;
  /** The trial, given when its third tones were heard; undefined when it has too few held or rest frames. */
  finish(tUp: number, tDown: number): Trial | undefined;
}

export function recorder(): Recorder {
  const rows: number[] = [];
  return {
    push(t, x, yaw, pitch) {
      rows.push(t, ...x, yaw, pitch);
    },
    finish(tUp, tDown) {
      const trial = { tUp, tDown, n: rows.length / STRIDE, data: Float32Array.from(rows) };
      const { held, rest } = framesOf(trial);
      return held.length < MIN_FRAMES || rest.length < MIN_FRAMES ? undefined : trial;
    },
  };
}
