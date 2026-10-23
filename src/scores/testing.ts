// Fixtures for tests that need cuts, scores or strokes. Only tests import this.

import type { Stroke } from '../markings/stroke';
import type { Cut, State } from './model';

export const A4 = 297 / 210;
export const aspects = [A4, A4, A4];

let n = 0;
export const cut = (page: number, y0 = 0, y1 = 1, extra: Partial<Cut> = {}): Cut => ({ id: `c${n++}`, page, y0, y1, ...extra });
export const state = (cuts: Cut[], ink: State['ink'] = {}): State => ({
  score: { id: 'p', title: 't', key: '', cuts, archived: [] },
  ink,
});
export const line = (y0: number, y1: number): Stroke => ({ tool: 'pen', color: '#000', size: 0.002, points: [[0.5, y0, 0.5], [0.5, y1, 0.5]] });
export const pages = (s: State) => s.score.cuts.map((c) => [c.page, +c.y0.toFixed(3), +c.y1.toFixed(3)]);

/** A sarabande with a repeat: page 1, page 2, page 3's first system, page 2's last system, page 3. */
export const sarabande = () => state([cut(0), cut(1), cut(2, 0, 1 / 3), cut(1, 2 / 3, 1), cut(2)]);
