import { beforeAll, describe, expect, it } from 'vitest';
import type { Drawing, Paint, PathCmd } from './draw';
import { addGlyph } from './glyphs';
import { _placed, emExtent, glyphKeysIn, PLACED_COLOR, type PlacedMark } from './placed';
import type { DrawTarget } from './model';
import type { Stroke } from './stroke';

beforeAll(() => {
  addGlyph('t:1', 'M 0 0 L 1 0 L 1 -1 L 0 -1 Z');
  addGlyph('t:2', 'M 0 0 L 2 0 L 2 -0.5 Z');
});

// Glyph 1 spans -0.5..0.5 either way from the centre, glyph 2 0.5..2.5 across and -0.5..0 up.
const mark: PlacedMark = { kind: 'symbol', text: 'ab', font: 't', glyphs: [[1, -0.5, 0.5], [2, 0.5, 0]], at: [0.5, 0.5], size: 0.1 };

describe('placed markings', () => {
  it('belong wholly to the band their centre is in', () => {
    expect(_placed.share(mark, 0.4, 0.6, 1.4)).toBe(1);
    expect(_placed.share(mark, 0.6, 0.9, 1.4)).toBe(0);
    expect(_placed.anchor(mark)).toEqual([0.5, 0.5, 0]);
  });
  it('move their centre through f, leaving the rest', () => {
    const m = _placed.map(mark, ([x, y]) => [x + 0.1, y * 2, 0.7]);
    expect(m.at).toEqual([0.6, 1]);
    expect({ ...m, at: mark.at }).toEqual(mark);
  });
  it('have an extent round their glyphs, in em from their centre', () => {
    expect(emExtent(mark)).toEqual([-0.5, -0.5, 2.5, 0.5]);
    expect(emExtent({ ...mark, glyphs: [[99, 0, 0]] })).toBeUndefined();
  });
  it('are hit within their extent, grown by the radius, in page widths', () => {
    // 0.45..0.75 across, 0.45..0.55 down (in page widths from y 0.5 × aspect).
    expect(_placed.hits(mark, [0.5, 0.5, 0], 1.4, 0)).toBe(true);
    expect(_placed.hits(mark, [0.9, 0.5, 0], 1.4, 0)).toBe(false);
    expect(_placed.hits(mark, [0.77, 0.5, 0], 1.4, 0)).toBe(false);
    expect(_placed.hits(mark, [0.77, 0.5, 0], 1.4, 0.03)).toBe(true);
    expect(_placed.hits(mark, [0.5, 0.54, 0], 1, 0)).toBe(true);
    expect(_placed.hits(mark, [0.5, 0.54, 0], 1.4, 0)).toBe(false);
  });
  it('are rounded to 1/10000, and copied apart', () => {
    const c = _placed.compact({ ...mark, at: [0.123456, 0.654321], size: 0.0351234 });
    expect(c.at).toEqual([0.1235, 0.6543]);
    expect(c.size).toBe(0.0351);
    const copy = _placed.copy(mark);
    expect(copy).toEqual(mark);
    expect(copy.at).not.toBe(mark.at);
    expect(copy.glyphs[0]).not.toBe(mark.glyphs[0]);
  });
  it('need the glyphs of their fonts', () => {
    const stroke: Stroke = { tool: 'pen', color: '#000', size: 0.002, points: [[0, 0, 0]] };
    expect(glyphKeysIn({ a: [mark, stroke], b: [mark] })).toEqual(new Set(['t:1', 't:2']));
  });
  it('draw a half-opaque white halo, then the glyphs in their colour', () => {
    const shapes: [readonly PathCmd[], Paint][] = [];
    const draw: Drawing = { path() {}, shape: (cmds, paint) => void shapes.push([cmds, paint]) };
    const t: DrawTarget = { draw, w: 1000, h: 1400, ox: 0, oy: 0 };
    _placed.draw(t, mark);
    expect(shapes).toHaveLength(2);
    const [halo, fill] = shapes;
    expect(halo[1]).toEqual({ stroke: { color: '#ffffff', opacity: 0.5, multiply: false }, width: 0.04 * 0.1 * 1000 });
    expect(fill[1]).toEqual({ fill: { color: PLACED_COLOR, opacity: 1, multiply: false } });
    // Glyph 1's first point: the centre (500, 700) plus (-0.5, 0.5) em of 100 px.
    expect(halo[0][0]).toEqual(['M', 450, 750]);
    expect(halo[0]).toBe(fill[0]);
  });
});
