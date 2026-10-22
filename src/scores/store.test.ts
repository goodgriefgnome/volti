import { describe, expect, it } from 'vitest';
import { newScore } from './model';
import { forPages } from './store';

const A4 = 297 / 210;
const fresh = () => ({ score: newScore('s', 't', [A4, A4, A4]), ink: {} });

describe('forPages', () => {
  it('drops cuts of pages the original no longer has', () => {
    expect(forPages(fresh(), [A4, A4]).score.cuts.map((c) => c.page)).toEqual([0, 1]);
  });
  it('starts again from the pages when nothing is left', () => {
    const state = fresh();
    const s = { ...state, score: { ...state.score, cuts: state.score.cuts.slice(2) } };
    expect(forPages(s, [A4]).score.cuts.map((c) => c.page)).toEqual([0]);
  });
});
