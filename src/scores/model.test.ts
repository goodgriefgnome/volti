import { describe, expect, it } from 'vitest';
import { A4, forPages, newScore } from './model';
import { aspects } from './testing';

const fresh = () => ({ score: newScore('s', 't', [A4, A4, A4]), ink: {} });

describe('newScore', () => {
  it('has every page once, in order', () => {
    const p = newScore('p', 'Sarabande', aspects);
    expect(p.cuts.map((c) => [c.page, c.y0, c.y1])).toEqual([[0, 0, 1], [1, 0, 1], [2, 0, 1]]);
    expect(new Set(p.cuts.map((c) => c.id)).size).toBe(3);
  });
});

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
