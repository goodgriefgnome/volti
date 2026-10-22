import { describe, expect, it } from 'vitest';
import {
  cutAt, deleteArchived, edgeKind, edgeRange, insertArchived, insertPages, joinNext,
  release, remove, setEdge, setInk, setPad, split, tidy,
} from './edits';
import { pack } from './frames';
import { A4, aspects, cut, line, pages, sarabande, state } from './testing';

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
    expect(pages(s)).toEqual([[0, 0, 0.3], [1, 0, 1]]);
  });
  it('keeps cuts of one page that touch, even on one frame', () => {
    const s = tidy(state([cut(0, 0, 0.3), cut(0, 0.3, 0.6), cut(1)]));
    expect(pages(s)).toEqual([[0, 0, 0.3], [0, 0.3, 0.6], [1, 0, 1]]);
  });
});

describe('remove and archive', () => {
  it('deletes a cut without ink of its own, and any copied ink', () => {
    const a = cut(0), b = cut(1);
    const s = remove(state([a, b], { [b.id]: [line(0.1, 0.2)] }), b.id);
    expect(s.score.cuts).toEqual([a]);
    expect(s.score.archived).toEqual([]);
    expect(s.ink[b.id]).toBeUndefined();
  });
  it('archives a cut whose ink was drawn on it, keeping the ink', () => {
    const a = cut(0), b = cut(1);
    let s = setInk(state([a, b]), b.id, [line(0.1, 0.2)]);
    s = remove(s, b.id);
    expect(s.score.cuts.map((c) => c.id)).toEqual([a.id]);
    expect(s.score.archived.map((c) => c.id)).toEqual([b.id]);
    expect(s.ink[b.id]).toHaveLength(1);
  });
  it('deletes a cut whose own ink was all erased', () => {
    const a = cut(0), b = cut(1);
    const s = remove(setInk(state([a, b]), b.id, []), b.id);
    expect(s.score.archived).toEqual([]);
  });
  it('never removes the last cut', () => {
    const s = state([cut(0)]);
    expect(remove(s, s.score.cuts[0].id)).toBe(s);
  });
  it('brings an archived cut back with its id and ink', () => {
    const a = cut(0), b = cut(1, 0.2, 0.7);
    let s = remove(setInk(state([a, b]), b.id, [line(0.3, 0.4)]), b.id);
    s = insertArchived(s, { id: a.id, after: false }, b.id);
    expect(s.score.cuts.map((c) => c.id)).toEqual([b.id, a.id]);
    expect(s.score.cuts[0]).toMatchObject({ y0: 0.2, y1: 0.7 });
    expect(s.score.archived).toEqual([]);
    expect(s.ink[b.id]).toHaveLength(1);
  });
  it('deletes an archived cut for good', () => {
    const a = cut(0), b = cut(1);
    let s = remove(setInk(state([a, b]), b.id, [line(0.3, 0.4)]), b.id);
    s = deleteArchived(s, b.id);
    expect(s.score.archived).toEqual([]);
    expect(s.ink[b.id]).toBeUndefined();
  });
  it('archives a cut dragged to nothing as it was before the drag', () => {
    const a = cut(0), b = cut(1, 0.2, 0.9);
    const before = setInk(state([a, b]), b.id, [line(0.3, 0.4)]);
    const dragged = setEdge(before, b.id, 'bottom', 0, edgeRange(before.score.cuts, 1, 'bottom'));
    const s = release(dragged, before, b.id);
    expect(s.score.cuts.map((c) => c.id)).toEqual([a.id]);
    expect(s.score.archived[0]).toMatchObject({ id: b.id, y0: 0.2, y1: 0.9 });
  });
});

describe('join and restore', () => {
  it('restores music cut out by merging the two cuts and their ink', () => {
    const a = cut(0, 0, 0.3), b = cut(0, 0.6, 1);
    const s = joinNext(state([a, b], { [b.id]: [line(0.7, 0.8)] }), a.id);
    expect(pages(s)).toEqual([[0, 0, 1]]);
    expect(s.ink[a.id]).toHaveLength(1);
  });
  it('does not join cuts of different pages, or a repeat', () => {
    const s = sarabande();
    expect(joinNext(s, s.score.cuts[2].id)).toBe(s);
  });
});

describe('split', () => {
  it('gives each stroke to the half that holds most of its length', () => {
    const c = cut(0);
    const strokes = [line(0.1, 0.3), line(0.4, 0.55), line(0.45, 0.9)];
    const { state: s, lower } = split(state([c], { [c.id]: strokes }), c.id, 0.5, aspects);
    expect(pages(s)).toEqual([[0, 0, 0.5], [0, 0.5, 1]]);
    expect(s.ink[c.id]).toEqual(strokes.slice(0, 2));
    expect(s.ink[lower]).toEqual(strokes.slice(2));
  });
  it('keeps the pad on the upper half', () => {
    const c = cut(0, 0, 1, { pad: 0.1 });
    const { state: s } = split(state([c]), c.id, 0.5, aspects);
    expect(s.score.cuts.map((c) => c.pad)).toEqual([0.1, undefined]);
  });
});

describe('cutAt', () => {
  it('cuts a cut in two where you pressed, and the halves stay apart', () => {
    const c = cut(0, 0.1, 0.9);
    const s = cutAt(state([c, cut(1)]), c.id, 0.4, aspects)!;
    expect(pages(s)).toEqual([[0, 0.1, 0.4], [0, 0.4, 0.9], [1, 0, 1]]);
    expect(edgeKind(s.score.cuts, 0, 'bottom')).toBe('split');
  });
  it('lets a split carry the top of a page onto the frame before', () => {
    const t = sarabande();
    const r = cutAt(t, t.score.cuts[4].id, 0.3, aspects)!;
    expect(pack(r.score.cuts, aspects).map((f) => f.items.length)).toEqual([1, 1, 3, 1]);
  });
  it('will not leave a sliver', () => {
    const c = cut(0, 0.1, 0.9);
    expect(cutAt(state([c]), c.id, 0.105, aspects)).toBeNull();
    expect(cutAt(state([c]), c.id, 0.895, aspects)).toBeNull();
  });
});

describe('insertPages', () => {
  it('inserts a range of whole pages in page order, however it was picked', () => {
    const s = state([cut(0), cut(2)]);
    const r = insertPages(s, { id: s.score.cuts[0].id, after: true }, 2, 1, false, aspects);
    expect(pages(r.state)).toEqual([[0, 0, 1], [1, 0, 1], [2, 0, 1], [2, 0, 1]]);
    expect(r.first).toBe(r.state.score.cuts[1].id);
  });
  it('copies the markings from the first time each part of the page is played', () => {
    const top = cut(1, 0, 0.5), bottom = cut(1, 0.5, 1), again = cut(1, 0.3, 1);
    const ink = {
      [top.id]: [line(0.1, 0.2)],
      [bottom.id]: [line(0.6, 0.7)],
      [again.id]: [line(0.62, 0.72), line(0.35, 0.45)], // 2nd time: one over a walked part, one in the top half
    };
    const s = state([cut(0), top, bottom, cut(2), again], ink);
    const r = insertPages(s, { id: again.id, after: true }, 1, 1, true, aspects);
    const copied = r.state.ink[r.first];
    expect(copied.map((st) => st.points[0][1])).toEqual([0.1, 0.6]);
    expect(copied[0]).not.toBe(ink[top.id][0]);
    expect(r.state.score.cuts.find((c) => c.id === r.first)!.ownInk).toBeUndefined();
  });
  it('copies nothing with the option off', () => {
    const c = cut(0);
    const r = insertPages(state([c], { [c.id]: [line(0.1, 0.2)] }), { id: c.id, after: true }, 0, 0, false, aspects);
    expect(r.state.ink[r.first]).toBeUndefined();
  });
});

describe('setPad', () => {
  it('clamps to most of a frame and drops a pad of nothing', () => {
    const c = cut(0);
    expect(setPad(state([c]), c.id, 5, aspects).score.cuts[0].pad).toBeCloseTo(0.6 * A4);
    expect('pad' in setPad(state([{ ...c, pad: 0.2 }]), c.id, 0, aspects).score.cuts[0]).toBe(false);
  });
});
