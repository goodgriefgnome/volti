// A gesture's fit: what its trials give (its template, its levels, its flags), and the check that
// gestures turning pages don't conflict. A port of the prototype's `build`, `firesOn`, `conflictOf` and `settle`
// of public/lab/face-classifier.html; docs/face-classifier-spec.md says what they must be. Pure.

import type { GestureChannels } from './gestures';
import { framesOf, type Trial } from './_recording';
import { CHANNELS, fit, median, quantile, strength, type Template } from './_template';

/** Raised when fitting changes what it computes: stored fits of an earlier version are fitted again. */
export const FIT_VERSION = 2;
export const MIN_TRIALS = 3;

/** How far over the rest level the lowest rep must be. */
const MIN_GAP = 0.15;
/** On is this share of the way from the rest level to the lowest rep's peak. */
const ON_FRAC = 0.65;
/** Rest frames more than this far apart (ms) are not one run. */
const RUN_GAP = 200;
/** What one frame stands for, in ms: the app's 15 frames a second. */
const FRAME_MS = 67;

export type Flag =
  | { kind: 'tooFew' }
  | { kind: 'noChannels' }
  | { kind: 'unreliable' }
  | { kind: 'firesAtRest'; frames: number; ms: number };

/** What a gesture's trials give: stored with the gesture. Fitted when it has `template`. `trials` counts the enabled ones. */
export interface Fit {
  version: number;
  trials: number;
  flags: Flag[];
  template?: Template;
  /** The fitted On level, the rest level, and each trial's peak; with `template`. Release is halfway from the rest level to On (gestures.ts). */
  on?: number;
  rest?: number;
  peaks?: number[];
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * A gesture's fit from its enabled trials (a disabled one is kept but left out) and the changes
 * made to its channels: its template, its
 * levels (the rest level is the 95th percentile of the strength over rest frames; each trial's peak
 * is its median held strength against a template fitted without it), and what is wrong with it.
 */
export function buildFit(all: Trial[], channels?: GestureChannels): Fit {
  const trials = all.filter((t) => !t.disabled);
  const out: Fit = { version: FIT_VERSION, trials: trials.length, flags: [] };
  if (trials.length < MIN_TRIALS) {
    out.flags.push({ kind: 'tooFew' });
    return out;
  }
  const frames = trials.map(framesOf);
  const template = fit(frames, channels);
  if (!template.rows.length) {
    out.flags.push({ kind: 'noChannels' });
    return out;
  }
  const rest = quantile(frames.flatMap((t) => t.rest.map((x) => strength(template, x))), 0.95);
  const peaks = frames.map((t, i) => {
    const without = fit(frames.filter((_, j) => j !== i), channels);
    return without.rows.length ? median(t.held.map((x) => strength(without, x))) : 0;
  });
  const lowest = Math.min(...peaks);
  if (lowest - rest < MIN_GAP) out.flags.push({ kind: 'unreliable' });
  const on = clamp(rest + ON_FRAC * (lowest - rest), 0.05, 0.95);
  // Rest frames that match, each on its own: how many, and the longest run of them.
  let restHits = 0;
  let longest = 0;
  for (const t of frames) {
    let from = -1;
    let last = -1;
    t.rest.forEach((x, i) => {
      const at = t.restT[i];
      if (strength(template, x) >= on) {
        restHits++;
        if (from < 0 || at - last > RUN_GAP) from = at;
        last = at;
        longest = Math.max(longest, last - from + FRAME_MS);
      } else from = -1;
    });
  }
  if (restHits) out.flags.push({ kind: 'firesAtRest', frames: restHits, ms: Math.round(longest) });
  return { ...out, template, on, rest, peaks };
}

/** A flag in words, as face-gestures-spec.md has them. */
export function flagText(f: Flag): string {
  switch (f.kind) {
    case 'tooFew': return `Record at least three trials.`;
    case 'noChannels': return `Can't be told from playing: no channel's held values are clear of its values at rest.`;
    case 'unreliable': return `Unreliable: a trial left out of the fit has little more strength than rest.`;
    case 'firesAtRest': return `Fires while resting: ${f.frames} ${f.frames === 1 ? 'frame' : 'frames'}, ${f.ms} ms at the longest.`;
  }
}

/** A gesture as the conflict check sees it. */
export interface Contender {
  id: string;
  name: string;
  template: Template;
  release: number;
  /** Each rep's held frames. */
  held: Float32Array[][];
}

/** `j`'s strength on `i`'s gesture (the highest of its reps' median held strengths), if it reaches `j`'s release level: `j` would stay on through it. */
function firesOn(j: Contender, i: Contender): number | undefined {
  let y = -Infinity;
  for (const rep of i.held) {
    if (!rep.length) continue;
    y = Math.max(y, median(rep.map((x) => strength(j.template, x))));
  }
  return y >= j.release ? y : undefined;
}

const movingNames = (c: Contender) => c.template.rows.map((r) => CHANNELS[r.c]);

/** Why `a` can't turn pages beside `b`, in words, or undefined. */
export function conflictOf(a: Contender, b: Contender): string | undefined {
  const A = movingNames(a);
  const B = movingNames(b);
  const shared = A.filter((n) => B.includes(n));
  const why = (j: Contender, y: number, own: string[]) =>
    `its strength is ${y.toFixed(2)}, and its release is ${j.release.toFixed(2)}. ${shared.length ? `Both are ${shared.join(', ')}` : `It only needs ${own.join(', ')}`}`;
  let y = firesOn(b, a);
  if (y !== undefined) return `“${b.name}” also fires on it: ${why(b, y, B)}`;
  y = firesOn(a, b);
  if (y !== undefined) return `it also fires on “${b.name}”: ${why(a, y, A)}`;
  return undefined;
}

/**
 * Of `contenders` in order (with the one whose id is `changedId` moved last), the ids of those that
 * conflict with one already let through, each with why.
 */
export function settle(contenders: Contender[], changedId?: string): Map<string, string> {
  const order = [...contenders.filter((c) => c.id !== changedId), ...contenders.filter((c) => c.id === changedId)];
  const through: Contender[] = [];
  const out = new Map<string, string>();
  for (const c of order) {
    let why: string | undefined;
    for (const o of through) if ((why = conflictOf(c, o))) break;
    if (why) out.set(c.id, why);
    else through.push(c);
  }
  return out;
}
