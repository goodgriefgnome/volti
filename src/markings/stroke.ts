import type { DrawTarget, KindBehaviour, Point } from './model';

// Pen and highlighter strokes.

export type InkTool = 'pen' | 'highlighter';

export interface Stroke {
  tool: InkTool;
  color: string;
  /** Line width as a fraction of the page width. */
  size: number;
  points: Point[];
}

export const PEN_COLORS = ['#1c1f26', '#c2271d', '#1f4fd1'] as const;
export const HIGHLIGHT_COLOR = '#ffd400';
export const PEN_SIZE = 0.0022;
export const HIGHLIGHT_SIZE = 0.018;

/** Width in pixels for one segment of a stroke drawn on a page `pageWidthPx` wide. */
export function widthPx(stroke: Stroke, pressure: number, pageWidthPx: number): number {
  if (stroke.tool === 'highlighter') return stroke.size * pageWidthPx;
  return stroke.size * pageWidthPx * (0.35 + 1.3 * pressure);
}

/** Round points to keep stored ink small; 1/10000 of a page is far below a pixel. */
export function compact(points: Point[]): Point[] {
  const r = (v: number) => Math.round(v * 10000) / 10000;
  return points.map(([x, y, p]) => [r(x), r(y), Math.round(p * 100) / 100]);
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax, vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0;
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

/**
 * Whether the eraser at `p` touches the stroke. Works in page-width units, so `aspect`
 * (page height / width) is needed to measure vertical distance correctly.
 */
export function touches(stroke: Stroke, p: Point, aspect: number, radius: number): boolean {
  const reach = radius + stroke.size / 2;
  const pts = stroke.points;
  if (pts.length === 1) return Math.hypot(pts[0][0] - p[0], (pts[0][1] - p[1]) * aspect) <= reach;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    if (segDist(p[0], p[1] * aspect, ax, ay * aspect, bx, by * aspect) <= reach) return true;
  }
  return false;
}

/**
 * How much of a path lies between lo and hi in y, as a fraction of its length. Lengths are in
 * page widths, so y is scaled by `aspect`. A path of no length counts as wholly where it starts.
 */
export function share(points: readonly Point[], lo: number, hi: number, aspect: number): number {
  let inside = 0, total = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i];
    const len = Math.hypot(bx - ax, (by - ay) * aspect);
    if (!len) continue;
    total += len;
    const top = Math.min(ay, by), bottom = Math.max(ay, by);
    if (bottom === top) { if (top >= lo && top <= hi) inside += len; continue; }
    inside += len * Math.max(0, Math.min(hi, bottom) - Math.max(lo, top)) / (bottom - top);
  }
  if (!total) return points.length && points[0][1] >= lo && points[0][1] <= hi ? 1 : 0;
  return inside / total;
}

/* ---------- drawing ---------- */

function seg(t: DrawTarget, s: Stroke, a: Point, b: Point) {
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
export function drawPenSegment(t: DrawTarget, s: Stroke, a: Point, b: Point) {
  style(t.ctx, s);
  seg(t, s, a, b);
}

function drawStroke(t: DrawTarget, s: Stroke) {
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

/** What markings/model.ts needs to know about strokes. */
export const strokes: KindBehaviour<Stroke> = {
  share: (s, lo, hi, aspect) => share(s.points, lo, hi, aspect),
  anchor: (s) => s.points[0],
  map: (s, f) => ({ ...s, points: s.points.map(f) }),
  hits: touches,
  draw: drawStroke,
  compact: (s) => ({ ...s, points: compact(s.points) }),
  copy: (s) => ({ ...s, points: s.points.map((p) => [...p]) }),
};
