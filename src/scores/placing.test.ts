import { beforeAll, describe, expect, it } from 'vitest';
import { addGlyph } from '../markings/glyphs';
import type { Marking } from '../markings/model';
import type { PlacedMark } from '../markings/placed';
import type { ScoreInk } from './model';
import { pack } from './frames';
import { extentOnFrame, handleRadius, markingAt, movedTo, pressOnSelection, resizedFrom, selectionBox, setThisTimeOnly, thisTimeOnly } from './placing';
import { A4, aspects, cut, state } from './testing';

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

describe('markingAt', () => {
  const c = cut(0);
  const [frame] = pack([c], aspects);
  const y = A4 * 0.5;
  const any = () => true;
  const at = (ink: ScoreInk, x: number, radius: number, owned: (m: Marking) => boolean = any, py = y) => markingAt(frame, ink, aspects, [x, py], radius, owned)?.mark;
  const left = mark(0.5, 0.5), right = mark(0.52, 0.5);

  it('finds the one drawn last where two are both under the press', () => {
    expect(at({ 0: [left, right] }, 0.51, 0)).toBe(right);
    expect(at({ 0: [right, left] }, 0.51, 0)).toBe(left);
  });
  it('finds the nearest by its edge, not its centre: a small marking beside a big one', () => {
    const big = mark(0.5, 0.5, 0.2), small = mark(0.66, 0.5, 0.02);
    // At 0.59 the press is under big's ink (0.4..0.6) near its edge, 0.09 from its centre; small's ink starts at 0.65 and its centre is 0.07 away.
    expect(at({ 0: [big, small] }, 0.59, 0.1)).toBe(big);
    // At 0.63 big's edge is 0.03 away and small's 0.02.
    expect(at({ 0: [big, small] }, 0.63, 0.1)).toBe(small);
  });
  it('finds one by a press on its background beyond its ink', () => {
    const boxed = { ...mark(0.5, 0.5), background: { shape: 'box' as const } };
    // The ink ends at 0.55; the background's padding (0.12 em of 0.1) takes it to 0.562.
    expect(at({ 0: [boxed] }, 0.555, 0)).toBe(boxed);
    expect(at({ 0: [boxed] }, 0.57, 0)).toBeUndefined();
    expect(at({ 0: [mark(0.5, 0.5)] }, 0.555, 0)).toBeUndefined();
  });
  it('finds one within the radius, and misses outside it', () => {
    const ink = { 0: [left, right] };
    expect(at(ink, 0.6, 0)).toBeUndefined();
    expect(at(ink, 0.58, 0.02)).toBe(right);
    expect(at(ink, 0.3, 0.02)).toBeUndefined();
  });
  it('skips a marking that is not owned', () => {
    expect(at({ 0: [left, right] }, 0.51, 0, (m) => m === left)).toBe(left);
    expect(at({ 0: [left] }, 0.5, 0, () => false)).toBeUndefined();
  });
  it('prefers one in a later cut at the same distance', () => {
    const c2 = cut(1);
    const both = { items: [{ cut: c, index: 0, top: 0, h: A4 }, { cut: c2, index: 1, top: 0, h: A4 }], fill: 1, aspect: A4 };
    const a = mark(0.5, 0.5), b = mark(0.5, 0.5);
    expect(markingAt(both, { 0: [a], 1: [b] }, aspects, [0.5, y], 0, any)?.mark).toBe(b);
  });
  it('finds a marking on the second of two cuts of one page', () => {
    const top = cut(0, 0, 0.5), bottom = cut(0, 0.5, 1);
    const [f] = pack([top, bottom], aspects);
    const m = mark(0.5, 0.75);
    const found = markingAt(f, { 0: [m] }, aspects, [0.5, A4 * 0.75], 0, any);
    expect(found?.mark).toBe(m);
    expect(found?.cut).toBe(bottom);
    expect(found?.cut.page).toBe(0);
  });
});

describe('selectionBox', () => {
  it('grows a small extent to the least, keeping its centre', () => {
    const b = selectionBox([0.5, 0.2, 0.52, 0.21], 0.024);
    expect(b[2] - b[0]).toBeCloseTo(0.024);
    expect(b[3] - b[1]).toBeCloseTo(0.024);
    expect((b[0] + b[2]) / 2).toBeCloseTo(0.51);
    expect((b[1] + b[3]) / 2).toBeCloseTo(0.205);
  });
  it('grows only the side that is short, and leaves a big extent alone', () => {
    const b = selectionBox([0.1, 0.2, 0.3, 0.205], 0.024);
    expect(b[0]).toBe(0.1);
    expect(b[2]).toBe(0.3);
    expect(b[3] - b[1]).toBeCloseTo(0.024);
  });
});

describe('handleRadius', () => {
  it('is a quarter of the shorter side, at most 8 px', () => {
    expect(handleRadius(24)).toBe(6);
    expect(handleRadius(64)).toBe(8);
    expect(handleRadius(400)).toBe(8);
  });
});

describe('pressOnSelection', () => {
  const box: [number, number, number, number] = [0.4, 0.4, 0.6, 0.5];
  it('is the box on and inside it, its edge included', () => {
    expect(pressOnSelection(box, 0.02, [0.5, 0.45])).toEqual({ kind: 'box' });
    expect(pressOnSelection(box, 0.02, [0.4, 0.4])).toEqual({ kind: 'box' });
  });
  it('is a handle outside the box and within the radius of a corner', () => {
    expect(pressOnSelection(box, 0.02, [0.39, 0.39])).toEqual({ kind: 'handle', corner: 0 });
    expect(pressOnSelection(box, 0.02, [0.61, 0.39])).toEqual({ kind: 'handle', corner: 1 });
    expect(pressOnSelection(box, 0.02, [0.61, 0.51])).toEqual({ kind: 'handle', corner: 2 });
    expect(pressOnSelection(box, 0.02, [0.39, 0.51])).toEqual({ kind: 'handle', corner: 3 });
  });
  it('is neither outside the discs', () => {
    expect(pressOnSelection(box, 0.02, [0.5, 0.38])).toBeUndefined();
    expect(pressOnSelection(box, 0.02, [0.37, 0.37])).toBeUndefined();
  });
  it('takes the nearest corner where two discs meet', () => {
    const small: [number, number, number, number] = [0.5, 0.5, 0.52, 0.52];
    expect(pressOnSelection(small, 0.02, [0.505, 0.495])).toEqual({ kind: 'handle', corner: 0 });
    expect(pressOnSelection(small, 0.02, [0.515, 0.495])).toEqual({ kind: 'handle', corner: 1 });
  });
});

describe('resizedFrom', () => {
  const ext: [number, number, number, number] = [0.4, 0.2, 0.6, 0.3];
  const at: [number, number] = [0.5, 0.25];
  it('keeps the opposite corner where it is, whichever corner is dragged', () => {
    // Dragging each corner to twice its distance from the opposite one doubles the size.
    const doubled: [number, [number, number], [number, number]][] = [
      [0, [0.2, 0.1], [0.6, 0.3]], [1, [0.8, 0.1], [0.4, 0.3]], [2, [0.8, 0.4], [0.4, 0.2]], [3, [0.2, 0.4], [0.6, 0.2]],
    ];
    for (const [corner, to, fixed] of doubled) {
      const r = resizedFrom(ext, corner as 0 | 1 | 2 | 3, to, at, 0.05);
      expect(r.size).toBeCloseTo(0.1);
      // The fixed corner is the same distance from the new centre, doubled.
      expect(r.at[0] - fixed[0]).toBeCloseTo((at[0] - fixed[0]) * 2);
      expect(r.at[1] - fixed[1]).toBeCloseTo((at[1] - fixed[1]) * 2);
    }
  });
  it('scales by the drag\'s projection on the diagonal, so a sideways drag counts only as far as it goes along it', () => {
    const r = resizedFrom([0, 0, 0.2, 0.2], 2, [0.4, 0.2], [0.1, 0.1], 0.1);
    expect(r.size).toBeCloseTo(0.15);
  });
  it('is never under 1/4 of its size', () => {
    expect(resizedFrom(ext, 2, [0.1, 0.1], at, 0.05).size).toBeCloseTo(0.0125);
  });
  it('scales a symbol by how much its box does: a 24 px box dragged out to 36 px', () => {
    const box: [number, number, number, number] = [0.488, 0.188, 0.512, 0.212];
    const r = resizedFrom(box, 2, [0.488 + 0.036, 0.188 + 0.036], [0.5, 0.2], 0.01);
    expect(r.size).toBeCloseTo(0.015);
  });});

describe('movedTo', () => {
  const a = cut(0, 0, 0.5), b = cut(0, 0.5, 1);
  const [frame] = pack([a, b], aspects);
  const first = mark(0.3, 0.1), other = mark(0.8, 0.2), already = mark(0.2, 0.7);
  const s = state([a, b], { 0: [first, other, already] });
  it('puts it where it lands, on the page, with the selection in the cut holding its new centre', () => {
    // 0.75 of the frame's height down is 0.5 of the way down the second cut.
    const r = movedTo(s, frame, { page: 0, cut: a.id, mark: first }, [0.4, A4 * 0.75], aspects);
    expect(r.state.ink[0]).toHaveLength(3);
    expect(r.state.ink[0][0]).toBe(r.selected.mark);
    expect(r.selected).toMatchObject({ page: 0, cut: b.id });
    expect(r.selected.mark.at[0]).toBeCloseTo(0.4);
    expect(r.selected.mark.at[1]).toBeCloseTo(0.75);
  });
  it('replaces it in place, and resizes when given a size', () => {
    const r = movedTo(s, frame, { page: 0, cut: a.id, mark: first }, [0.5, A4 * 0.3], aspects, 0.2);
    expect(r.state.ink[0]).toHaveLength(3);
    expect(r.state.ink[0][0]).toBe(r.selected.mark);
    expect(r.selected.mark.size).toBe(0.2);
    expect(r.selected.mark.at[1]).toBeCloseTo(0.3);
  });
  it('moves it to the ink of another page when it lands on a cut of that page', () => {
    const c0 = cut(0, 0, 0.5), c1 = cut(1, 0, 0.5);
    const [f] = pack([c0, c1], aspects);
    const moving = mark(0.3, 0.1);
    const r = movedTo(state([c0, c1], { 0: [moving, other] }), f, { page: 0, cut: c0.id, mark: moving }, [0.4, A4 * 0.75], aspects);
    expect(r.state.ink[0]).toEqual([other]);
    expect(r.state.ink[1]).toEqual([r.selected.mark]);
    expect(r.selected).toMatchObject({ page: 1, cut: c1.id });
  });
  it('gives a marking with a pass the pass of the cut it lands on, and leaves one without', () => {
    const second = cut(0, 0, 0.5, { pass: 2 }), firstPass = cut(0, 0.5, 1);
    const [f] = pack([second, firstPass], aspects);
    const own = { ...mark(0.3, 0.1), pass: 2 };
    const r = movedTo(state([second, firstPass], { 0: [own] }), f, { page: 0, cut: second.id, mark: own }, [0.4, A4 * 0.75], aspects);
    expect(r.selected.mark.pass).toBe(1);
    const plain = mark(0.3, 0.1);
    const q = movedTo(state([second, firstPass], { 0: [plain] }), f, { page: 0, cut: second.id, mark: plain }, [0.4, A4 * 0.75], aspects);
    expect('pass' in q.selected.mark).toBe(false);
  });
});

describe('thisTimeOnly', () => {
  const plain = mark(0.5, 0.5), own = { ...mark(0.5, 0.5), pass: 1 };
  it('is hidden on a page played in one pass, for a marking without a pass, and on for one with', () => {
    const c = cut(0), score = state([c, cut(1)]).score;
    expect(thisTimeOnly(score, { page: 0, cut: c.id, mark: plain })).toBeUndefined();
    expect(thisTimeOnly(score, { page: 0, cut: c.id, mark: own })).toBe('on');
  });
  it('is off without a pass and on with one, on a page played in two passes', () => {
    const c = cut(0), score = state([c, cut(0, 0, 1, { pass: 2 })]).score;
    expect(thisTimeOnly(score, { page: 0, cut: c.id, mark: plain })).toBe('off');
    expect(thisTimeOnly(score, { page: 0, cut: c.id, mark: own })).toBe('on');
  });
});

describe('setThisTimeOnly', () => {
  const first = cut(0), second = cut(0, 0, 1, { pass: 2 });
  const before = mark(0.2, 0.2), m = mark(0.5, 0.5), after = mark(0.8, 0.8);
  const s = state([first, second], { 0: [before, m, after] });
  it('gives the marking the pass of the cut it was selected in, in its place in the page\'s ink', () => {
    const r = setThisTimeOnly(s, { page: 0, cut: second.id, mark: m }, true);
    expect(r.selected.mark.pass).toBe(2);
    expect(r.state.ink[0]).toEqual([before, { ...m, pass: 2 }, after]);
    expect(r.state.ink[0][1]).toBe(r.selected.mark);
    expect(r.selected).toMatchObject({ page: 0, cut: second.id });
  });
  it('takes the pass away when turned off', () => {
    const on = setThisTimeOnly(s, { page: 0, cut: second.id, mark: m }, true);
    const off = setThisTimeOnly(on.state, on.selected, false);
    expect('pass' in off.selected.mark).toBe(false);
    expect(off.state.ink[0][1]).toBe(off.selected.mark);
  });
});
