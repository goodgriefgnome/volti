import { describe, expect, it } from 'vitest';
import { compact, _hitDistance, _widthPx, type Stroke } from './stroke';

const line: Stroke = { tool: 'pen', color: '#000', size: 0.002, points: [[0.1, 0.5, 0.5], [0.5, 0.5, 0.5]] };

describe('hitDistance', () => {
  it('finds a stroke under the eraser', () => {
    expect(_hitDistance(line, [0.3, 0.505, 0.5], 0.012, 1.4)).toBeDefined();
  });
  it('misses a stroke out of reach', () => {
    expect(_hitDistance(line, [0.3, 0.55, 0.5], 0.012, 1.4)).toBeUndefined();
    expect(_hitDistance(line, [0.6, 0.5, 0.5], 0.012, 1.4)).toBeUndefined();
  });
  it('measures vertical distance in page widths', () => {
    // 0.008 of the page height is 0.0112 page widths on an A4-ish page: inside on a square page, outside on a tall one.
    expect(_hitDistance(line, [0.3, 0.508, 0.5], 0.008, 1)).toBeDefined();
    expect(_hitDistance(line, [0.3, 0.508, 0.5], 0.008, 1.5)).toBeUndefined();
  });
  it('handles a single dot', () => {
    const dot: Stroke = { ...line, points: [[0.2, 0.2, 0.5]] };
    expect(_hitDistance(dot, [0.205, 0.2, 0.5], 0.012, 1.4)).toBeDefined();
  });
  it('is 0 on the line, and measured from its edge', () => {
    const wide: Stroke = { ...line, size: 0.004 };
    expect(_hitDistance(wide, [0.3, 0.5, 0.5], 0.05, 1)).toBe(0);
    expect(_hitDistance(wide, [0.3, 0.51, 0.5], 0.05, 1)).toBeCloseTo(0.008);
  });
});

describe('widthPx', () => {
  it('gets thicker with pressure for the pen', () => {
    expect(_widthPx(line, 1, 1000)).toBeGreaterThan(_widthPx(line, 0.1, 1000));
  });
  it('keeps the highlighter even', () => {
    const hl: Stroke = { ...line, tool: 'highlighter', size: 0.02 };
    expect(_widthPx(hl, 0.1, 1000)).toBe(_widthPx(hl, 1, 1000));
  });
});

describe('compact', () => {
  it('rounds to a size that is still far below a pixel', () => {
    expect(compact([[0.123456789, 0.987654321, 0.33333]])).toEqual([[0.1235, 0.9877, 0.33]]);
  });
});
