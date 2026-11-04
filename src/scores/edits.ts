// Every edit to a score's played order: cutting, joining, trimming, padding, removing cuts,
// inserting pages and setting a cut's pass, and setting a page's ink. Each takes a State and returns a new one; edits to the
// cuts leave the ink as it is. Pure: no DOM, no storage.

import type { Marking } from '../markings/model';
import { _EPS, _newCutId, passOf, symbolSizeOf, textScaleOf, type Aspects, type Cut, type Score, type State } from './model';

export const _MIN_CUT = 0.004;
export const _MIN_SPLIT = 0.01;
export const _MAX_PAD = 0.6;

/**
 * Same page and pass, and in page order, so the gap between them (if any) is music cut out. Cuts of
 * a page with different passes are as unrelated as cuts of different pages.
 */
const inOrder = (a: Cut, b: Cut) => a.page === b.page && passOf(a) === passOf(b) && b.y0 >= a.y1 - _EPS;

export type _EdgeKind = 'cutOut' | 'split' | 'trimmed' | 'whole';

/** What lies at a cut's top or bottom edge, which decides what its tab's menu offers. */
export function edgeKind(cuts: readonly Cut[], i: number, edge: 'top' | 'bottom'): _EdgeKind {
  const c = cuts[i], top = edge === 'top';
  const other = cuts[i + (top ? -1 : 1)];
  if (other) {
    const [a, b] = top ? [other, c] : [c, other];
    if (inOrder(a, b)) return b.y0 - a.y1 > _EPS ? 'cutOut' : 'split';
  }
  return (top ? c.y0 > 0.001 : c.y1 < 0.999) ? 'trimmed' : 'whole';
}

/** How far a tab can move: from cutting the whole cut away to the next music of the page. */
export function edgeRange(cuts: readonly Cut[], i: number, edge: 'top' | 'bottom'): [lo: number, hi: number] {
  const c = cuts[i];
  if (edge === 'bottom') {
    const next = cuts[i + 1];
    return [c.y0, next && inOrder(c, next) ? next.y0 : 1];
  }
  const prev = cuts[i - 1];
  return [prev && inOrder(prev, c) ? prev.y1 : 0, c.y1];
}

const mapCut = (s: State, id: string, f: (c: Cut) => Cut): State =>
  ({ ...s, score: { ...s.score, cuts: s.score.cuts.map((c) => (c.id === id ? f(c) : c)) } });

/** Move one edge while dragging. No reflow: the caller calls `release` when the drag ends. */
export function setEdge(s: State, id: string, edge: 'top' | 'bottom', v: number, [lo, hi]: [number, number]): State {
  const y = Math.min(hi, Math.max(lo, v));
  return mapCut(s, id, (c) => (edge === 'top' ? { ...c, y0: y } : { ...c, y1: y }));
}

export function setPad(s: State, id: string, pad: number, aspects: Aspects): State {
  const page = s.score.cuts.find((c) => c.id === id)?.page ?? 0;
  const p = Math.min(_MAX_PAD * aspects[page], Math.max(0, pad));
  return mapCut(s, id, (c) => {
    const { pad: _, ...rest } = c;
    return p > 0.001 ? { ...rest, pad: p } : rest;
  });
}

/** End a drag. A cut dragged to nothing is removed as it was before the drag. */
export function release(s: State, before: State, id: string): State {
  const c = s.score.cuts.find((c) => c.id === id);
  if (c && c.y1 - c.y0 <= _MIN_CUT) return tidy(remove(before, id));
  return tidy(s);
}

/** Take a cut out of the played order. Its page's ink stays. */
export function remove(s: State, id: string): State {
  const cuts = s.score.cuts;
  const c = cuts.find((c) => c.id === id);
  if (!c || cuts.length <= 1) return s;
  return { ...s, score: { ...s.score, cuts: cuts.filter((x) => x !== c) } };
}

/** Merge cut `id` with the one after it (same page, in order): joins a split, or restores the music cut out. */
export function joinNext(s: State, id: string): State {
  const cuts = s.score.cuts, i = cuts.findIndex((c) => c.id === id);
  const a = cuts[i], b = cuts[i + 1];
  if (!a || !b || !inOrder(a, b)) return s;
  const merged: Cut = { ...a, y1: b.y1 };
  return { ...s, score: { ...s.score, cuts: cuts.flatMap((c) => (c === a ? [merged] : c === b ? [] : [c])) } };
}

export function restoreEdge(s: State, id: string, edge: 'top' | 'bottom'): State {
  return mapCut(s, id, (c) => (edge === 'top' ? { ...c, y0: 0 } : { ...c, y1: 1 }));
}

/** Split a cut at y (a fraction of the page height). */
export function split(s: State, id: string, y: number): { state: State; lower: string } {
  const cuts = s.score.cuts, i = cuts.findIndex((c) => c.id === id);
  const c = cuts[i];
  const upper: Cut = { ...c, y1: y };
  const { pad: _, ...rest } = c;
  const lower: Cut = { ...rest, id: _newCutId(), y0: y };
  return {
    state: { ...s, score: { ...s.score, cuts: [...cuts.slice(0, i), upper, lower, ...cuts.slice(i + 1)] } },
    lower: lower.id,
  };
}

/** Drop cuts thinner than MIN_CUT. */
export function tidy(s: State): State {
  for (const c of s.score.cuts) if (c.y1 - c.y0 <= _MIN_CUT) s = remove(s, c.id);
  return s;
}

/** Cut a cut in two at y (a fraction of its page's height), unless either half would be a sliver. */
export function cutAt(s: State, id: string, y: number): State | null {
  const c = s.score.cuts.find((c) => c.id === id);
  if (!c || y - c.y0 < _MIN_SPLIT || c.y1 - y < _MIN_SPLIT) return null;
  return split(s, id, y).state;
}

export interface InsertAt { id: string; after: boolean }

const place = (s: State, at: InsertAt, add: Cut[]): Cut[] => {
  const cuts = s.score.cuts, i = cuts.findIndex((c) => c.id === at.id);
  const k = at.after ? i + 1 : i;
  return [...cuts.slice(0, k), ...add, ...cuts.slice(k)];
};

/** Insert whole pages `from`..`to` (0-based), always in page order, each cut of pass `pass`. Returns the id of the first new cut. */
export function insertPages(s: State, at: InsertAt, from: number, to: number, pass: number): { state: State; first: string } {
  const add: Cut[] = [];
  for (let p = Math.min(from, to); p <= Math.max(from, to); p++) add.push({ id: _newCutId(), page: p, y0: 0, y1: 1, ...(pass > 1 ? { pass } : {}) });
  return { state: tidy({ ...s, score: { ...s.score, cuts: place(s, at, add) } }), first: add[0].id };
}

/** Each pass the score's cuts of `pages` have, in order. */
export function passesOf(score: Score, pages: readonly number[]): number[] {
  const passes = new Set(score.cuts.filter((c) => pages.includes(c.page)).map(passOf));
  return [...passes].sort((a, b) => a - b);
}

/** The passes offered for cuts of `pages`: each they have, and one more (the highest plus 1); [1] when they have none. The last is the one chosen at first. */
export function passChoices(score: Score, pages: readonly number[]): number[] {
  const passes = passesOf(score, pages);
  return passes.length ? [...passes, passes.at(-1)! + 1] : [1];
}

/** A cut given pass `pass` (none stored for pass 1). */
export function setPass(s: State, id: string, pass: number): State {
  return mapCut(s, id, (c) => {
    const { pass: _, ...rest } = c;
    return pass > 1 ? { ...rest, pass } : rest;
  });
}

/** Set the markings of a page of the original. */
export function setInk(s: State, page: number, markings: Marking[]): State {
  const ink = { ...s.ink };
  if (markings.length) ink[page] = markings; else delete ink[page];
  return { ...s, ink };
}

/** The score's symbol size set, which what placed it or resized it implied. */
export const setSymbolSize = (s: State, size: number): State => ({ ...s, score: { ...s.score, symbolSize: size } });

/** The size new text is placed at: the score's symbol size × its text scale. */
export const textSizeOf = (score: Score) => symbolSizeOf(score) * textScaleOf(score);

/**
 * After a text marking is resized to `size`: the score's text scale becomes size / its symbol
 * size; but while its ink (every page's) has no symbol, its symbol size
 * becomes size / its text scale instead.
 */
export function textResized(s: State, size: number): State {
  const hasSymbol = Object.values(s.ink).some((list) => list.some((m) => 'kind' in m && m.kind === 'symbol'));
  if (hasSymbol) return { ...s, score: { ...s.score, textScale: size / symbolSizeOf(s.score) } };
  return setSymbolSize(s, size / textScaleOf(s.score));
}

/** A marking of a page replaced by `next` (taken away when there is none), as an edit by hand. */
export function replaceMarking(s: State, page: number, old: Marking, next?: Marking): State {
  const list = (s.ink[page] ?? []).flatMap((m) => (m !== old ? [m] : next ? [next] : []));
  return setInk(s, page, list);
}
