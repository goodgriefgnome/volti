// Drawing one frame onto a canvas: its music, cut from page canvases, its ink, and the hatching
// shown while a cut is dragged. Canvas drawing only, used by the reader, the excerpt picker and
// exports; where frames sit on the screen is screen.ts.

import { canvasDrawing, drawMarkings, type Drawing, type DrawTarget, type Marking } from '../markings';
import { visible, type Aspects, type Frame, type Placed, type ScoreInk } from '../scores';

/** Music being cut away during a drag, by cut id: page fractions y0..y1 drawn hatched. */
export type Hatches = Map<string, [number, number][]>;

/** Where a cut's band starts and ends on a frame drawn W pixels wide, in whole pixels. */
const bandPx = (p: Placed, W: number) => [Math.round(p.top * W), Math.round((p.top + p.h) * W)] as const;

/**
 * Draw a frame's cuts, stacked, from page canvases drawn at the frame's width. Pixels are
 * device pixels; `region` is the part of the frame the canvas covers (all of it by default).
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D, frame: Frame, W: number, pageCanvas: (page: number) => CanvasImageSource & { width: number; height: number } | undefined,
  aspects: Aspects, hatches?: Hatches,
) {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  for (const p of frame.items) {
    const src = pageCanvas(p.cut.page);
    const [y0, y1] = bandPx(p, W);
    if (src && y1 > y0) {
      const sy = p.cut.y0 * src.height, sh = (p.cut.y1 - p.cut.y0) * src.height;
      ctx.drawImage(src, 0, sy, src.width, sh, 0, y0, W, y1 - y0);
    }
    for (const [a, b] of hatches?.get(p.cut.id) ?? []) hatch(ctx, W, y0 + (a - p.cut.y0) * aspects[p.cut.page] * W, (b - a) * aspects[p.cut.page] * W);
  }
}

/** A dark wash with white diagonal lines over music that is about to be cut away. */
export function hatch(ctx: CanvasRenderingContext2D, W: number, y: number, h: number) {
  if (h <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y, W, h);
  ctx.clip();
  ctx.fillStyle = 'rgba(40, 42, 48, 0.45)';
  ctx.fillRect(0, y, W, h);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = Math.max(1, W / 400);
  const step = Math.max(8, W / 60);
  ctx.beginPath();
  for (let x = -h; x < W; x += step) { ctx.moveTo(x, y + h); ctx.lineTo(x + h, y); }
  ctx.stroke();
  ctx.restore();
}

/** Where a cut's markings go on a frame drawn W wide, offset by (ox, oy) for a close-up. */
export function cutTarget(draw: Drawing, p: Placed, W: number, aspects: Aspects, ox = 0, oy = 0): DrawTarget {
  const h = W * aspects[p.cut.page];
  return { draw, w: W, h, ox, oy: oy + p.cut.y0 * h - p.top * W };
}

/** A target for a marking still being made, whose points are in frame coordinates. */
export const frameTarget = (ctx: CanvasRenderingContext2D, W: number, ox = 0, oy = 0): DrawTarget => ({ draw: canvasDrawing(ctx), w: W, h: W, ox, oy });

/** The markings a cut shows: whole, when most of the marking lies within the cut. */
export const shownOn = (p: Placed, ink: ScoreInk, aspects: Aspects) => (ink[p.cut.id] ?? []).filter((m) => visible(m, p.cut, aspects[p.cut.page]));

/** Draw the markings each cut on the frame shows. */
export function drawFrameInk(ctx: CanvasRenderingContext2D, frame: Frame, ink: ScoreInk, aspects: Aspects, W: number, ox = 0, oy = 0, extra?: Marking) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const draw = canvasDrawing(ctx);
  for (const p of frame.items) drawMarkings(cutTarget(draw, p, W, aspects, ox, oy), shownOn(p, ink, aspects));
  if (extra) drawMarkings(frameTarget(ctx, W, ox, oy), [extra]);
}

/** The parts of the page each cut needs for a close-up of `region` (device pixels of a frame W wide). */
export function regionBands(frame: Frame, W: number, aspects: Aspects, region: { y: number; h: number }) {
  const out: { p: Placed; destY: number; pageY: number; h: number }[] = [];
  for (const p of frame.items) {
    const [b0, b1] = bandPx(p, W);
    const top = Math.max(b0, region.y), bottom = Math.min(b1, region.y + region.h);
    if (bottom <= top) continue;
    const pageY = Math.round(top - p.top * W + p.cut.y0 * aspects[p.cut.page] * W);
    out.push({ p, destY: top - region.y, pageY, h: bottom - top });
  }
  return out;
}
