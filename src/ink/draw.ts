import { widthPx, type Point, type Stroke } from './model';

/**
 * A canvas that strokes are drawn on. It shows a page drawn `w` x `h` pixels in size; when it
 * covers only part of the page (a zoomed-in close-up), (ox, oy) is where that part starts.
 */
export interface InkTarget { ctx: CanvasRenderingContext2D; w: number; h: number; ox: number; oy: number }

function seg(t: InkTarget, s: Stroke, a: Point, b: Point) {
  const { ctx } = t;
  ctx.lineWidth = widthPx(s, (a[2] + b[2]) / 2, t.w);
  ctx.beginPath();
  ctx.moveTo(a[0] * t.w - t.ox, a[1] * t.h - t.oy);
  ctx.lineTo(b[0] * t.w - t.ox, b[1] * t.h - t.oy);
  ctx.stroke();
}

function style(ctx: CanvasRenderingContext2D, s: Stroke) {
  ctx.strokeStyle = s.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

/** Draw the newest segment of a pen stroke while it is being written. */
export function drawPenSegment(t: InkTarget, s: Stroke, a: Point, b: Point) {
  style(t.ctx, s);
  seg(t, s, a, b);
}

function drawStroke(t: InkTarget, s: Stroke) {
  const { ctx } = t;
  style(ctx, s);
  const pts = s.points;
  if (s.tool === 'highlighter') {
    // One path, so overlapping parts of the same stroke don't darken.
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.globalCompositeOperation = 'multiply';
    ctx.lineWidth = widthPx(s, 1, t.w);
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * t.w - t.ox, pts[0][1] * t.h - t.oy);
    for (const p of pts.length > 1 ? pts.slice(1) : pts) ctx.lineTo(p[0] * t.w - t.ox, p[1] * t.h - t.oy);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (pts.length === 1) seg(t, s, pts[0], pts[0]);
  for (let i = 1; i < pts.length; i++) seg(t, s, pts[i - 1], pts[i]);
}

export function drawStrokes(t: InkTarget, strokes: readonly Stroke[]) {
  for (const s of strokes) drawStroke(t, s);
}
