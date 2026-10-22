import { describe, expect, it } from 'vitest';
import type { Stroke } from '../ink/model';
import { claimFirstPass, claimStroke, share, splitStrokes, visible } from './ink';
import { pack, type Cut, type State } from './model';

const A4 = 297 / 210;
const aspects = [A4, A4, A4];

let n = 0;
const cut = (page: number, y0 = 0, y1 = 1, extra: Partial<Cut> = {}): Cut => ({ id: `c${n++}`, page, y0, y1, ...extra });
const state = (cuts: Cut[], ink: State['ink'] = {}): State => ({
  piece: { id: 'p', sourceId: 's', title: 't', key: '', orientation: 'landscape', cuts, archived: [] },
  ink,
});
const line = (y0: number, y1: number): Stroke => ({ tool: 'pen', color: '#000', size: 0.002, points: [[0.5, y0, 0.5], [0.5, y1, 0.5]] });

/** The design doc's example: page 1, page 2, page 3's first system, page 2's last system, page 3. */
const sarabande = () => state([cut(0), cut(1), cut(2, 0, 1 / 3), cut(1, 2 / 3, 1), cut(2)]);

describe('ink shares', () => {
  it('weights by path length, scaling vertical distance by the page aspect', () => {
    const l: Stroke = { ...line(0, 0), points: [[0, 0.1, 0.5], [0.5, 0.1, 0.5], [0.5, 0.6, 0.5]] };
    // 0.5 across inside, then 0.5 * A4 down of which 0.4 * A4 is outside 0..0.2
    expect(share(l.points, 0, 0.2, A4)).toBeCloseTo((0.5 + 0.1 * A4) / (0.5 + 0.5 * A4));
  });
  it('counts a dot as wholly where it is', () => {
    const dot: Stroke = { ...line(0, 0), points: [[0.3, 0.4, 0.5]] };
    expect(share(dot.points, 0.3, 0.5, A4)).toBe(1);
    expect(share(dot.points, 0.5, 0.6, A4)).toBe(0);
  });
  it('shows a stroke when most of it is in the cut', () => {
    expect(visible(line(0.25, 0.45), cut(0, 0.3, 1), A4)).toBe(true);
    expect(visible(line(0.1, 0.35), cut(0, 0.3, 1), A4)).toBe(false);
  });
  it('splitStrokes and claimFirstPass agree on a simple case', () => {
    const [up, down] = splitStrokes([line(0.1, 0.2), line(0.8, 0.9)], 0.5, A4);
    expect([up.length, down.length]).toEqual([1, 1]);
    const c = cut(0);
    expect(claimFirstPass([c], { [c.id]: [line(0.1, 0.2)] }, A4)).toHaveLength(1);
  });
});

describe('claimStroke', () => {
  it('gives a stroke across a seam to the cut with most of it, in that cut\'s page coordinates', () => {
    const [, , f] = pack(sarabande().piece.cuts, aspects);
    const seam = A4 / 3;
    const s: Stroke = { ...line(0, 0), points: [[0.5, seam - 0.05, 0.5], [0.5, seam + 0.2, 0.5]] };
    const r = claimStroke(f, s, aspects)!;
    expect(r.cut.page).toBe(1);
    expect(r.stroke.points[0][1]).toBeCloseTo(2 / 3 - 0.05 / A4);
    expect(r.stroke.points[1][1]).toBeCloseTo(2 / 3 + 0.2 / A4);
  });
  it('gives a stroke in blank space to the nearest cut', () => {
    const [, , f] = pack(sarabande().piece.cuts, aspects);
    const s: Stroke = { ...line(0, 0), points: [[0.5, A4 - 0.05, 0.5]] };
    expect(claimStroke(f, s, aspects)!.cut.page).toBe(1);
  });
});
