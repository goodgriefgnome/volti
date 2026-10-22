import { widthPx, type Point, type Stroke } from './model';

function seg(ctx: CanvasRenderingContext2D, s: Stroke, a: Point, b: Point, w: number, h: number) {
  ctx.lineWidth = widthPx(s, (a[2] + b[2]) / 2, w);
  ctx.beginPath();
  ctx.moveTo(a[0] * w, a[1] * h);
  ctx.lineTo(b[0] * w, b[1] * h);
  ctx.stroke();
}

function style(ctx: CanvasRenderingContext2D, s: Stroke) {
  ctx.strokeStyle = s.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

/** Draw the newest segment of a pen stroke while it is being written. */
export function drawPenSegment(ctx: CanvasRenderingContext2D, s: Stroke, a: Point, b: Point) {
  style(ctx, s);
  seg(ctx, s, a, b, ctx.canvas.width, ctx.canvas.height);
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  const { width: w, height: h } = ctx.canvas;
  style(ctx, s);
  const pts = s.points;
  if (s.tool === 'highlighter') {
    // One path, so overlapping parts of the same stroke don't darken.
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.globalCompositeOperation = 'multiply';
    ctx.lineWidth = widthPx(s, 1, w);
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * w, pts[0][1] * h);
    for (const p of pts.length > 1 ? pts.slice(1) : pts) ctx.lineTo(p[0] * w, p[1] * h);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (pts.length === 1) seg(ctx, s, pts[0], pts[0], w, h);
  for (let i = 1; i < pts.length; i++) seg(ctx, s, pts[i - 1], pts[i], w, h);
}

export function drawAll(ctx: CanvasRenderingContext2D, strokes: Stroke[], extra?: Stroke) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (const s of strokes) drawStroke(ctx, s);
  if (extra) drawStroke(ctx, extra);
}
