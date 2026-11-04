import { describe, expect, it } from 'vitest';
import {
  cutAt, edgeKind, edgeRange, insertPages, joinNext,
  release, remove, replaceMarking, setEdge, setInk, setPad, setSymbolSize, split, textResized, textSizeOf, tidy,
} from './edits';
import { pack } from './frames';
import { A4, aspects, cut, _line, _mark, _pages, sarabande, state } from './testing';

describe('edges', () => {
  const s = state([cut(0, 0.1, 0.4), cut(0, 0.4, 0.6), cut(0, 0.8, 1), cut(1, 0, 0.9), cut(0)]);
  const cuts = s.score.cuts;
  it('tells cut-out music, splits, trims and whole page edges apart', () => {
    expect(edgeKind(cuts, 0, 'top')).toBe('trimmed');
    expect(edgeKind(cuts, 0, 'bottom')).toBe('split');
    expect(edgeKind(cuts, 1, 'bottom')).toBe('cutOut');
    expect(edgeKind(cuts, 2, 'top')).toBe('cutOut');
    expect(edgeKind(cuts, 2, 'bottom')).toBe('whole');
    expect(edgeKind(cuts, 3, 'bottom')).toBe('trimmed');
    expect(edgeKind(cuts, 4, 'top')).toBe('whole');
  });
  it('a repeat back to an earlier page is just a seam', () => {
    const r = sarabande().score.cuts;
    expect(edgeKind(r, 3, 'top')).toBe('trimmed');
    expect(edgeKind(r, 2, 'bottom')).toBe('trimmed');
  });
  it('clamps a tab between its own cut and the next music of the page', () => {
    expect(edgeRange(cuts, 1, 'bottom')).toEqual([0.4, 0.8]);
    expect(edgeRange(cuts, 2, 'top')).toEqual([0.6, 1]);
    expect(edgeRange(cuts, 2, 'bottom')).toEqual([0.8, 1]);
    expect(edgeRange(cuts, 0, 'top')).toEqual([0, 0.4]);
    expect(setEdge(s, cuts[1].id, 'bottom', 0.95, [0.4, 0.8]).score.cuts[1].y1).toBe(0.8);
  });
});

describe('tidy', () => {
  it('drops slivers', () => {
    const s = tidy(state([cut(0, 0, 0.3), cut(0, 0.5, 0.502), cut(1)]));
    expect(_pages(s)).toEqual([[0, 0, 0.3], [1, 0, 1]]);
  });
  it('keeps cuts of one page that touch, even on one frame', () => {
    const s = tidy(state([cut(0, 0, 0.3), cut(0, 0.3, 0.6), cut(1)]));
    expect(_pages(s)).toEqual([[0, 0, 0.3], [0, 0.3, 0.6], [1, 0, 1]]);
  });
});

describe('remove', () => {
  it('takes the cut out, leaving its page\'s ink', () => {
    const a = cut(0), b = cut(1);
    const before = state([a, b], { 1: [_line(0.1, 0.2)] });
    const s = remove(before, b.id);
    expect(s.score.cuts).toEqual([a]);
    expect(s.ink).toBe(before.ink);
  });
  it('never removes the last cut', () => {
    const s = state([cut(0)]);
    expect(remove(s, s.score.cuts[0].id)).toBe(s);
  });
  it('removes a cut dragged to nothing as it was before the drag, leaving the ink', () => {
    const a = cut(0), b = cut(1, 0.2, 0.9);
    const before = state([a, b], { 1: [_line(0.3, 0.4)] });
    const dragged = setEdge(before, b.id, 'bottom', 0, edgeRange(before.score.cuts, 1, 'bottom'));
    const s = release(dragged, before, b.id);
    expect(s.score.cuts.map((c) => c.id)).toEqual([a.id]);
    expect(s.ink).toEqual(before.ink);
  });
});

describe('moving an edge', () => {
  it('leaves the ink as it was', () => {
    const a = cut(0, 0, 0.5), b = cut(0, 0.5, 1);
    const before = state([a, b], { 0: [_line(0.4, 0.45)] });
    const s = release(setEdge(before, a.id, 'bottom', 0.3, edgeRange(before.score.cuts, 0, 'bottom')), before, a.id);
    expect(s.score.cuts[0].y1).toBe(0.3);
    expect(s.ink).toEqual(before.ink);
  });
});

describe('join and restore', () => {
  it('restores music cut out by merging the two cuts, leaving the ink', () => {
    const a = cut(0, 0, 0.3), b = cut(0, 0.6, 1);
    const before = state([a, b], { 0: [_line(0.7, 0.8)] });
    const s = joinNext(before, a.id);
    expect(_pages(s)).toEqual([[0, 0, 1]]);
    expect(s.score.cuts[0].id).toBe(a.id);
    expect(s.ink).toBe(before.ink);
  });
  it('does not join cuts of different pages, or a repeat', () => {
    const s = sarabande();
    expect(joinNext(s, s.score.cuts[2].id)).toBe(s);
  });
});

describe('split', () => {
  it('cuts the cut in two, leaving the ink', () => {
    const c = cut(0);
    const before = state([c], { 0: [_line(0.1, 0.3), _line(0.45, 0.9)] });
    const { state: s, lower } = split(before, c.id, 0.5);
    expect(_pages(s)).toEqual([[0, 0, 0.5], [0, 0.5, 1]]);
    expect(s.score.cuts[1].id).toBe(lower);
    expect(s.ink).toBe(before.ink);
  });
  it('keeps the pad on the upper half', () => {
    const c = cut(0, 0, 1, { pad: 0.1 });
    const { state: s } = split(state([c]), c.id, 0.5);
    expect(s.score.cuts.map((c) => c.pad)).toEqual([0.1, undefined]);
  });
});

describe('cutAt', () => {
  it('cuts a cut in two where you pressed, and the halves stay apart', () => {
    const c = cut(0, 0.1, 0.9);
    const s = cutAt(state([c, cut(1)]), c.id, 0.4)!;
    expect(_pages(s)).toEqual([[0, 0.1, 0.4], [0, 0.4, 0.9], [1, 0, 1]]);
    expect(edgeKind(s.score.cuts, 0, 'bottom')).toBe('split');
  });
  it('lets a split carry the top of a page onto the frame before', () => {
    const t = sarabande();
    const r = cutAt(t, t.score.cuts[4].id, 0.3)!;
    expect(pack(r.score.cuts, aspects).map((f) => f.items.length)).toEqual([1, 1, 3, 1]);
  });
  it('will not leave a sliver', () => {
    const c = cut(0, 0.1, 0.9);
    expect(cutAt(state([c]), c.id, 0.105)).toBeNull();
    expect(cutAt(state([c]), c.id, 0.895)).toBeNull();
  });
});

describe('insertPages', () => {
  it('inserts a range of whole pages in page order, however it was picked', () => {
    const s = state([cut(0), cut(2)]);
    const r = insertPages(s, { id: s.score.cuts[0].id, after: true }, 2, 1);
    expect(_pages(r.state)).toEqual([[0, 0, 1], [1, 0, 1], [2, 0, 1], [2, 0, 1]]);
    expect(r.first).toBe(r.state.score.cuts[1].id);
  });
  it('leaves the ink as it was', () => {
    const c = cut(0);
    const before = state([c], { 0: [_line(0.1, 0.2)] });
    expect(insertPages(before, { id: c.id, after: true }, 0, 0).state.ink).toBe(before.ink);
  });
});

describe('setPad', () => {
  it('clamps to most of a frame and drops a pad of nothing', () => {
    const c = cut(0);
    expect(setPad(state([c]), c.id, 5, aspects).score.cuts[0].pad).toBeCloseTo(0.6 * A4);
    expect('pad' in setPad(state([{ ...c, pad: 0.2 }]), c.id, 0, aspects).score.cuts[0]).toBe(false);
  });
});

describe('setInk', () => {
  it('sets a page\'s markings, leaving the cuts', () => {
    const c = cut(0), a = _line(0.1, 0.2);
    const before = state([c], { 1: [_mark(0.5, 0.5)] });
    const s = setInk(before, 0, [a]);
    expect(s.ink).toEqual({ 0: [a], 1: before.ink[1] });
    expect(s.score).toBe(before.score);
  });
  it('leaves no entry for a page with no markings', () => {
    const s = setInk(state([cut(0)], { 0: [_line(0.1, 0.2)] }), 0, []);
    expect(0 in s.ink).toBe(false);
  });
});

describe('replaceMarking', () => {
  it('replaces a marking of a page by identity', () => {
    const c = cut(0), a = _line(0.1, 0.2), b = _mark(0.5, 0.5), n = _mark(0.6, 0.6);
    const s = replaceMarking(state([c], { 0: [a, b] }), 0, b, n);
    expect(s.ink[0]).toEqual([a, n]);
    expect(s.ink[0][1]).toBe(n);
  });
  it('removes it when there is nothing to replace it with', () => {
    const c = cut(0), a = _line(0.1, 0.2), b = _mark(0.5, 0.5);
    expect(replaceMarking(state([c], { 0: [a, b] }), 0, b).ink[0]).toEqual([a]);
    expect(replaceMarking(state([c], { 0: [b] }), 0, b).ink[0]).toBeUndefined();
  });
});

describe('setSymbolSize', () => {
  it('sets the score\'s symbol size', () => {
    expect(setSymbolSize(state([cut(0)]), 0.05).score.symbolSize).toBe(0.05);
  });
});

describe('textSizeOf', () => {
  it('is the symbol size times the text scale, each by default until set', () => {
    const s = state([cut(0)]).score;
    expect(textSizeOf(s)).toBeCloseTo(0.035 * 0.6);
    expect(textSizeOf({ ...s, symbolSize: 0.05, textScale: 0.5 })).toBeCloseTo(0.025);
  });
});

describe('textResized', () => {
  const symbol = { ..._mark(0.5, 0.5), kind: 'symbol' as const };
  it('sets the text scale, leaving the symbol size, while the ink has a symbol', () => {
    const c = cut(0);
    const s = textResized(state([c], { 0: [symbol] }), 0.021);
    expect(s.score.textScale).toBeCloseTo(0.6);
    expect(s.score.symbolSize).toBeUndefined();
    expect(textResized(state([c], { 0: [symbol] }), 0.014).score.textScale).toBeCloseTo(0.4);
  });
  it('sets the symbol size, leaving the text scale, while the ink has none', () => {
    const s = textResized(state([cut(0)]), 0.03);
    expect(s.score.symbolSize).toBeCloseTo(0.05);
    expect(s.score.textScale).toBeUndefined();
  });
  it('counts a symbol on a page no cut plays', () => {
    const s = textResized(state([cut(0)], { 3: [symbol] }), 0.014);
    expect(s.score.textScale).toBeCloseTo(0.4);
    expect(s.score.symbolSize).toBeUndefined();
  });
});
