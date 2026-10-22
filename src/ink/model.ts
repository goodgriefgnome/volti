/** x and y as fractions of the page width and height, so ink survives any zoom; then pen pressure 0..1. */
export type Point = [x: number, y: number, pressure: number];

export type InkTool = 'pen' | 'highlighter';

export interface Stroke {
  tool: InkTool;
  color: string;
  /** Line width as a fraction of the page width. */
  size: number;
  points: Point[];
}

/** Strokes by page number. */
export type ScoreInk = Record<number, Stroke[]>;

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
