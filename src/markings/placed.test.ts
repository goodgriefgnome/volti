import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Drawing, Paint, PathCmd } from './draw';
import { addGlyph } from './glyphs';
import { _placed, backgroundOutline, baselineStart, centred, emExtent, glyphKeysIn, markColors, markExtent, setMarkColors, textMark, type PlacedMark } from './placed';
import type { DrawTarget } from './model';
import type { Stroke } from './stroke';

beforeAll(() => {
  addGlyph('t:1', 'M 0 0 L 1 0 L 1 -1 L 0 -1 Z');
  addGlyph('t:2', 'M 0 0 L 2 0 L 2 -0.5 Z');
});

// Glyph 1 spans -0.5..0.5 either way from the centre, glyph 2 0.5..2.5 across and -0.5..0 up.
const mark: PlacedMark = { kind: 'symbol', text: 'ab', font: 't', glyphs: [[1, -0.5, 0.5], [2, 0.5, 0]], at: [0.5, 0.5], size: 0.1 };

describe('centred', () => {
  it('moves two glyphs side by side so the centre of their ink is the origin', () => {
    // Glyph 1 spans 0..1 across and -1..0 up; glyph 2 spans 0..2 and -0.5..0, from x 1.5: ink 0..3.5, -1..0.
    const c = centred('t', [{ gid: 1, x: 0, y: 0 }, { gid: 2, x: 1.5, y: 0 }])!;
    expect(c.centre).toEqual([1.75, -0.5]);
    expect(c.glyphs).toEqual([[1, -1.75, 0.5], [2, -0.25, 0.5]]);
  });
  it('gives nothing for glyphs with no ink', () => {
    expect(centred('t', [{ gid: 99, x: 0, y: 0 }])).toBeUndefined();
    expect(centred('t', [])).toBeUndefined();
  });
});

describe('text markings', () => {
  const glyphs = [{ gid: 1, x: 0, y: 0 }, { gid: 2, x: 1.5, y: 0 }];
  it('are placed so their baseline starts at the start they were made at', () => {
    const m = textMark('t', 'ab', glyphs, [0.2, 0.3], 0.1)!;
    expect(m).toMatchObject({ kind: 'text', text: 'ab', font: 't', size: 0.1 });
    expect(m.at[0]).toBeCloseTo(0.2 + 1.75 * 0.1);
    expect(m.at[1]).toBeCloseTo(0.3 - 0.5 * 0.1);
    const [bx, by] = baselineStart(m);
    expect(m.at[0] + bx * m.size).toBeCloseTo(0.2);
    expect(m.at[1] + by * m.size).toBeCloseTo(0.3);
  });
  it('are nothing when they have no ink', () => {
    expect(textMark('t', '  ', [{ gid: 99, x: 0, y: 0 }], [0.2, 0.3], 0.1)).toBeUndefined();
    expect(textMark('t', '', [], [0.2, 0.3], 0.1)).toBeUndefined();
  });
  it('are annotated as FreeText with what was typed', () => {
    const m = textMark('t', 'rit.', glyphs, [0.2, 0.3], 0.1)!;
    const t: DrawTarget = { draw: { path() {}, shape() {} }, w: 1000, h: 1400, ox: 0, oy: 0 };
    expect(_placed.annotation(t, m)).toEqual({ subtype: 'FreeText', contents: 'rit.' });
  });
});

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
    expect(fill[1]).toEqual({ fill: { color: markColors().color, opacity: 1, multiply: false } });
    // Glyph 1's first point: the centre (500, 700) plus (-0.5, 0.5) em of 100 px.
    expect(halo[0][0]).toEqual(['M', 450, 750]);
    expect(halo[0]).toBe(fill[0]);
  });
});

describe('default colours', () => {
  afterEach(() => setMarkColors({}));
  const fillColor = (m: PlacedMark) => {
    const paints: Paint[] = [];
    const draw: Drawing = { path() {}, shape: (_c, paint) => void paints.push(paint) };
    _placed.draw({ draw, w: 1000, h: 1400, ox: 0, oy: 0 }, m);
    const fill = paints.find((p) => 'fill' in p);
    return fill && 'fill' in fill ? fill.fill.color : undefined;
  };
  it('leave the other built in when one is set, and both when none is', () => {
    setMarkColors({ color: '#800000' });
    expect(markColors()).toEqual({ color: '#800000', background: '#cce0ff' });
    setMarkColors({});
    expect(markColors()).toEqual({ color: '#1c1f26', background: '#cce0ff' });
  });
  it('colour a marking without a colour of its own, and not one with its own', () => {
    setMarkColors({ color: '#800000' });
    expect(fillColor(mark)).toBe('#800000');
    expect(fillColor({ ...mark, color: '#00ff00' })).toBe('#00ff00');
  });
});

describe('backgrounds', () => {
  afterEach(() => setMarkColors({}));
  // Its ink spans -1..2 across and -0.5..0.5 up and down, so 3 × 1 em; the padding makes it 3.24 × 1.24.
  let ink: ReturnType<typeof emExtent> & {}, x0 = 0, y0 = 0, x1 = 0, y1 = 0, point = 0;
  beforeAll(() => {
    ink = emExtent(mark)!;
    [x0, y0, x1, y1] = [ink[0] - 0.12, ink[1] - 0.12, ink[2] + 0.12, ink[3] + 0.12];
    point = (y1 - y0) * (Math.tan(Math.PI / 6) / 2);
  });
  const boxed = (shape: 'box' | 'tag-left' | 'tag-right', color?: string): PlacedMark => ({ ...mark, background: { shape, color } });

  it('have a box outline of the ink grown by the padding, clockwise from the top left', () => {
    expect(backgroundOutline(boxed('box'))).toEqual([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  });
  it('point right from the middle of the right end, with the point third', () => {
    const o = backgroundOutline(boxed('tag-right'))!;
    expect(o).toHaveLength(5);
    expect(o[2][0]).toBeCloseTo(x1 + point);
    expect(o[2][1]).toBeCloseTo((y0 + y1) / 2);
    expect(point).toBeCloseTo(0.2887 * (y1 - y0), 3);
  });
  it('point left as the mirror image', () => {
    const o = backgroundOutline(boxed('tag-left'))!;
    expect(o).toHaveLength(5);
    expect(o[4][0]).toBeCloseTo(x0 - point);
    expect(o[4][1]).toBeCloseTo((y0 + y1) / 2);
  });
  it('have no outline without a background', () => {
    expect(backgroundOutline(mark)).toBeUndefined();
  });
  it('widen the extent by a tag\'s point, and leave it alone without a background', () => {
    expect(markExtent(boxed('tag-right'))![2]).toBeCloseTo(x1 + point);
    expect(markExtent(boxed('tag-right'))![0]).toBeCloseTo(x0);
    expect(markExtent(mark)).toEqual(emExtent(mark));
  });
  it('are hit by a point in their padding only when there is one', () => {
    // 0.06 em beyond the ink, to the right: 0.006 page widths.
    const p: [number, number, number] = [0.5 + ink[2] * 0.1 + 0.006, 0.5, 0];
    expect(_placed.hits(boxed('box'), p, 1.4, 0)).toBe(true);
    expect(_placed.hits(mark, p, 1.4, 0)).toBe(false);
  });
  it('are drawn first, filled in the default background colour and darkening only', () => {
    const shapes: [readonly PathCmd[], Paint][] = [];
    const draw: Drawing = { path() {}, shape: (cmds, paint) => void shapes.push([cmds, paint]) };
    const t: DrawTarget = { draw, w: 1000, h: 1400, ox: 0, oy: 0 };
    _placed.draw(t, boxed('box'));
    expect(shapes).toHaveLength(3);
    expect(shapes[0][1]).toEqual({ fill: { color: '#cce0ff', opacity: 1, multiply: true } });
    expect(shapes[0][0].at(-1)).toEqual(['Z']);
    expect('stroke' in shapes[1][1]).toBe(true);
    expect(shapes[2][1]).toEqual({ fill: { color: markColors().color, opacity: 1, multiply: false } });
    setMarkColors({ background: '#ffc0cb' });
    shapes.length = 0;
    _placed.draw(t, boxed('box'));
    expect(shapes[0][1]).toMatchObject({ fill: { color: '#ffc0cb' } });
    shapes.length = 0;
    _placed.draw(t, boxed('box', '#ffff00'));
    expect(shapes[0][1]).toMatchObject({ fill: { color: '#ffff00' } });
  });
  it('are copied, not shared', () => {
    const m = boxed('box');
    const c = _placed.copy(m);
    expect(c.background).toEqual(m.background);
    expect(c.background).not.toBe(m.background);
  });
});
