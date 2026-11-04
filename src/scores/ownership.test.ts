import { describe, expect, it } from 'vitest';
import type { PlacedMark } from '../markings/placed';
import { share, type Stroke } from '../markings/stroke';
import { pack } from './frames';
import { claimMarking, shownBy, shows } from './ownership';
import { A4, aspects, cut, _line, _mark, sarabande } from './testing';

describe('ink shares', () => {
  it('weights by path length, scaling vertical distance by the page aspect', () => {
    const l: Stroke = { ..._line(0, 0), points: [[0, 0.1, 0.5], [0.5, 0.1, 0.5], [0.5, 0.6, 0.5]] };
    // 0.5 across inside, then 0.5 * A4 down of which 0.4 * A4 is outside 0..0.2
    expect(share(l.points, 0, 0.2, A4)).toBeCloseTo((0.5 + 0.1 * A4) / (0.5 + 0.5 * A4));
  });
  it('counts a dot as wholly where it is', () => {
    const dot: Stroke = { ..._line(0, 0), points: [[0.3, 0.4, 0.5]] };
    expect(share(dot.points, 0.3, 0.5, A4)).toBe(1);
    expect(share(dot.points, 0.5, 0.6, A4)).toBe(0);
  });
});

describe('shows', () => {
  const c = cut(0, 0.3, 0.6);
  it('shows a symbol whose centre is in the cut, its ends included', () => {
    expect(shows(c, _mark(0.5, 0.45))).toBe(true);
    expect(shows(c, _mark(0.5, 0.3))).toBe(true);
    expect(shows(c, _mark(0.5, 0.6))).toBe(true);
  });
  it('does not show a symbol whose centre is just outside, though most of it is inside', () => {
    expect(shows(c, { ..._mark(0.5, 0.299), size: 0.3 })).toBe(false);
  });
  it('shows a stroke in the cut holding its first point', () => {
    expect(shows(c, _line(0.35, 0.9))).toBe(true);
    expect(shows(cut(0, 0.6, 1), _line(0.35, 0.9))).toBe(false);
  });
  it('shows a marking with a pass only in a cut with that pass, and one without in every pass', () => {
    const second = cut(0, 0.3, 0.6, { pass: 2 });
    expect(shows(second, { ..._mark(0.5, 0.45), pass: 2 })).toBe(true);
    expect(shows(c, { ..._mark(0.5, 0.45), pass: 2 })).toBe(false);
    expect(shows(second, _mark(0.5, 0.45))).toBe(true);
    expect(shows(c, _mark(0.5, 0.45))).toBe(true);
  });
  it('lists what a cut shows in the order of its page\'s ink', () => {
    const a = _mark(0.5, 0.5), b = _line(0.9, 0.95), d = _mark(0.2, 0.4);
    expect(shownBy(c, { 0: [a, b, d], 1: [_mark(0.5, 0.5)] })).toEqual([a, d]);
  });
  it('shows a marking on page 2 of the sarabande on both cuts of page 2 that hold it', () => {
    const s = sarabande(), m = _mark(0.5, 0.8);
    const shown = s.score.cuts.map((c) => shownBy(c, { 1: [m] }).length);
    expect(shown).toEqual([0, 1, 0, 1, 0]);
  });
});

describe('claimMarking', () => {
  it('gives a stroke across a seam to the cut with most of it, in that cut\'s page coordinates', () => {
    const [, , f] = pack(sarabande().score.cuts, aspects);
    const seam = A4 / 3;
    const s: Stroke = { ..._line(0, 0), points: [[0.5, seam - 0.05, 0.5], [0.5, seam + 0.2, 0.5]] };
    const r = claimMarking(f, s, aspects)!;
    expect(r.cut.page).toBe(1);
    expect((r.marking as Stroke).points[0][1]).toBeCloseTo(2 / 3 - 0.05 / A4);
    expect((r.marking as Stroke).points[1][1]).toBeCloseTo(2 / 3 + 0.2 / A4);
  });
  it('gives a stroke in blank space to the nearest cut', () => {
    const [, , f] = pack(sarabande().score.cuts, aspects);
    const s: Stroke = { ..._line(0, 0), points: [[0.5, A4 - 0.05, 0.5]] };
    expect(claimMarking(f, s, aspects)!.cut.page).toBe(1);
  });
});

describe('placed markings', () => {
  it('go to the cut holding their centre, with their centre on that cut\'s page', () => {
    const [, , f] = pack(sarabande().score.cuts, aspects);
    const seam = A4 / 3;
    const r = claimMarking(f, _mark(0.5, seam + 0.1), aspects)!;
    expect(r.cut.page).toBe(1);
    expect((r.marking as PlacedMark).at[1]).toBeCloseTo(2 / 3 + 0.1 / A4);
  });
});
