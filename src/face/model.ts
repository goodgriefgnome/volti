// A gesture's model: what its trials give (its template, its levels, its flags), and the check that
// gestures turning pages don't conflict. A port of the `build`, `firesOn`, `conflictOf` and `settle`
// of public/face-classifier.html; docs/face-classifier-spec.md says what they must be. Pure.

import { framesOf, type Trial } from './recording';
import { CHANNELS, fit, median, quantile, score, type Row, type Template } from './template';

/** Raised when fitting changes what it computes: stored fits of an earlier version are fitted again. */
export const FIT_VERSION = 1;
export const MIN_TRIALS = 3;

/** How far over the rest level the lowest rep must be. */
const MIN_GAP = 0.15;
/** On and Release as shares of the way: On from the rest level to the lowest rep's peak, Release from the rest level to On. */
const ON_FRAC = 0.65;
const REL_FRAC = 0.5;
/** Rest frames more than this far apart (ms) are not one run. */
const RUN_GAP = 200;
/** What one frame stands for, in ms: the app's 15 frames a second. */
const FRAME_MS = 67;

export type Flag =
  | { kind: 'tooFew' }
  | { kind: 'noChannels' }
  | { kind: 'unreliable' }
  | { kind: 'firesAtRest'; frames: number; ms: number };

/** What a gesture's trials give: stored with the gesture. Fitted when it has `template`. */
export interface Fit {
  version: number;
  trials: number;
  flags: Flag[];
  template?: Template;
  /** The fitted levels, the rest level, and each rep's peak; with `template`. */
  on?: number;
  release?: number;
  rest?: number;
  peaks?: number[];
  /** With no template: the clearest channels, for saying what nearly moved. */
  missed?: Row[];
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * A gesture's fit from its trials: its template, its levels (the rest level is the 95th percentile
 * of the score over rest frames; each rep's peak is its median held score against a template fitted
 * without it), and what is wrong with it.
 */
export function build(trials: Trial[]): Fit {
  const out: Fit = { version: FIT_VERSION, trials: trials.length, flags: [] };
  if (trials.length < MIN_TRIALS) {
    out.flags.push({ kind: 'tooFew' });
    return out;
  }
  const frames = trials.map(framesOf);
  const template = fit(frames);
  if (!template.rows.length) {
    out.flags.push({ kind: 'noChannels' });
    out.missed = template.missed;
    return out;
  }
  const rest = quantile(frames.flatMap((t) => t.rest.map((x) => score(template, x))), 0.95);
  const peaks = frames.map((t, i) => {
    const without = fit(frames.filter((_, j) => j !== i));
    return without.rows.length ? median(t.held.map((x) => score(without, x))) : 0;
  });
  const lowest = Math.min(...peaks);
  if (lowest - rest < MIN_GAP) out.flags.push({ kind: 'unreliable' });
  const on = clamp(rest + ON_FRAC * (lowest - rest), 0.05, 0.95);
  const release = rest + REL_FRAC * (on - rest);
  // Rest frames that match, each on its own: how many, and the longest run of them.
  let restHits = 0;
  let longest = 0;
  for (const t of frames) {
    let from = -1;
    let last = -1;
    t.rest.forEach((x, i) => {
      const at = t.restT[i];
      if (score(template, x) >= on) {
        restHits++;
        if (from < 0 || at - last > RUN_GAP) from = at;
        last = at;
        longest = Math.max(longest, last - from + FRAME_MS);
      } else from = -1;
    });
  }
  if (restHits) out.flags.push({ kind: 'firesAtRest', frames: restHits, ms: Math.round(longest) });
  return { ...out, template, on, release, rest, peaks };
}

/** A flag in words, as face-gestures-spec.md has them. */
export function flagText(f: Flag): string {
  switch (f.kind) {
    case 'tooFew': return `Record at least three trials.`;
    case 'noChannels': return `Can't be told from playing: no channel's held values are clear of its values at rest.`;
    case 'unreliable': return `Unreliable: a rep left out of the fit scores little over rest.`;
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

/** `j`'s score on `i`'s gesture (the highest of its reps' median held scores), if it reaches `j`'s release level: `j` would stay on through it. */
function firesOn(j: Contender, i: Contender): number | undefined {
  let y = -Infinity;
  for (const rep of i.held) {
    if (!rep.length) continue;
    y = Math.max(y, median(rep.map((x) => score(j.template, x))));
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
    `it scores ${y.toFixed(2)}, and its release is ${j.release.toFixed(2)}. ${shared.length ? `Both are ${shared.join(', ')}` : `It only needs ${own.join(', ')}`}`;
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
