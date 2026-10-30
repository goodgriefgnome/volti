import { beforeAll, describe, expect, it } from 'vitest';
import { addGlyph } from '../markings/glyphs';
import type { PlacedMark } from '../markings/placed';
import { pack } from './frames';
import { extentOnFrame, placedAt } from './placing';
import { A4, aspects, cut } from './testing';

beforeAll(() => {
  addGlyph('p:1', 'M 0 0 L 1 0 L 1 -1 L 0 -1 Z');
});

/** A one-glyph symbol, 1 em square, centred at (x, y) of its page, `size` page widths. */
const mark = (x: number, y: number, size = 0.1): PlacedMark => ({ kind: 'symbol', text: 'x', font: 'p', glyphs: [[1, -0.5, 0.5]], at: [x, y], size });

describe('extentOnFrame', () => {
  it('is in frame widths from the top of the frame, for a cut that starts mid-page', () => {
    const c = cut(0, 0.5, 1);
    const [f] = pack([cut(0, 0, 0.25), c], aspects);
    const item = f.items[1];
    // 0.75 of the page is 0.25 of it below the cut's start: A4 × 0.25 down the cut, below the first cut's A4 × 0.25.
    const e = extentOnFrame(item, mark(0.4, 0.75), A4)!;
    const top = A4 * 0.25 + A4 * 0.25;
    expect(e[0]).toBeCloseTo(0.35);
    expect(e[2]).toBeCloseTo(0.45);
    expect(e[1]).toBeCloseTo(top - 0.05);
    expect(e[3]).toBeCloseTo(top + 0.05);
  });
  it('is undefined for a marking with no outline loaded', () => {
    const [f] = pack([cut(0)], aspects);
    expect(extentOnFrame(f.items[0], { ...mark(0.5, 0.5), glyphs: [[99, 0, 0]] }, A4)).toBeUndefined();
  });
});

describe('placedAt', () => {
  const c = cut(0);
  const [frame] = pack([c], aspects);
  const below = mark(0.5, 0.5), above = mark(0.52, 0.5);
  const ink = { [c.id]: [below, above] };
  const y = A4 * 0.5;
  it('finds the one drawn last where two overlap', () => {
    expect(placedAt(frame, ink, aspects, [0.51, y], 0)?.mark).toBe(above);
    expect(placedAt(frame, ink, aspects, [0.46, y], 0)?.mark).toBe(below);
  });
  it('finds one within the margin, and misses outside it', () => {
    expect(placedAt(frame, ink, aspects, [0.6, y], 0)).toBeUndefined();
    expect(placedAt(frame, ink, aspects, [0.58, y], 0.02)?.mark).toBe(above);
    expect(placedAt(frame, ink, aspects, [0.3, y], 0.02)).toBeUndefined();
  });
});
