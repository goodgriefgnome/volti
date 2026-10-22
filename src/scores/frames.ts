// Laying the played order out on frames, cuts stacked down each frame in played order, and
// questions about that layout (which frame holds a cut, the room left on one). Pure; drawing a
// frame is reader/frames.ts.

import { cutHeight, EPS, frameHeight, type Aspects, type Cut } from './model';

export interface Placed { cut: Cut; index: number; top: number; h: number }
export interface Frame { items: Placed[]; fill: number }

export const ROOM_CUE = 0.2;

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

export const frameOf = (frames: Frame[], id: string) => frames.findIndex((f) => f.items.some((p) => p.cut.id === id));

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

/** Where a cut is on the score's pages (its frames): page `page` (from 1), `j`th of the `n` cuts on it. */
export interface Place { page: number; j: number; n: number }

/** Where each cut, by index, is on the score's pages. */
export function places(cuts: readonly Cut[], aspects: Aspects): Place[] {
  const out: Place[] = [];
  pack(cuts, aspects).forEach((f, k) => f.items.forEach((p, j) => { out[p.index] = { page: k + 1, j, n: f.items.length }; }));
  return out;
}

/** The letter for the `j`th cut on a page: a, b, …, z, aa, ab, … */
export function cutLetter(j: number): string {
  return (j >= 26 ? cutLetter(Math.floor(j / 26) - 1) : '') + String.fromCharCode(97 + (j % 26));
}

/** "3b" for a cut that shares its page; "3" for the only cut on page 3. */
export const placeLabel = (p: Place) => `${p.page}${p.n > 1 ? cutLetter(p.j) : ''}`;
