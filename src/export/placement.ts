// Where a cut's music goes on an exported page: the transform that puts a page of the original,
// turned as it is shown, at the place its cut has on the frame, and the band it is clipped to. Pure
// geometry in PDF points; the exporting itself is in pdf.ts.

import type { Placed } from '../scores';

/** A PDF transformation matrix [a b c d e f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = [number, number, number, number, number, number];

/** A page of the original as embedded: its crop box's size in points, and how it is turned when shown. */
export interface SourcePage { width: number; height: number; rotation: number }

/** The page's size as shown, turned by its rotation. */
export function shownSize(p: SourcePage): { width: number; height: number } {
  const turned = ((p.rotation % 360) + 360) % 360;
  return turned === 90 || turned === 270 ? { width: p.height, height: p.width } : { width: p.width, height: p.height };
}

/** From the page as stored (its crop box, from 0,0) to the page as shown, both from the bottom left. */
export function turn(p: SourcePage): Matrix {
  switch (((p.rotation % 360) + 360) % 360) {
    case 90: return [0, -1, 1, 0, 0, p.width];
    case 180: return [-1, 0, 0, -1, p.width, p.height];
    case 270: return [0, 1, -1, 0, p.height, 0];
    default: return [1, 0, 0, 1, 0, 0];
  }
}

/** m then n: the matrix that applies m first. */
export function compose(m: Matrix, n: Matrix): Matrix {
  const [a, b, c, d, e, f] = m, [A, B, C, D, E, F] = n;
  return [a * A + b * C, a * B + b * D, c * A + d * C, c * B + d * D, e * A + f * C + E, e * B + f * D + F];
}

/**
 * Where cut `p` goes on an exported page `W` points wide and `H` high, as the reader stacks it
 * (frame lengths are in frame widths): the page it is cut from is drawn W wide, so the cut's top
 * lands at its place on the frame, and only the cut's band shows.
 */
export function placeCut(p: Placed, src: SourcePage, W: number, H: number): { matrix: Matrix; clip: { x: number; y: number; width: number; height: number } } {
  const shown = shownSize(src), s = W / shown.width;
  // The top of the page, measured down from the top of the frame.
  const pageTop = (p.top - p.cut.y0 * (shown.height / shown.width)) * W;
  const bottom = H - pageTop - shown.height * s;
  return {
    matrix: compose(turn(src), [s, 0, 0, s, 0, bottom]),
    clip: { x: 0, y: H - (p.top + p.h) * W, width: W, height: p.h * W },
  };
}
