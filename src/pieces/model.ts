import type { Stroke } from '../ink/model';
import { claimFirstPass, splitStrokes } from './ink';

/** A horizontal band of one source page; y0 and y1 are fractions of the page height, 0 = top. */
export interface Cut {
  id: string;
  page: number;
  y0: number;
  y1: number;
  /** White space above, in page widths, used only when this cut starts a frame. */
  pad?: number;
  /** Someone has drawn or erased on this cut, so removing it archives it rather than deleting it. */
  ownInk?: boolean;
}

export interface Piece {
  id: string;
  sourceId: string;
  title: string;
  key: string;
  orientation: 'portrait' | 'landscape';
  /** The played order. */
  cuts: Cut[];
  /** Removed cuts that had their own ink; their strokes stay in the ink record. */
  archived: Cut[];
}

/** Strokes by cut id, in source-page coordinates. */
export type PieceInk = Record<string, Stroke[]>;

/** A piece and its ink, which every edit to the cuts keeps in step. */
export interface State { piece: Piece; ink: PieceInk }

/** Height / width of each source page. Frames take the shape of the first. */
export type Aspects = readonly number[];

export interface Placed { cut: Cut; index: number; top: number; h: number }
export interface Frame { items: Placed[]; fill: number }

export const MIN_CUT = 0.004;
export const MIN_SPLIT = 0.01;
export const ROOM_CUE = 0.2;
export const MAX_PAD = 0.6;
const EPS = 1e-6;

export const newCutId = () => crypto.randomUUID();

export const frameHeight = (aspects: Aspects) => aspects[0];
export const cutHeight = (c: Cut, aspects: Aspects) => (c.y1 - c.y0) * aspects[c.page];
export const framesPerScreen = (piece: Piece) => (piece.orientation === 'landscape' ? 2 : 1);

/** A new file is one piece: every page once, in order. Landscape for portrait-shaped pages. */
export function newPiece(id: string, sourceId: string, title: string, aspects: Aspects): Piece {
  return {
    id, sourceId, title, key: '',
    orientation: aspects[0] >= 1 ? 'landscape' : 'portrait',
    cuts: aspects.map((_, page) => ({ id: newCutId(), page, y0: 0, y1: 1 })),
    archived: [],
  };
}

/** Stack cuts onto frames greedily, in played order: a cut that doesn't fit starts a new frame. */
export function pack(cuts: readonly Cut[], aspects: Aspects): Frame[] {
  const H = frameHeight(aspects), frames: Frame[] = [];
  let open: Frame | null = null;
  cuts.forEach((cut, index) => {
    const h = cutHeight(cut, aspects);
    if (!open || open.fill + h > H + EPS) {
      open = { items: [], fill: Math.max(0, Math.min(cut.pad ?? 0, H - h)) };
      frames.push(open);
    }
    open.items.push({ cut, index, top: open.fill, h });
    open.fill += h;
  });
  return frames;
}

/** Lay cuts out on the frames they were on, without reflowing: how a drag shows while it happens. */
export function freeze(frames: Frame[], cuts: readonly Cut[], aspects: Aspects): Frame[] {
  const H = frameHeight(aspects);
  const at = new Map(cuts.map((c, index) => [c.id, index]));
  return frames.map((f) => {
    const items: Placed[] = [];
    let fill = 0;
    for (const p of f.items) {
      const index = at.get(p.cut.id);
      if (index === undefined) continue;
      const cut = cuts[index], h = cutHeight(cut, aspects);
      if (!items.length) fill = Math.max(0, Math.min(cut.pad ?? 0, H - h));
      items.push({ cut, index, top: fill, h });
      fill += h;
    }
    return { items, fill };
  });
}

export const frameOf =(frames: Frame[], id: string) => frames.findIndex((f) => f.items.some((p) => p.cut.id === id));

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
  ({ ...s, piece: { ...s.piece, cuts: s.piece.cuts.map((c) => (c.id === id ? f(c) : c)) } });

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
  const c = s.piece.cuts.find((c) => c.id === id);
  if (c && c.y1 - c.y0 <= MIN_CUT) return tidy(remove(before, id));
  return tidy(s);
}

const hasOwnInk = (s: State, c: Cut) => !!c.ownInk && !!s.ink[c.id]?.length;

/** Take a cut out of the played order: archived if it has ink of its own, otherwise deleted. */
export function remove(s: State, id: string): State {
  const { cuts, archived } = s.piece;
  const c = cuts.find((c) => c.id === id);
  if (!c || cuts.length <= 1) return s;
  const keep = hasOwnInk(s, c);
  const ink = { ...s.ink };
  if (!keep) delete ink[id];
  return {
    piece: { ...s.piece, cuts: cuts.filter((x) => x !== c), archived: keep ? [...archived, c] : archived },
    ink,
  };
}

export function deleteArchived(s: State, id: string): State {
  const ink = { ...s.ink };
  delete ink[id];
  return { piece: { ...s.piece, archived: s.piece.archived.filter((c) => c.id !== id) }, ink };
}

/** Merge cut `id` with the one after it (same page, in order): joins a split, or restores the music cut out. */
export function joinNext(s: State, id: string): State {
  const cuts = s.piece.cuts, i = cuts.findIndex((c) => c.id === id);
  const a = cuts[i], b = cuts[i + 1];
  if (!a || !b || !inOrder(a, b)) return s;
  const merged: Cut = { ...a, y1: b.y1, ...(a.ownInk || b.ownInk ? { ownInk: true } : {}) };
  const ink = { ...s.ink };
  const strokes = [...(ink[a.id] ?? []), ...(ink[b.id] ?? [])];
  delete ink[b.id];
  if (strokes.length) ink[a.id] = strokes;
  return { piece: { ...s.piece, cuts: cuts.flatMap((c) => (c === a ? [merged] : c === b ? [] : [c])) }, ink };
}

export function restoreEdge(s: State, id: string, edge: 'top' | 'bottom'): State {
  return mapCut(s, id, (c) => (edge === 'top' ? { ...c, y0: 0 } : { ...c, y1: 1 }));
}

/** Split a cut at y (a fraction of the page height). Each stroke goes to the half that holds most of it. */
export function split(s: State, id: string, y: number, aspects: Aspects): { state: State; lower: string } {
  const cuts = s.piece.cuts, i = cuts.findIndex((c) => c.id === id);
  const c = cuts[i];
  const upper: Cut = { ...c, y1: y };
  const { pad: _, ...rest } = c;
  const lower: Cut = { ...rest, id: newCutId(), y0: y };
  const [up, down] = splitStrokes(s.ink[c.id] ?? [], y, aspects[c.page]);
  const ink = { ...s.ink };
  delete ink[c.id];
  if (up.length) ink[upper.id] = up;
  if (down.length) ink[lower.id] = down;
  return {
    state: { piece: { ...s.piece, cuts: [...cuts.slice(0, i), upper, lower, ...cuts.slice(i + 1)] }, ink },
    lower: lower.id,
  };
}

/** Drop cuts thinner than MIN_CUT. */
export function tidy(s: State): State {
  for (const c of s.piece.cuts) if (c.y1 - c.y0 <= MIN_CUT) s = remove(s, c.id);
  return s;
}

/**
 * The room left on the frame before frame `n`, in page widths, when it is more than ROOM_CUE
 * of the frame; otherwise null. It is shown as a faint shading at the top of frame n.
 */
export function roomBefore(frames: Frame[], n: number, aspects: Aspects): number | null {
  const prev = frames[n - 1];
  if (!prev || !frames[n]?.items.length) return null;
  const H = frameHeight(aspects), room = H - prev.fill;
  return room > ROOM_CUE * H ? room : null;
}

/** Cut a cut in two at y (a fraction of its page's height), unless either half would be a sliver. */
export function cutAt(s: State, id: string, y: number, aspects: Aspects): State | null {
  const c = s.piece.cuts.find((c) => c.id === id);
  if (!c || y - c.y0 < MIN_SPLIT || c.y1 - y < MIN_SPLIT) return null;
  return split(s, id, y, aspects).state;
}

export interface InsertAt { id: string; after: boolean }

const place = (s: State, at: InsertAt, add: Cut[]): Cut[] => {
  const cuts = s.piece.cuts, i = cuts.findIndex((c) => c.id === at.id);
  const k = at.after ? i + 1 : i;
  return [...cuts.slice(0, k), ...add, ...cuts.slice(k)];
};

/**
 * Insert whole pages `from`..`to` (0-based; a backwards range goes in backwards order).
 * With `copyInk`, each new cut gets a copy of the markings from the first time each part of
 * its page is played. Returns the id of the first new cut.
 */
export function insertPages(
  s: State, at: InsertAt, from: number, to: number, copyInk: boolean, aspects: Aspects,
): { state: State; first: string } {
  const step = from <= to ? 1 : -1, add: Cut[] = [];
  for (let p = from; p !== to + step; p += step) add.push({ id: newCutId(), page: p, y0: 0, y1: 1 });
  const ink = { ...s.ink };
  if (copyInk) {
    for (const c of add) {
      const strokes = claimFirstPass(s.piece.cuts.filter((x) => x.page === c.page), s.ink, aspects[c.page]);
      if (strokes.length) ink[c.id] = strokes.map((st) => ({ ...st, points: st.points.map((p) => [...p]) }));
    }
  }
  return { state: tidy({ piece: { ...s.piece, cuts: place(s, at, add) }, ink }), first: add[0].id };
}

/** Put an archived cut back into the played order, with its ink. */
export function insertArchived(s: State, at: InsertAt, id: string): State {
  const c = s.piece.archived.find((c) => c.id === id);
  if (!c) return s;
  const piece = { ...s.piece, cuts: place(s, at, [c]), archived: s.piece.archived.filter((x) => x !== c) };
  return tidy({ ...s, piece });
}

/** Record that a cut's ink was changed by hand, then set its strokes. */
export function setInk(s: State, id: string, strokes: Stroke[]): State {
  const ink = { ...s.ink };
  if (strokes.length) ink[id] = strokes; else delete ink[id];
  return { ...mapCut(s, id, (c) => (c.ownInk ? c : { ...c, ownInk: true })), ink };
}
