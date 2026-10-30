import { beforeAll, describe, expect, it } from 'vitest';
import { addGlyph } from '../markings/glyphs';
import type { PlacedMark } from '../markings/placed';
import { pack } from './frames';
import { extentOnFrame, movedTo, placedAt, resizedFrom } from './placing';
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
  it('finds one by a tap on its background beyond its ink', () => {
    const boxed = { ...mark(0.5, 0.5), background: { shape: 'box' as const } };
    const list = { [c.id]: [boxed] };
    // The ink ends at 0.55; the background's padding (0.12 em of 0.1) takes it to 0.562.
    expect(placedAt(frame, list, aspects, [0.555, y], 0)?.mark).toBe(boxed);
    expect(placedAt(frame, list, aspects, [0.57, y], 0)).toBeUndefined();
    expect(placedAt(frame, { [c.id]: [mark(0.5, 0.5)] }, aspects, [0.555, y], 0)).toBeUndefined();
  });
  it('finds one within the margin, and misses outside it', () => {
    expect(placedAt(frame, ink, aspects, [0.6, y], 0)).toBeUndefined();
    expect(placedAt(frame, ink, aspects, [0.58, y], 0.02)?.mark).toBe(above);
    expect(placedAt(frame, ink, aspects, [0.3, y], 0.02)).toBeUndefined();
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
});

describe('movedTo', () => {
  const a = cut(0, 0, 0.5), b = cut(0, 0.5, 1);
  const [frame] = pack([a, b], aspects);
  const first = mark(0.3, 0.1), other = mark(0.8, 0.2), already = mark(0.2, 0.7);
  const s = state([a, b], { [a.id]: [first, other], [b.id]: [already] });
  it('gives it to the cut holding its new centre, with the centre on that cut\'s page', () => {
    // 0.75 of the frame's height down is 0.5 of the way down the second cut.
    const r = movedTo(s, frame, { cut: a.id, mark: first }, [0.4, A4 * 0.75], aspects);
    expect(r.state.ink[a.id]).toEqual([other]);
    expect(r.state.ink[b.id]).toHaveLength(2);
    expect(r.selected.cut).toBe(b.id);
    expect(r.selected.mark.at[0]).toBeCloseTo(0.4);
    expect(r.selected.mark.at[1]).toBeCloseTo(0.75);
    expect(r.state.ink[b.id][1]).toBe(r.selected.mark);
    expect(r.state.score.cuts.find((c) => c.id === b.id)!.ownInk).toBe(true);
  });
  it('replaces it in place within the same cut, and resizes when given a size', () => {
    const r = movedTo(s, frame, { cut: a.id, mark: first }, [0.5, A4 * 0.3], aspects, 0.2);
    expect(r.state.ink[a.id]).toHaveLength(2);
    expect(r.state.ink[a.id][0]).toBe(r.selected.mark);
    expect(r.selected.mark.size).toBe(0.2);
    expect(r.selected.mark.at[1]).toBeCloseTo(0.3);
  });
});
