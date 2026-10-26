import { describe, expect, it } from 'vitest';
import type { Placed } from '../scores';
import { compose, placeCut, shownSize, turn, type Matrix } from './placement';

const apply = ([a, b, c, d, e, f]: Matrix, x: number, y: number) => [a * x + c * y + e, b * x + d * y + f].map((v) => Math.round(v * 1e6) / 1e6);

describe('turn', () => {
  it('turns a page shown a quarter turn clockwise so its left edge is the top', () => {
    const p = { width: 600, height: 800, rotation: 90 };
    expect(shownSize(p)).toEqual({ width: 800, height: 600 });
    expect(apply(turn(p), 0, 800)).toEqual([800, 600]); // top left -> top right
    expect(apply(turn(p), 0, 0)).toEqual([0, 600]); // bottom left -> top left
  });

  it('keeps every corner on the page shown, whichever way it turns', () => {
    for (const rotation of [0, 90, 180, 270, -90]) {
      const p = { width: 600, height: 800, rotation }, s = shownSize(p);
      for (const [x, y] of [[0, 0], [600, 0], [0, 800], [600, 800]]) {
        const [X, Y] = apply(turn(p), x, y);
        expect(X >= 0 && X <= s.width && Y >= 0 && Y <= s.height).toBe(true);
      }
    }
  });
});

describe('compose', () => {
  it('applies the first matrix first', () => {
    const scale: Matrix = [2, 0, 0, 2, 0, 0], move: Matrix = [1, 0, 0, 1, 10, 0];
    expect(apply(compose(scale, move), 1, 1)).toEqual([12, 2]);
  });
});

describe('placeCut', () => {
  it('puts the cut\'s band where the frame has it, the page drawn the frame\'s width', () => {
    // An A4-ish page 500 x 700 points; the cut is its lower half, placed at the top of the frame.
    const src = { width: 500, height: 700, rotation: 0 }, a = 700 / 500;
    const p: Placed = { cut: { id: 'c', page: 0, y0: 0.5, y1: 1 }, index: 0, top: 0, h: 0.5 * a };
    const W = 1000, H = W * a;
    const { matrix, clip } = placeCut(p, src, W, H);
    // The page's middle (y = 350 up from its bottom) lands at the top of the frame.
    expect(apply(matrix, 0, 350)).toEqual([0, H]);
    expect(apply(matrix, 500, 0)).toEqual([W, H / 2]);
    expect(clip).toEqual({ x: 0, y: H / 2, width: W, height: H / 2 });
  });
});
