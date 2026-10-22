import { describe, expect, it } from 'vitest';
import type { Stroke } from '../markings/stroke';
import { forPages, migrate } from './store';

const A4 = 297 / 210;
const dot: Stroke = { tool: 'pen', color: '#000', size: 0.002, points: [[0.5, 0.5, 0.5]] };

describe('migrate', () => {
  it('gives each page one cut, with that page\'s ink and the reading position', () => {
    const { state, position } = migrate('s', 'Sarabande', [A4, A4, A4], { 2: [dot] }, 3);
    const [a, b, c] = state.piece.cuts;
    expect(state.ink).toEqual({ [b.id]: [dot] });
    expect(b.ownInk).toBe(true);
    expect(a.ownInk).toBeUndefined();
    expect(position).toBe(c.id);
  });
  it('starts at the beginning without a reading position', () => {
    expect(migrate('s', 't', [A4], undefined, undefined).position).toBeUndefined();
  });
});

describe('forPages', () => {
  it('drops cuts of pages the file no longer has', () => {
    const { state } = migrate('s', 't', [A4, A4, A4], undefined, undefined);
    expect(forPages(state, [A4, A4]).piece.cuts.map((c) => c.page)).toEqual([0, 1]);
  });
  it('starts again from the pages when nothing is left', () => {
    const { state } = migrate('s', 't', [A4, A4, A4], undefined, undefined);
    const s = { ...state, piece: { ...state.piece, cuts: state.piece.cuts.slice(2) } };
    expect(forPages(s, [A4]).piece.cuts.map((c) => c.page)).toEqual([0]);
  });
});
