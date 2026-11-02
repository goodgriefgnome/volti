import { describe, expect, it } from 'vitest';
import { _MAX_ZOOM, _slide, drag, fitScale, NO_ZOOM, pinch, placeFresh, scrollForPinch, visiblePart } from './zoom';

const W = 1000, H = 800;

const top = { top: 0, W, H };
const bar = { top: 113, W, H };

describe('fitScale and placeFresh', () => {
  it('fits at full size with no toolbar', () => {
    expect(fitScale(top)).toBe(1);
  });
  it('fits below the toolbar', () => {
    expect(fitScale(bar)).toBeCloseTo((800 - 113) / 800);
  });
  it('places a new screen whole below the toolbar, centred across', () => {
    const z = placeFresh(bar);
    expect(z.s).toBeCloseTo(fitScale(bar));
    expect(z.y).toBeCloseTo(113);
    expect(z.y + H * z.s).toBeCloseTo(800);
    expect(z.x * 2 + W * z.s).toBeCloseTo(W);
  });
});

describe('_slide', () => {
  it('moves a spread that fits freely inside the view, and stops at its edges', () => {
    expect(_slide(100, 300, 0, 1000, 200)).toBe(300);
    expect(_slide(100, 300, 0, 1000, 5000)).toBe(700);
    expect(_slide(100, 300, 0, 1000, -50)).toBe(50);
    expect(_slide(100, 300, 0, 1000, -5000)).toBe(0);
  });
  it('moves a spread bigger than the view until an edge meets the view', () => {
    expect(_slide(-500, 2000, 0, 1000, 200)).toBe(-300);
    expect(_slide(-500, 2000, 0, 1000, 5000)).toBe(0);
    expect(_slide(-500, 2000, 0, 1000, -5000)).toBe(-1000);
  });
  it('lets a spread that is out of bounds move only to show more', () => {
    // gap at the bottom, top under the view's top: pos -50, len 700 in a view of 113..800
    expect(_slide(-50, 687, 113, 800, 30)).toBe(-20); // moving down shows more of the top
    expect(_slide(-50, 687, 113, 800, 500)).toBe(113);
    expect(_slide(-50, 687, 113, 800, -30)).toBe(-50); // showing less leaves it
    // spread bigger than the view, hanging below the view's bottom by being too low
    expect(_slide(200, 2000, 0, 1000, 50)).toBe(200);
    expect(_slide(200, 2000, 0, 1000, -50)).toBe(150);
  });
  it('returns pos for no movement', () => {
    expect(_slide(123, 300, 0, 1000, 0)).toBe(123);
  });
});

describe('drag', () => {
  it('stops at the toolbar when dragging down at full size, and cannot go up', () => {
    expect(drag(NO_ZOOM, 0, 200, bar).y).toBe(113);
    expect(drag(NO_ZOOM, 0, -200, bar)).toEqual(NO_ZOOM);
  });
  it('cannot move an unzoomed spread with no toolbar', () => {
    expect(drag(NO_ZOOM, 100, -100, top)).toEqual(NO_ZOOM);
  });
  it('moves a zoomed spread with the finger', () => {
    expect(drag({ s: 2, x: -500, y: -400 }, 100, -50, top)).toEqual({ s: 2, x: -400, y: -450 });
  });
});

describe('pinch', () => {
  it('keeps the point between the fingers under the fingers', () => {
    const c = { x: 300, y: 200 };
    const z = pinch(NO_ZOOM, c, 100, c, 200, top, 1);
    expect(z.s).toBe(2);
    expect(300 * z.s + z.x).toBeCloseTo(300);
    expect(200 * z.s + z.y).toBeCloseTo(200);
  });
  it('follows the fingers when they move together', () => {
    const z = pinch(NO_ZOOM, { x: 500, y: 400 }, 100, { x: 450, y: 400 }, 200, top, 1);
    expect(500 * z.s + z.x).toBeCloseTo(450);
  });
  it('stays between the smallest and the largest zoom', () => {
    const c = { x: 500, y: 400 };
    expect(pinch(NO_ZOOM, c, 100, c, 50, top, 1).s).toBe(1);
    expect(pinch(NO_ZOOM, c, 100, c, 10000, top, 1).s).toBe(_MAX_ZOOM);
    expect(pinch(NO_ZOOM, c, 100, c, 10, bar, 0.8).s).toBe(0.8);
  });
  it('keeps an edge at the view edge there while pinching in', () => {
    const start = { s: 2, x: 0, y: 0 }; // left edge at the view's left edge
    const z = pinch(start, { x: 600, y: 300 }, 200, { x: 600, y: 300 }, 100, top, 1);
    expect(z.s).toBe(1);
    expect(z.x).toBe(0);
  });
  it('leaves the spread inside the view when pinched below its size', () => {
    const c = { x: 900, y: 700 };
    const z = pinch(NO_ZOOM, c, 200, c, 100, bar, 0.5);
    expect(z.x).toBeGreaterThanOrEqual(0);
    expect(z.x + W * z.s).toBeLessThanOrEqual(W + 1e-9);
    expect(z.y).toBeGreaterThanOrEqual(113 - 1e-9);
    expect(z.y + H * z.s).toBeLessThanOrEqual(H + 1e-9);
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

describe('scrollForPinch', () => {
  it('keeps the content under the fingers under them', () => {
    // At 1x, scrolled 100 across, the fingers at 50 are over content 150; at 2x that is at 300.
    const p = scrollForPinch(1, { x: 100, y: 0 }, { x: 50, y: 20 }, 2, { x: 50, y: 20 });
    expect(p).toEqual({ x: 250, y: 20 });
  });
  it('follows the fingers when they move together', () => {
    const p = scrollForPinch(2, { x: 0, y: 0 }, { x: 100, y: 0 }, 2, { x: 60, y: 0 });
    expect(p.x).toBe(40);
  });
});
