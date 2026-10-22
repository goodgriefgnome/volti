import { describe, expect, it } from 'vitest';
import { newScore } from './model';
import { aspects } from './testing';

describe('newScore', () => {
  it('has every page once, in order, landscape for portrait-shaped pages', () => {
    const p = newScore('p', 'Sarabande', aspects);
    expect(p.cuts.map((c) => [c.page, c.y0, c.y1])).toEqual([[0, 0, 1], [1, 0, 1], [2, 0, 1]]);
    expect(p.orientation).toBe('landscape');
    expect(new Set(p.cuts.map((c) => c.id)).size).toBe(3);
  });
});
