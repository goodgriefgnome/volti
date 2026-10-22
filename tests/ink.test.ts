import { describe, expect, it } from 'vitest';
import { compact, touches, widthPx, type Stroke } from '../src/ink/model';

const line: Stroke = { tool: 'pen', color: '#000', size: 0.002, points: [[0.1, 0.5, 0.5], [0.5, 0.5, 0.5]] };

describe('touches', () => {
  it('finds a stroke under the eraser', () => {
    expect(touches(line, [0.3, 0.505, 0.5], 1.4, 0.012)).toBe(true);
  });
  it('misses a stroke out of reach', () => {
    expect(touches(line, [0.3, 0.55, 0.5], 1.4, 0.012)).toBe(false);
    expect(touches(line, [0.6, 0.5, 0.5], 1.4, 0.012)).toBe(false);
  });
  it('measures vertical distance in page widths', () => {
    // 0.008 of the page height is 0.0112 page widths on an A4-ish page: inside on a square page, outside on a tall one.
    expect(touches(line, [0.3, 0.508, 0.5], 1, 0.008)).toBe(true);
    expect(touches(line, [0.3, 0.508, 0.5], 1.5, 0.008)).toBe(false);
  });
  it('handles a single dot', () => {
    const dot: Stroke = { ...line, points: [[0.2, 0.2, 0.5]] };
    expect(touches(dot, [0.205, 0.2, 0.5], 1.4, 0.012)).toBe(true);
  });
});

describe('widthPx', () => {
  it('gets thicker with pressure for the pen', () => {
    expect(widthPx(line, 1, 1000)).toBeGreaterThan(widthPx(line, 0.1, 1000));
  });
  it('keeps the highlighter even', () => {
    const hl: Stroke = { ...line, tool: 'highlighter', size: 0.02 };
    expect(widthPx(hl, 0.1, 1000)).toBe(widthPx(hl, 1, 1000));
  });
});

describe('compact', () => {
  it('rounds to a size that is still far below a pixel', () => {
    expect(compact([[0.123456789, 0.987654321, 0.33333]])).toEqual([[0.1235, 0.9877, 0.33]]);
  });
});
