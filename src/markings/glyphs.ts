// The glyph table: the glyphs loaded so far, shared by the app, so drawing stays synchronous.
// What is stored, and how it is loaded, is in store.ts.

import type { PathCmd } from './draw';

export interface Glyph {
  cmds: PathCmd[];
  /** The tightest box around its outline: x0, y0, x1, y1 in em, y downwards. None for no outline. */
  bounds?: [x0: number, y0: number, x1: number, y1: number];
}

const table = new Map<string, Glyph>();

export const glyphKey = (font: string, gid: number) => `${font}:${gid}`;

/** Add a glyph from its path data, working out its bounds; one already there is left. */
export function addGlyph(key: string, d: string): void {
  if (table.has(key)) return;
  const cmds = _parsePath(d);
  table.set(key, { cmds, bounds: _pathBounds(cmds) });
}

export const glyphOf = (key: string): Glyph | undefined => table.get(key);

/** Path data (absolute M, L, C, Z) as commands. */
export function _parsePath(d: string): PathCmd[] {
  const out: PathCmd[] = [];
  const tokens = d.split(/\s+/).filter(Boolean);
  const args = { M: 2, L: 2, C: 6, Z: 0 } as const;
  for (let i = 0; i < tokens.length; ) {
    const c = tokens[i++] as keyof typeof args;
    const n = args[c];
    if (n === undefined) throw new Error(`Unknown path command ${c}`);
    const nums = tokens.slice(i, i + n).map(Number);
    i += n;
    out.push([c, ...nums] as unknown as PathCmd);
  }
  return out;
}

/** The t in (0, 1) where a cubic's derivative along one axis is zero. */
function extremes(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const ts: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) ts.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      ts.push((-b + sq) / (2 * a), (-b - sq) / (2 * a));
    }
  }
  return ts.filter((t) => t > 0 && t < 1);
}

const at = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
};

/** The tightest box around the path, to the extremes of its curves; undefined for no path. */
export function _pathBounds(cmds: readonly PathCmd[]): Glyph['bounds'] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x: number, y: number) => {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  };
  let cx = 0, cy = 0;
  for (const c of cmds) {
    if (c[0] === 'M' || c[0] === 'L') {
      add(c[1], c[2]);
      [cx, cy] = [c[1], c[2]];
    } else if (c[0] === 'C') {
      for (const t of extremes(cx, c[1], c[3], c[5])) add(at(cx, c[1], c[3], c[5], t), at(cy, c[2], c[4], c[6], t));
      for (const t of extremes(cy, c[2], c[4], c[6])) add(at(cx, c[1], c[3], c[5], t), at(cy, c[2], c[4], c[6], t));
      add(c[5], c[6]);
      [cx, cy] = [c[5], c[6]];
    }
  }
  return x0 === Infinity ? undefined : [x0, y0, x1, y1];
}
