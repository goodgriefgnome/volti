// Fixtures for tests that need cuts, scores or strokes. Only tests import this.

import type { PlacedMark } from '../markings/placed';
import type { Stroke } from '../markings/stroke';
import { A4, type Cut, type State } from './model';

export { A4 };
export const aspects = [A4, A4, A4];

let n = 0;
export const cut = (page: number, y0 = 0, y1 = 1, extra: Partial<Cut> = {}): Cut => ({ id: `c${n++}`, page, y0, y1, ...extra });
export const state = (cuts: Cut[], ink: State['ink'] = {}): State => ({
  score: { id: 'p', key: '', cuts, archived: [] },
  ink,
});
export const _line = (y0: number, y1: number): Stroke => ({ tool: 'pen', color: '#000', size: 0.002, points: [[0.5, y0, 0.5], [0.5, y1, 0.5]] });
/** A symbol with the glyph 0 of font `f` at (x, y), 0.03 page widths. */
export const _mark = (x: number, y: number): PlacedMark => ({ kind: 'symbol', text: 'x', font: 'f', glyphs: [[0, 0, 0]], at: [x, y], size: 0.03 });
export const _pages = (s: State) => s.score.cuts.map((c) => [c.page, +c.y0.toFixed(3), +c.y1.toFixed(3)]);

/** A sarabande with a repeat: page 1, page 2, page 3's first system, page 2's last system, page 3. */
export const sarabande = () => state([cut(0), cut(1), cut(2, 0, 1 / 3), cut(1, 2 / 3, 1), cut(2)]);
