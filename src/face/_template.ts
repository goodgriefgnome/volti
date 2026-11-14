// A face gesture's template: the 52 channels, a template fitted from a gesture's held and rest
// frames (its moving channels and limits), and a frame's strength against it. A port of the `fit` and
// `score` of public/lab/face-classifier.html; docs/face-classifier-spec.md says what they must be.
// Pure: no DOM, no camera, no storage.

import type { GestureChannels } from './gestures';

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
/** How far short of a moving channel's edge its counterpart must stay held, to have a limit. */
const MIN_LIMIT = 0.1;
/** With this many moving channels or more, a frame's largest shortfall is left out. */
const SPARE = 4;

/** One trial's frames as channels: those held, and those at rest with their times (ms). */
export interface TrialFrames { held: Float32Array[]; rest: Float32Array[]; restT: number[] }

/** A channel that moves: which way from rest, its held edge, the rest's reach, its rest value, its span, and its separation. */
export interface Row { c: number; side: 1 | -1; edge: number; far: number; rest: number; span: number; separation: number }
/** A limit, on a channel that must not pass it: the way its partner moves, the limit, where it is wholly out, its rest value. */
export interface Limit { c: number; side: 1 | -1; limit: number; full: number; rest: number }
export interface Template { rows: Row[]; limits: Limit[] }

/** The least a threshold is kept from its channel's rest value, on the side it moves, and a limit from its `full`. */
const MIN_THRESHOLD_GAP = 0.02;

/** `row` with its edge at `edge`, kept `MIN_THRESHOLD_GAP` from its rest value on the side it moves; its span and separation follow. */
function withEdge(row: Row, edge: number): Row {
  const e = clamp(row.side > 0 ? Math.max(edge, row.rest + MIN_THRESHOLD_GAP) : Math.min(edge, row.rest - MIN_THRESHOLD_GAP), 0, 1);
  const span = row.side * (e - row.rest);
  return { ...row, edge: e, span, separation: span > 0 ? (row.side * (e - row.far)) / span : -Infinity };
}

/** `limit` at `at`, kept `MIN_THRESHOLD_GAP` short of its `full`. */
function withLimitAt(limit: Limit, at: number): Limit {
  return { ...limit, limit: clamp(limit.side > 0 ? Math.min(at, limit.full - MIN_THRESHOLD_GAP) : Math.max(at, limit.full + MIN_THRESHOLD_GAP), 0, 1) };
}

/**
 * A gesture's template from its trials, and the changes made to its channels by hand:
 * - `rows`, the channels that move: the held frames' near edge (`edge`) is clear of the rest frames'
 *   far edge (`far`), and MIN_SHIFT or more from the rest frames' median (`rest`). `separation` is that
 *   gap as a share of the way from `rest` to `edge`. The most separated MAX_SUPPORT are picked.
 * - `limits`, on the other side of a lopsided pair: a moving channel's counterpart, which must stay
 *   within where the gesture held it (`limit`) and is wholly out on reaching the moving channel's
 *   edge (`full`), as it does when both sides do the gesture (a blink, for a wink). Only when `limit`
 *   is MIN_LIMIT or more short of `full`. A counterpart that moves the same way itself has a limit
 *   in place of its row; one that moves the other way keeps its row.
 * - A channel forced off is left out, and a row forced off takes its limit with it; one forced on
 *   moves whatever its separation and span, beside those picked, if its held median differs from its
 *   rest median. A moved threshold replaces a row's edge or a limit's limit.
 */
export function fit(trials: TrialFrames[], channels?: GestureChannels): Template {
  const held = trials.flatMap((t) => t.held);
  const rest = trials.flatMap((t) => t.rest);
  if (!held.length || !rest.length) return { rows: [], limits: [] };
  const all: Row[] = [];
  const heldOf: number[][] = [];
  const moves: boolean[] = [];
  for (let c = 0; c < CHANNELS.length; c++) {
    const h = held.map((x) => x[c]);
    const r = rest.map((x) => x[c]);
    const rm = median(r);
    const diff = median(h) - rm;
    const side: 1 | -1 = Math.sign(diff) < 0 ? -1 : 1;
    const edge = quantile(h, side > 0 ? EDGE : 1 - EDGE);
    const far = quantile(r, side > 0 ? 1 - EDGE : EDGE);
    const span = side * (edge - rm);
    heldOf.push(h);
    moves.push(diff !== 0);
    all.push({ c, side, edge, far, rest: rm, span, separation: span > 0 ? (side * (edge - far)) / span : -Infinity });
  }
  const index = (names: string[]) => new Set(names.map((n) => CHANNELS.indexOf(n)).filter((c) => c >= 0));
  const off = index(channels?.forcedOff ?? []);
  const on = index(channels?.forcedOn ?? []);
  const bySeparation = [...all].sort((a, b) => b.separation - a.separation);
  // What the fit would pick, and the limits it would put: forcing off is applied after, so a channel left out isn't replaced.
  const picked = bySeparation.filter((r) => r.separation > 0 && r.span >= MIN_SHIFT).slice(0, MAX_SUPPORT);
  const moving = new Map(picked.map((r) => [r.c, r]));
  const limits: Limit[] = [];
  const limited = new Set<number>();
  for (const r of picked) {
    const p = partnerOf(r.c);
    const other = moving.get(p);
    if (p < 0 || (other && other.side !== r.side)) continue;
    const limit = quantile(heldOf[p], r.side > 0 ? 1 - EDGE : EDGE);
    if (r.side * (r.edge - limit) < MIN_LIMIT) continue;
    limited.add(p);
    limits.push({ c: p, side: r.side, limit, full: r.edge, rest: all[p].rest });
  }
  const rows = picked.filter((r) => !limited.has(r.c) && !off.has(r.c));
  // A channel forced on is a row beside those picked, if it moves and isn't a limit's channel.
  for (const c of on) if (!off.has(c) && !moving.has(c) && !limited.has(c) && moves[c]) rows.push(withEdge(all[c], all[c].edge));
  // The limits: not of a row forced off, nor on a channel forced off; and the thresholds moved by hand.
  const edges = new Map(rows.map((r) => [r.c, r]));
  const set = channels?.thresholds ?? {};
  const moved = (c: number) => set[CHANNELS[c]];
  const finalRows = rows.map((r) => (moved(r.c) === undefined ? r : withEdge(r, moved(r.c))));
  const finalLimits = limits
    .filter((k) => edges.has(partnerOf(k.c)) && !off.has(k.c))
    .map((k) => {
      const row = finalRows.find((r) => r.c === partnerOf(k.c))!;
      const l = { ...k, full: row.edge };
      return withLimitAt(l, moved(k.c) ?? l.limit);
    });
  return { rows: finalRows, limits: finalLimits };
}

/** The template with one row's edge, or one limit's limit, moved to `v`; the `full` of a moved edge's limit follows it. For strength while a handle is dragged. */
export function withThreshold(t: Template, c: number, v: number): Template {
  const rows = t.rows.map((r) => (r.c === c ? withEdge(r, v) : r));
  const limits = t.limits.map((k) => {
    if (k.c === c) return withLimitAt(k, v);
    const row = rows.find((r) => r.c === partnerOf(k.c));
    return row && row.edge !== k.full ? withLimitAt({ ...k, full: row.edge }, k.limit) : k;
  });
  return { rows, limits };
}

/** A channel that could be added to a template, for Add channel…. */
export interface Candidate { c: number; span: number; separation: number; moves: boolean }

/** Every channel not in `t` (nor a limit), by separation from the highest, those that don't move last. */
export function candidates(trials: TrialFrames[], t: Template): Candidate[] {
  const held = trials.flatMap((x) => x.held);
  const rest = trials.flatMap((x) => x.rest);
  if (!held.length || !rest.length) return [];
  const used = new Set([...t.rows.map((r) => r.c), ...t.limits.map((k) => k.c)]);
  const out: Candidate[] = [];
  for (let c = 0; c < CHANNELS.length; c++) {
    if (used.has(c)) continue;
    const h = held.map((x) => x[c]);
    const r = rest.map((x) => x[c]);
    const rm = median(r);
    const diff = median(h) - rm;
    const side = Math.sign(diff) < 0 ? -1 : 1;
    const edge = quantile(h, side > 0 ? EDGE : 1 - EDGE);
    const far = quantile(r, side > 0 ? 1 - EDGE : EDGE);
    const span = side * (edge - rm);
    out.push({ c, span, separation: span > 0 ? (side * (edge - far)) / span : 0, moves: diff !== 0 });
  }
  return out.sort((a, b) => Number(b.moves) - Number(a.moves) || b.separation - a.separation);
}

/** How far short of the gesture a moving channel is, 0 to 1: 1 at its rest value, 0 at its held edge or past it. */
export const shortOf = (r: Row, v: number) => clamp((r.side * (r.edge - v)) / r.span, 0, 1);
/** How far past its limit a channel with one is, 0 to 1. */
export const pastLimit = (k: Limit, v: number) => clamp((v - k.limit) / (k.full - k.limit), 0, 1);

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

/** The root mean square of how far past their limits the channels with one are. */
function overshoot(t: Template, x: ArrayLike<number>): number {
  if (!t.limits.length) return 0;
  return Math.sqrt(t.limits.reduce((a, k) => a + pastLimit(k, x[k.c]) ** 2, 0) / t.limits.length);
}

/** A frame's strength, 0 to 1: 1 less the moving channels' shortfall, times 1 less the limits' overshoot; 0 for a template with no rows. */
export function strength(t: Template, x: ArrayLike<number>): number {
  return t.rows.length ? (1 - shortfall(t, x)) * (1 - overshoot(t, x)) : 0;
}
