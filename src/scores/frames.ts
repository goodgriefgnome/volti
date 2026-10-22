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
