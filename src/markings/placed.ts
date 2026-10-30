// Symbols and text, placed whole at a point: their data, extent and drawing. Only what is
// particular to them; what all markings share is in model.ts.

import type { PathCmd } from './draw';
import { glyphKey, glyphOf } from './glyphs';
import type { DrawTarget, Marking, Point, _KindBehaviour } from './model';

export interface PlacedMark {
  kind: 'symbol' | 'text';
  text: string;
  font: string;
  /** Glyph index, then origin in em from the centre of its extent, y downwards. */
  glyphs: [gid: number, x: number, y: number][];
  /** The centre of its extent, as fractions of the page's width and height. */
  at: [x: number, y: number];
  /** Its em size, in page widths. */
  size: number;
  color?: string;
  /** None when missing. */
  background?: Background;
}

export interface Background {
  shape: 'box' | 'tag-left' | 'tag-right';
  /** The default background colour when missing. */
  color?: string;
}

/** The app's colours for placed markings without their own: the marking, and its background. */
export interface MarkColors { color: string; background: string }

/** Until the user sets them: the first pen colour, and light blue. */
export const BUILT_IN_COLORS: MarkColors = { color: '#1c1f26', background: '#cce0ff' };

let colors: MarkColors = BUILT_IN_COLORS;

/** The default colours now. */
export const markColors = (): MarkColors => colors;

/** Set them, each missing one going back to its built-in colour. */
export function setMarkColors(c: Partial<MarkColors>): void {
  colors = { ...BUILT_IN_COLORS, ...c };
}

const round = (v: number) => Math.round(v * 10000) / 10000;

type Box = [x0: number, y0: number, x1: number, y1: number];

/** Its extent in em, from its centre; undefined when none of its glyphs has an outline (or is loaded). */
export function emExtent(m: PlacedMark): Box | undefined {
  let box: Box | undefined;
  for (const [gid, x, y] of m.glyphs) {
    const b = glyphOf(glyphKey(m.font, gid))?.bounds;
    if (!b) continue;
    const moved: Box = [b[0] + x, b[1] + y, b[2] + x, b[3] + y];
    box = box ? [Math.min(box[0], moved[0]), Math.min(box[1], moved[1]), Math.max(box[2], moved[2]), Math.max(box[3], moved[3])] : moved;
  }
  return box;
}

/** A background's padding round the ink, in em. */
const PADDING = 0.12;
/** How far a tag's point sticks out, as a share of its height: each edge 30° off the vertical. */
const POINT = Math.tan(Math.PI / 6) / 2;

/**
 * Its background's outline in em from its centre, clockwise from the top left: the ink's box grown
 * by the padding, with a point at the middle of its left or right end for a tag; undefined
 * without a background or ink.
 */
export function backgroundOutline(m: PlacedMark): [number, number][] | undefined {
  const e = m.background && emExtent(m);
  if (!e || !m.background) return undefined;
  const x0 = e[0] - PADDING, y0 = e[1] - PADDING, x1 = e[2] + PADDING, y1 = e[3] + PADDING;
  const mid = (y0 + y1) / 2, point = (y1 - y0) * POINT;
  const out: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  if (m.background.shape === 'tag-right') out.splice(2, 0, [x1 + point, mid]);
  else if (m.background.shape === 'tag-left') out.push([x0 - point, mid]);
  return out;
}

/** What it covers, in em from its centre: its ink, and its background when it has one. */
export function markExtent(m: PlacedMark): Box | undefined {
  const o = backgroundOutline(m);
  if (!o) return emExtent(m);
  const xs = o.map((p) => p[0]), ys = o.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * Shaped glyphs (origins in em from the start of the baseline) moved so the centre of their ink is
 * the origin, and that centre from the start of the baseline; undefined when they have no ink.
 * The glyphs must be in the glyph table.
 */
export function centred(
  font: string, glyphs: readonly { gid: number; x: number; y: number }[],
): { glyphs: [number, number, number][]; centre: [number, number] } | undefined {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const g of glyphs) {
    const b = glyphOf(glyphKey(font, g.gid))?.bounds;
    if (!b) continue;
    x0 = Math.min(x0, b[0] + g.x); x1 = Math.max(x1, b[2] + g.x);
    y0 = Math.min(y0, b[1] + g.y); y1 = Math.max(y1, b[3] + g.y);
  }
  if (x0 === Infinity) return undefined;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { glyphs: glyphs.map((g) => [g.gid, round(g.x - cx), round(g.y - cy)]), centre: [cx, cy] };
}

/** Where the start of its baseline is, in em from its centre (its first glyph's origin). */
export function baselineStart(m: PlacedMark): [number, number] {
  return m.glyphs.length ? [m.glyphs[0][1], m.glyphs[0][2]] : [0, 0];
}

/**
 * A text marking of `text` in `font`, shaped as `glyphs`, at `size`, its baseline starting at
 * `start` (frame coordinates: x in frame widths, y in frame widths from the frame's top); undefined
 * when it has no ink (empty, or spaces only).
 */
export function textMark(
  font: string, text: string, glyphs: readonly { gid: number; x: number; y: number }[], start: readonly [number, number], size: number,
): PlacedMark | undefined {
  const c = centred(font, glyphs);
  if (!c) return undefined;
  return { kind: 'text', text, font, glyphs: c.glyphs, at: [start[0] + c.centre[0] * size, start[1] + c.centre[1] * size], size };
}

/** The glyph keys a score's ink needs. */
export function glyphKeysIn(ink: Record<string, readonly Marking[]>): Set<string> {
  const keys = new Set<string>();
  for (const list of Object.values(ink)) {
    for (const m of list) if ('kind' in m) for (const [gid] of m.glyphs) keys.add(glyphKey(m.font, gid));
  }
  return keys;
}

/** Every glyph's commands, placed on the target. */
function placeGlyphs(t: DrawTarget, m: PlacedMark): PathCmd[] {
  const cx = m.at[0] * t.w - t.ox, cy = m.at[1] * t.h - t.oy, s = m.size * t.w;
  const out: PathCmd[] = [];
  for (const [gid, gx, gy] of m.glyphs) {
    const g = glyphOf(glyphKey(m.font, gid));
    if (!g) continue;
    const X = (x: number) => cx + (gx + x) * s;
    const Y = (y: number) => cy + (gy + y) * s;
    for (const c of g.cmds) {
      if (c[0] === 'M' || c[0] === 'L') out.push([c[0], X(c[1]), Y(c[2])]);
      else if (c[0] === 'C') out.push(['C', X(c[1]), Y(c[2]), X(c[3]), Y(c[4]), X(c[5]), Y(c[6])]);
      else out.push(['Z']);
    }
  }
  return out;
}

/** Its background's outline, placed on the target as a closed shape. */
function placeBackground(t: DrawTarget, m: PlacedMark): PathCmd[] {
  const o = backgroundOutline(m);
  if (!o) return [];
  const cx = m.at[0] * t.w - t.ox, cy = m.at[1] * t.h - t.oy, s = m.size * t.w;
  return [...o.map(([x, y], i): PathCmd => [i ? 'L' : 'M', cx + x * s, cy + y * s]), ['Z']];
}

function drawPlaced(t: DrawTarget, m: PlacedMark) {
  const all = placeGlyphs(t, m);
  if (!all.length) return;
  const back = placeBackground(t, m);
  if (back.length) t.draw.shape(back, { fill: { color: m.background?.color ?? colors.background, opacity: 1, multiply: true } });
  t.draw.shape(all, { stroke: { color: '#ffffff', opacity: 0.5, multiply: false }, width: 0.04 * m.size * t.w });
  t.draw.shape(all, { fill: { color: m.color ?? colors.color, opacity: 1, multiply: false } });
}

/** What markings/model.ts needs to know about placed markings. */
export const _placed: _KindBehaviour<PlacedMark> = {
  share: (m, lo, hi) => (m.at[1] >= lo && m.at[1] <= hi ? 1 : 0),
  anchor: (m): Point => [m.at[0], m.at[1], 0],
  map: (m, f) => {
    const [x, y] = f([m.at[0], m.at[1], 0]);
    return { ...m, at: [x, y] };
  },
  hits: (m, p, aspect, radius) => {
    const e = markExtent(m);
    if (!e) return false;
    const dx = p[0] - m.at[0], dy = (p[1] - m.at[1]) * aspect;
    return dx >= e[0] * m.size - radius && dx <= e[2] * m.size + radius && dy >= e[1] * m.size - radius && dy <= e[3] * m.size + radius;
  },
  draw: drawPlaced,
  annotation: (_t, m) =>
    m.kind === 'text' ? { subtype: 'FreeText', contents: m.text } : { subtype: 'Stamp', contents: m.text, color: m.color ?? colors.color },
  compact: (m) => ({ ...m, at: [round(m.at[0]), round(m.at[1])], size: round(m.size) }),
  copy: (m) => ({
    ...m, at: [...m.at], glyphs: m.glyphs.map((g) => [...g]),
    ...(m.background && { background: { ...m.background } }),
  }),
};
