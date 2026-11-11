// A face gesture's template: the 52 channels, a template fitted from a gesture's held and rest
// frames (its moving channels and caps), and a frame's score against it. A port of the `fit` and
// `score` of public/lab/face-classifier.html; docs/face-classifier-spec.md says what they must be.
// Pure: no DOM, no camera, no storage.

const MIRROR = ['eyeBlink', 'eyeSquint', 'eyeWide', 'eyeLookUp', 'eyeLookDown', 'eyeLookIn', 'eyeLookOut', 'browDown',
  'browOuterUp', 'cheekSquint', 'noseSneer', 'mouthSmile', 'mouthFrown', 'mouthDimple', 'mouthStretch', 'mouthPress',
  'mouthLowerDown', 'mouthUpperUp'];
const PAIRS = [...MIRROR.map((m) => [`${m}Left`, `${m}Right`]), ['jawLeft', 'jawRight'], ['mouthLeft', 'mouthRight']];
const MIDLINE = ['_neutral', 'browInnerUp', 'cheekPuff', 'jawOpen', 'jawForward', 'mouthClose', 'mouthFunnel', 'mouthPucker',
  'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper'];

/** The 52 channels, in the order frames are stored in: each pair's left then right, then those without a counterpart. */
export const CHANNELS: readonly string[] = [...PAIRS.flat(), ...MIDLINE];
const INDEX = new Map(CHANNELS.map((n, i) => [n, i]));

/** A frame's channels from MediaPipe's scores by name; a missing one is 0. */
export function channelsOf(scores: Record<string, number>): Float32Array {
  const x = new Float32Array(CHANNELS.length);
  for (const name in scores) {
    const i = INDEX.get(name);
    if (i !== undefined) x[i] = scores[name];
  }
  return x;
}

/** A paired channel's counterpart on the other side, or -1. */
export function partnerOf(c: number): number {
  return c < PAIRS.length * 2 ? c ^ 1 : -1;
}

/** `values`' quantile `q` (0 to 1), interpolating linearly; NaN of none. */
export function quantile(values: ArrayLike<number>, q: number): number {
  if (!values.length) return NaN;
  const a = Float64Array.from(values).sort();
  const pos = (a.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}
export const median = (values: ArrayLike<number>) => quantile(values, 0.5);

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** A channel's edges: the held frames' 10th percentile on the rest side, the rest frames' 90th on the held side. */
const EDGE = 0.1;
/** How far a channel's held edge must be from its rest value. */
export const MIN_SHIFT = 0.1;
/** The most moving channels a template keeps. */
const MAX_SUPPORT = 10;
/** How far short of a moving channel's edge its counterpart must stay held, to be capped. */
const MIN_CAP = 0.1;
/** How many channels that just missed are kept, for saying what nearly moved. */
const MISSED = 4;
/** With this many moving channels or more, a frame's largest shortfall is left out. */
const SPARE = 4;

/** One trial's frames as channels: those held, and those at rest with their times (ms). */
export interface TrialFrames { held: Float32Array[]; rest: Float32Array[]; restT: number[] }

/** A channel that moves: which way from rest, its held edge, the rest's reach, its rest value, its span, and how clear it is. */
export interface Row { c: number; side: 1 | -1; edge: number; far: number; rest: number; span: number; clear: number }
/** A capped channel: the way its counterpart moves, its cap, where it is wholly out, its rest value. */
export interface Cap { c: number; side: 1 | -1; cap: number; full: number; rest: number }
/** `missed` are rows that didn't make it (their `clear` may be 0 or less). */
export interface Template { rows: Row[]; caps: Cap[]; missed: Row[] }

/**
 * A gesture's template from its trials:
 * - `rows`, the channels that move: the held frames' near edge (`edge`) is clear of the rest frames'
 *   far edge (`far`), and MIN_SHIFT or more from the rest frames' median (`rest`). `clear` is that
 *   gap as a share of the way from `rest` to `edge`. The clearest MAX_SUPPORT are kept.
 * - `caps`, on the other side of a lopsided pair: a moving channel's counterpart, which must stay
 *   within where the gesture held it (`cap`) and is wholly out on reaching the moving channel's
 *   edge (`full`), as it does when both sides do the gesture (a blink, for a wink). Only when `cap`
 *   is MIN_CAP or more short of `full`. A counterpart that moves the same way itself is capped in
 *   place of its row; one that moves the other way keeps its row.
 * - `missed`: the clearest channels left out.
 */
export function fit(trials: TrialFrames[]): Template {
  const held = trials.flatMap((t) => t.held);
  const rest = trials.flatMap((t) => t.rest);
  if (!held.length || !rest.length) return { rows: [], caps: [], missed: [] };
  const all: Row[] = [];
  const heldOf: number[][] = [];
  for (let c = 0; c < CHANNELS.length; c++) {
    const h = held.map((x) => x[c]);
    const r = rest.map((x) => x[c]);
    const rm = median(r);
    const side: 1 | -1 = Math.sign(median(h) - rm) < 0 ? -1 : 1;
    const edge = quantile(h, side > 0 ? EDGE : 1 - EDGE);
    const far = quantile(r, side > 0 ? 1 - EDGE : EDGE);
    const span = side * (edge - rm);
    heldOf.push(h);
    all.push({ c, side, edge, far, rest: rm, span, clear: span > 0 ? (side * (edge - far)) / span : -Infinity });
  }
  const byClear = [...all].sort((a, b) => b.clear - a.clear);
  const picked = byClear.filter((r) => r.clear > 0 && r.span >= MIN_SHIFT).slice(0, MAX_SUPPORT);
  const moving = new Map(picked.map((r) => [r.c, r]));
  const caps: Cap[] = [];
  const capped = new Set<number>();
  for (const r of picked) {
    const p = partnerOf(r.c);
    const other = moving.get(p);
    if (p < 0 || (other && other.side !== r.side)) continue;
    const cap = quantile(heldOf[p], r.side > 0 ? 1 - EDGE : EDGE);
    if (r.side * (r.edge - cap) < MIN_CAP) continue;
    capped.add(p);
    caps.push({ c: p, side: r.side, cap, full: r.edge, rest: all[p].rest });
  }
  const used = new Set([...moving.keys(), ...capped]);
  return {
    rows: picked.filter((r) => !capped.has(r.c)),
    caps,
    missed: byClear.filter((r) => !used.has(r.c) && Number.isFinite(r.clear)).slice(0, MISSED),
  };
}

/** How far short of the gesture a moving channel is, 0 to 1: 1 at its rest value, 0 at its held edge or past it. */
export const shortOf = (r: Row, v: number) => clamp((r.side * (r.edge - v)) / r.span, 0, 1);
/** How far past its cap a capped channel is, 0 to 1. */
export const overOf = (k: Cap, v: number) => clamp((v - k.cap) / (k.full - k.cap), 0, 1);

/** The mean of the moving channels' shortfalls; with SPARE of them or more, less the largest (one channel may be missing). */
function shortfall(t: Template, x: ArrayLike<number>): number {
  let sum = 0;
  let worst = 0;
  for (const r of t.rows) {
    const z = shortOf(r, x[r.c]);
    sum += z;
    worst = Math.max(worst, z);
  }
  return t.rows.length >= SPARE ? (sum - worst) / (t.rows.length - 1) : sum / t.rows.length;
}

/** The root mean square of how far past their caps the capped channels are. */
function overshoot(t: Template, x: ArrayLike<number>): number {
  if (!t.caps.length) return 0;
  return Math.sqrt(t.caps.reduce((a, k) => a + overOf(k, x[k.c]) ** 2, 0) / t.caps.length);
}

/** A frame's score, 0 to 1: 1 less the moving channels' shortfall, times 1 less the caps' overshoot; 0 for a template with no rows. */
export function score(t: Template, x: ArrayLike<number>): number {
  return t.rows.length ? (1 - shortfall(t, x)) * (1 - overshoot(t, x)) : 0;
}
