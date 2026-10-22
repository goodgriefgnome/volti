// Every edit to a score's played order: cutting, joining, trimming, padding, removing and archiving
// cuts, inserting pages, and setting a cut's ink. Each takes a State and returns a new one, keeping
// the ink in step. Pure: no DOM, no storage.

import { copyMarking, type Marking } from '../markings/model';
import { EPS, frameHeight, newCutId, type Aspects, type Cut, type State } from './model';
import { claimFirstPass, splitMarkings } from './ownership';

export const MIN_CUT = 0.004;
export const MIN_SPLIT = 0.01;
export const MAX_PAD = 0.6;

/** Same page and in page order, so the gap between them (if any) is music cut out. */
const inOrder = (a: Cut, b: Cut) => a.page === b.page && b.y0 >= a.y1 - EPS;

export type EdgeKind = 'cutOut' | 'split' | 'trimmed' | 'whole';

/** What lies at a cut's top or bottom edge, which decides what its tab's menu offers. */
export function edgeKind(cuts: readonly Cut[], i: number, edge: 'top' | 'bottom'): EdgeKind {
  const c = cuts[i], top = edge === 'top';
  const other = cuts[i + (top ? -1 : 1)];
  if (other) {
    const [a, b] = top ? [other, c] : [c, other];
    if (inOrder(a, b)) return b.y0 - a.y1 > EPS ? 'cutOut' : 'split';
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
  const p = Math.min(MAX_PAD * frameHeight(aspects), Math.max(0, pad));
  return mapCut(s, id, (c) => {
    const { pad: _, ...rest } = c;
    return p > 0.001 ? { ...rest, pad: p } : rest;
  });
}

/** End a drag. A cut dragged to nothing is removed as it was before the drag, so its ink is archived whole. */
export function release(s: State, before: State, id: string): State {
  const c = s.score.cuts.find((c) => c.id === id);
  if (c && c.y1 - c.y0 <= MIN_CUT) return tidy(remove(before, id));
  return tidy(s);
}

const hasOwnInk = (s: State, c: Cut) => !!c.ownInk && !!s.ink[c.id]?.length;

/** Take a cut out of the played order: archived if it has ink of its own, otherwise deleted. */
export function remove(s: State, id: string): State {
  const { cuts, archived } = s.score;
  const c = cuts.find((c) => c.id === id);
  if (!c || cuts.length <= 1) return s;
  const keep = hasOwnInk(s, c);
  const ink = { ...s.ink };
  if (!keep) delete ink[id];
  return {
    score: { ...s.score, cuts: cuts.filter((x) => x !== c), archived: keep ? [...archived, c] : archived },
    ink,
  };
}

export function deleteArchived(s: State, id: string): State {
  const ink = { ...s.ink };
  delete ink[id];
  return { score: { ...s.score, archived: s.score.archived.filter((c) => c.id !== id) }, ink };
}

/** Merge cut `id` with the one after it (same page, in order): joins a split, or restores the music cut out. */
export function joinNext(s: State, id: string): State {
  const cuts = s.score.cuts, i = cuts.findIndex((c) => c.id === id);
  const a = cuts[i], b = cuts[i + 1];
  if (!a || !b || !inOrder(a, b)) return s;
  const merged: Cut = { ...a, y1: b.y1, ...(a.ownInk || b.ownInk ? { ownInk: true } : {}) };
  const ink = { ...s.ink };
  const markings = [...(ink[a.id] ?? []), ...(ink[b.id] ?? [])];
  delete ink[b.id];
  if (markings.length) ink[a.id] = markings;
  return { score: { ...s.score, cuts: cuts.flatMap((c) => (c === a ? [merged] : c === b ? [] : [c])) }, ink };
}

export function restoreEdge(s: State, id: string, edge: 'top' | 'bottom'): State {
  return mapCut(s, id, (c) => (edge === 'top' ? { ...c, y0: 0 } : { ...c, y1: 1 }));
}

/** Split a cut at y (a fraction of the page height). Each marking goes to the half that holds most of it. */
export function split(s: State, id: string, y: number, aspects: Aspects): { state: State; lower: string } {
  const cuts = s.score.cuts, i = cuts.findIndex((c) => c.id === id);
  const c = cuts[i];
  const upper: Cut = { ...c, y1: y };
  const { pad: _, ...rest } = c;
  const lower: Cut = { ...rest, id: newCutId(), y0: y };
  const [up, down] = splitMarkings(s.ink[c.id] ?? [], y, aspects[c.page]);
  const ink = { ...s.ink };
  delete ink[c.id];
  if (up.length) ink[upper.id] = up;
  if (down.length) ink[lower.id] = down;
  return {
    state: { score: { ...s.score, cuts: [...cuts.slice(0, i), upper, lower, ...cuts.slice(i + 1)] }, ink },
    lower: lower.id,
  };
}

/** Drop cuts thinner than MIN_CUT. */
export function tidy(s: State): State {
  for (const c of s.score.cuts) if (c.y1 - c.y0 <= MIN_CUT) s = remove(s, c.id);
  return s;
}

/** Cut a cut in two at y (a fraction of its page's height), unless either half would be a sliver. */
export function cutAt(s: State, id: string, y: number, aspects: Aspects): State | null {
  const c = s.score.cuts.find((c) => c.id === id);
  if (!c || y - c.y0 < MIN_SPLIT || c.y1 - y < MIN_SPLIT) return null;
  return split(s, id, y, aspects).state;
}

export interface InsertAt { id: string; after: boolean }

const place = (s: State, at: InsertAt, add: Cut[]): Cut[] => {
  const cuts = s.score.cuts, i = cuts.findIndex((c) => c.id === at.id);
  const k = at.after ? i + 1 : i;
  return [...cuts.slice(0, k), ...add, ...cuts.slice(k)];
};

/**
 * Insert whole pages `from`..`to` (0-based), always in page order.
 * With `copyInk`, each new cut gets a copy of the markings from the first time each part of
 * its page is played. Returns the id of the first new cut.
 */
export function insertPages(
  s: State, at: InsertAt, from: number, to: number, copyInk: boolean, aspects: Aspects,
): { state: State; first: string } {
  const add: Cut[] = [];
  for (let p = Math.min(from, to); p <= Math.max(from, to); p++) add.push({ id: newCutId(), page: p, y0: 0, y1: 1 });
  const ink = { ...s.ink };
  if (copyInk) {
    for (const c of add) {
      const markings = claimFirstPass(s.score.cuts.filter((x) => x.page === c.page), s.ink, aspects[c.page]);
      if (markings.length) ink[c.id] = markings.map(copyMarking);
    }
  }
  return { state: tidy({ score: { ...s.score, cuts: place(s, at, add) }, ink }), first: add[0].id };
}

/** Put an archived cut back into the played order, with its ink. */
export function insertArchived(s: State, at: InsertAt, id: string): State {
  const c = s.score.archived.find((c) => c.id === id);
  if (!c) return s;
  const score = { ...s.score, cuts: place(s, at, [c]), archived: s.score.archived.filter((x) => x !== c) };
  return tidy({ ...s, score });
}

/** Record that a cut's ink was changed by hand, then set its markings. */
export function setInk(s: State, id: string, markings: Marking[]): State {
  const ink = { ...s.ink };
  if (markings.length) ink[id] = markings; else delete ink[id];
  return { ...mapCut(s, id, (c) => (c.ownInk ? c : { ...c, ownInk: true })), ink };
}
