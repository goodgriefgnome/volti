import { describe, expect, it } from 'vitest';
import { clamp, MAX_ZOOM, NO_ZOOM, pan, pinch, visiblePart } from './zoom';

const W = 1000, H = 800;

describe('pinch', () => {
  it('keeps the point between the fingers under the fingers', () => {
    const c = { x: 300, y: 200 };
    const z = pinch(NO_ZOOM, c, 100, c, 200, W, H);
    expect(z.s).toBe(2);
    // the spread point (300, 200) is still drawn at (300, 200)
    expect(300 * z.s + z.x).toBeCloseTo(300);
    expect(200 * z.s + z.y).toBeCloseTo(200);
  });
  it('follows the fingers when they move together', () => {
    const z = pinch(NO_ZOOM, { x: 500, y: 400 }, 100, { x: 450, y: 400 }, 200, W, H);
    expect(500 * z.s + z.x).toBeCloseTo(450);
  });
  it('stays between 1x and the maximum', () => {
    const c = { x: 500, y: 400 };
    expect(pinch(NO_ZOOM, c, 100, c, 50, W, H).s).toBe(1);
    expect(pinch(NO_ZOOM, c, 100, c, 10000, W, H).s).toBe(MAX_ZOOM);
  });
});

describe('clamp and pan', () => {
  it('never shows anything beyond the spread', () => {
    expect(clamp({ s: 2, x: 50, y: 50 }, W, H)).toEqual({ s: 2, x: 0, y: 0 });
    expect(clamp({ s: 2, x: -5000, y: -5000 }, W, H)).toEqual({ s: 2, x: -1000, y: -800 });
  });
  it('cannot move an unzoomed spread', () => {
    expect(pan(NO_ZOOM, 100, -100, W, H)).toEqual(NO_ZOOM);
  });
  it('moves a zoomed spread with the finger', () => {
    expect(pan({ s: 2, x: -500, y: -400 }, 100, -50, W, H)).toEqual({ s: 2, x: -400, y: -450 });
  });
});

describe('visiblePart', () => {
  const box = { x: 100, y: 50, w: 400, h: 600 };
  it('is the whole page when not zoomed', () => {
    expect(visiblePart(NO_ZOOM, W, H, box)).toEqual({ x: 0, y: 0, w: 400, h: 600 });
  });
  it('is the corner in view when zoomed into the top left', () => {
    // 2x at the stage origin shows spread coordinates 0..500 x 0..400
    expect(visiblePart({ s: 2, x: 0, y: 0 }, W, H, box)).toEqual({ x: 0, y: 0, w: 400, h: 350 });
  });
  it('is nothing for a page out of view', () => {
    expect(visiblePart({ s: 4, x: -3000, y: 0 }, W, H, box)).toBeNull();
  });
});
