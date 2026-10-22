import { describe, expect, it } from 'vitest';
import type { Stroke } from '../src/ink/model';
import { claimFirstPass, claimStroke, share, splitStrokes, visible } from '../src/pieces/ink';
import {
  deleteArchived, edgeKind, edgeRange, insertArchived, insertPages, joinNext, newPiece, pack, pullUp,
  release, remove, setEdge, setInk, setPad, split, splitCue, tidy, type Cut, type State,
} from '../src/pieces/model';
import { rowInk, snapSplit } from '../src/pieces/snap';

const A4 = 297 / 210;
const aspects = [A4, A4, A4];

let n = 0;
const cut = (page: number, y0 = 0, y1 = 1, extra: Partial<Cut> = {}): Cut => ({ id: `c${n++}`, page, y0, y1, ...extra });
const state = (cuts: Cut[], ink: State['ink'] = {}): State => ({
  piece: { id: 'p', sourceId: 's', title: 't', key: '', orientation: 'landscape', cuts, archived: [] },
  ink,
});
const line = (y0: number, y1: number): Stroke => ({ tool: 'pen', color: '#000', size: 0.002, points: [[0.5, y0, 0.5], [0.5, y1, 0.5]] });
const pages = (s: State) => s.piece.cuts.map((c) => [c.page, +c.y0.toFixed(3), +c.y1.toFixed(3)]);

/** The design doc's example: page 1, page 2, page 3's first system, page 2's last system, page 3. */
const sarabande = () => state([cut(0), cut(1), cut(2, 0, 1 / 3), cut(1, 2 / 3, 1), cut(2)]);

describe('newPiece', () => {
  it('has every page once, in order, landscape for portrait-shaped pages', () => {
    const p = newPiece('p', 's', 'Sarabande', aspects);
    expect(p.cuts.map((c) => [c.page, c.y0, c.y1])).toEqual([[0, 0, 1], [1, 0, 1], [2, 0, 1]]);
    expect(p.orientation).toBe('landscape');
    expect(new Set(p.cuts.map((c) => c.id)).size).toBe(3);
  });
});

describe('pack', () => {
  it('puts each whole page on its own frame', () => {
    expect(pack(sarabande().piece.cuts, aspects).map((f) => f.items.map((p) => p.index))).toEqual([[0], [1], [2, 3], [4]]);
  });
  it('places a cut below the ones before it on its frame', () => {
    const [, , f] = pack(sarabande().piece.cuts, aspects);
    expect(f.items[1].top).toBeCloseTo(A4 / 3);
    expect(f.fill).toBeCloseTo((2 * A4) / 3);
  });
  it('uses a pad only when the cut starts a frame', () => {
    const cuts = [cut(0, 0, 0.5), cut(1, 0, 0.3, { pad: 0.2 }), cut(2, 0, 0.8, { pad: 0.2 })];
    const frames = pack(cuts, aspects);
    expect(frames).toHaveLength(2);
    expect(frames[0].items[1].top).toBeCloseTo(0.5 * A4);
    expect(frames[1].items[0].top).toBeCloseTo(0.2);
  });
  it('never lets a pad push the cut off its frame', () => {
    const [f] = pack([cut(0, 0, 1, { pad: 0.3 })], aspects);
    expect(f.items[0].top).toBe(0);
  });
});

describe('edges', () => {
  const s = state([cut(0, 0.1, 0.4), cut(0, 0.4, 0.6), cut(0, 0.8, 1), cut(1, 0, 0.9), cut(0)]);
  const cuts = s.piece.cuts;
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
    const r = sarabande().piece.cuts;
    expect(edgeKind(r, 3, 'top')).toBe('trimmed');
    expect(edgeKind(r, 2, 'bottom')).toBe('trimmed');
  });
  it('clamps a tab between its own cut and the next music of the page', () => {
    expect(edgeRange(cuts, 1, 'bottom')).toEqual([0.4, 0.8]);
    expect(edgeRange(cuts, 2, 'top')).toEqual([0.6, 1]);
    expect(edgeRange(cuts, 2, 'bottom')).toEqual([0.8, 1]);
    expect(edgeRange(cuts, 0, 'top')).toEqual([0, 0.4]);
    expect(setEdge(s, cuts[1].id, 'bottom', 0.95, [0.4, 0.8]).piece.cuts[1].y1).toBe(0.8);
  });
});

describe('tidy', () => {
  it('joins a split whose halves land on one frame', () => {
    const s = tidy(state([cut(0, 0, 0.3), cut(0, 0.3, 0.6), cut(1)]), aspects);
    expect(pages(s)).toEqual([[0, 0, 0.6], [1, 0, 1]]);
  });
  it('keeps a split whose halves are on different frames', () => {
    const s = tidy(state([cut(1, 0, 0.6), cut(0, 0, 0.3), cut(0, 0.3, 1)]), aspects);
    expect(pages(s)).toEqual([[1, 0, 0.6], [0, 0, 0.3], [0, 0.3, 1]]);
  });
  it('keeps music cut out even on one frame', () => {
    const s = tidy(state([cut(0, 0, 0.3), cut(0, 0.5, 0.8)]), aspects);
    expect(s.piece.cuts).toHaveLength(2);
  });
  it('joins the halves\' ink', () => {
    const a = cut(0, 0, 0.3), b = cut(0, 0.3, 0.6);
    const s = tidy(state([a, b], { [a.id]: [line(0.1, 0.2)], [b.id]: [line(0.4, 0.5)] }), aspects);
    expect(s.ink[a.id]).toHaveLength(2);
    expect(s.ink[b.id]).toBeUndefined();
  });
});

describe('remove and archive', () => {
  it('deletes a cut without ink of its own, and any copied ink', () => {
    const a = cut(0), b = cut(1);
    const s = remove(state([a, b], { [b.id]: [line(0.1, 0.2)] }), b.id);
    expect(s.piece.cuts).toEqual([a]);
    expect(s.piece.archived).toEqual([]);
    expect(s.ink[b.id]).toBeUndefined();
  });
  it('archives a cut whose ink was drawn on it, keeping the ink', () => {
    const a = cut(0), b = cut(1);
    let s = setInk(state([a, b]), b.id, [line(0.1, 0.2)]);
    s = remove(s, b.id);
    expect(s.piece.cuts.map((c) => c.id)).toEqual([a.id]);
    expect(s.piece.archived.map((c) => c.id)).toEqual([b.id]);
    expect(s.ink[b.id]).toHaveLength(1);
  });
  it('deletes a cut whose own ink was all erased', () => {
    const a = cut(0), b = cut(1);
    const s = remove(setInk(state([a, b]), b.id, []), b.id);
    expect(s.piece.archived).toEqual([]);
  });
  it('never removes the last cut', () => {
    const s = state([cut(0)]);
    expect(remove(s, s.piece.cuts[0].id)).toBe(s);
  });
  it('brings an archived cut back with its id and ink', () => {
    const a = cut(0), b = cut(1, 0.2, 0.7);
    let s = remove(setInk(state([a, b]), b.id, [line(0.3, 0.4)]), b.id);
    s = insertArchived(s, { id: a.id, after: false }, b.id, aspects);
    expect(s.piece.cuts.map((c) => c.id)).toEqual([b.id, a.id]);
    expect(s.piece.cuts[0]).toMatchObject({ y0: 0.2, y1: 0.7 });
    expect(s.piece.archived).toEqual([]);
    expect(s.ink[b.id]).toHaveLength(1);
  });
  it('deletes an archived cut for good', () => {
    const a = cut(0), b = cut(1);
    let s = remove(setInk(state([a, b]), b.id, [line(0.3, 0.4)]), b.id);
    s = deleteArchived(s, b.id);
    expect(s.piece.archived).toEqual([]);
    expect(s.ink[b.id]).toBeUndefined();
  });
  it('archives a cut dragged to nothing as it was before the drag', () => {
    const a = cut(0), b = cut(1, 0.2, 0.9);
    const before = setInk(state([a, b]), b.id, [line(0.3, 0.4)]);
    const dragged = setEdge(before, b.id, 'bottom', 0, edgeRange(before.piece.cuts, 1, 'bottom'));
    const s = release(dragged, before, b.id, aspects);
    expect(s.piece.cuts.map((c) => c.id)).toEqual([a.id]);
    expect(s.piece.archived[0]).toMatchObject({ id: b.id, y0: 0.2, y1: 0.9 });
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
    expect(joinNext(s, s.piece.cuts[2].id)).toBe(s);
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
    expect(s.piece.cuts.map((c) => c.pad)).toEqual([0.1, undefined]);
  });
});

describe('the split cue', () => {
  it('shows on the frame after one that is mostly empty, at the room left', () => {
    const frames = pack(sarabande().piece.cuts, aspects);
    expect(splitCue(frames, 3, aspects)).toBeCloseTo(A4 / 3);
    expect(splitCue(frames, 1, aspects)).toBeNull();
  });
  it('is not shown where the frame carries on the page from the frame before', () => {
    const frames = pack([cut(1, 0, 0.5), cut(0, 0, 0.3), cut(0, 0.3, 1)], aspects);
    expect(splitCue(frames, 1, aspects)).toBeNull();
  });
  it('is not shown where it would fall at the end of the first cut', () => {
    const frames = pack([cut(0, 0, 0.5), cut(1, 0, 0.52)], aspects);
    expect(splitCue(frames, 1, aspects)).toBeNull();
  });
  it('pulls the top of the page up onto the frame before', () => {
    const s = sarabande();
    const r = pullUp(s, 3, aspects, (_p, y) => y - 0.01)!;
    expect(pages(r.state)).toEqual([[0, 0, 1], [1, 0, 1], [2, 0, 0.333], [1, 0.667, 1], [2, 0, 0.323], [2, 0.323, 1]]);
    expect(pack(r.state.piece.cuts, aspects).map((f) => f.items.length)).toEqual([1, 1, 3, 1]);
  });
  it('does nothing when there is no gap to split at', () => {
    expect(pullUp(sarabande(), 3, aspects, (_p, _y, lo) => lo)).toBeNull();
  });
});

describe('insertPages', () => {
  it('inserts a range of whole pages, backwards if picked backwards', () => {
    const s = state([cut(0), cut(2)]);
    const r = insertPages(s, { id: s.piece.cuts[0].id, after: true }, 2, 1, false, aspects);
    expect(pages(r.state)).toEqual([[0, 0, 1], [2, 0, 1], [1, 0, 1], [2, 0, 1]]);
    expect(r.first).toBe(r.state.piece.cuts[1].id);
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
    expect(r.state.piece.cuts.find((c) => c.id === r.first)!.ownInk).toBeUndefined();
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
    expect(setPad(state([c]), c.id, 5, aspects).piece.cuts[0].pad).toBeCloseTo(0.6 * A4);
    expect('pad' in setPad(state([{ ...c, pad: 0.2 }]), c.id, 0, aspects).piece.cuts[0]).toBe(false);
  });
});

describe('ink shares', () => {
  it('weights by path length, scaling vertical distance by the page aspect', () => {
    const l: Stroke = { ...line(0, 0), points: [[0, 0.1, 0.5], [0.5, 0.1, 0.5], [0.5, 0.6, 0.5]] };
    // 0.5 across inside, then 0.5 * A4 down of which 0.4 * A4 is outside 0..0.2
    expect(share(l.points, 0, 0.2, A4)).toBeCloseTo((0.5 + 0.1 * A4) / (0.5 + 0.5 * A4));
  });
  it('counts a dot as wholly where it is', () => {
    const dot: Stroke = { ...line(0, 0), points: [[0.3, 0.4, 0.5]] };
    expect(share(dot.points, 0.3, 0.5, A4)).toBe(1);
    expect(share(dot.points, 0.5, 0.6, A4)).toBe(0);
  });
  it('shows a stroke when most of it is in the cut', () => {
    expect(visible(line(0.25, 0.45), cut(0, 0.3, 1), A4)).toBe(true);
    expect(visible(line(0.1, 0.35), cut(0, 0.3, 1), A4)).toBe(false);
  });
  it('splitStrokes and claimFirstPass agree on a simple case', () => {
    const [up, down] = splitStrokes([line(0.1, 0.2), line(0.8, 0.9)], 0.5, A4);
    expect([up.length, down.length]).toEqual([1, 1]);
    const c = cut(0);
    expect(claimFirstPass([c], { [c.id]: [line(0.1, 0.2)] }, A4)).toHaveLength(1);
  });
});

describe('claimStroke', () => {
  it('gives a stroke across a seam to the cut with most of it, in that cut\'s page coordinates', () => {
    const [, , f] = pack(sarabande().piece.cuts, aspects);
    const seam = A4 / 3;
    const s: Stroke = { ...line(0, 0), points: [[0.5, seam - 0.05, 0.5], [0.5, seam + 0.2, 0.5]] };
    const r = claimStroke(f, s, aspects)!;
    expect(r.cut.page).toBe(1);
    expect(r.stroke.points[0][1]).toBeCloseTo(2 / 3 - 0.05 / A4);
    expect(r.stroke.points[1][1]).toBeCloseTo(2 / 3 + 0.2 / A4);
  });
  it('gives a stroke in blank space to the nearest cut', () => {
    const [, , f] = pack(sarabande().piece.cuts, aspects);
    const s: Stroke = { ...line(0, 0), points: [[0.5, A4 - 0.05, 0.5]] };
    expect(claimStroke(f, s, aspects)!.cut.page).toBe(1);
  });
});

describe('snapSplit', () => {
  const rows = (pattern: string) => Float32Array.from(pattern, (ch) => (ch === '#' ? 0.3 : 0));
  it('moves up out of the music to the middle of the blank band', () => {
    const r = rows('#'.repeat(40) + '.'.repeat(20) + '#'.repeat(40));
    expect(snapSplit(r, 0.75, 0)).toBeCloseTo(49.5 / 100);
  });
  it('keeps the line when the band is too thin or there is none', () => {
    expect(snapSplit(rows('#'.repeat(45) + '.'.repeat(3) + '#'.repeat(52)), 0.75, 0)).toBe(0.75);
    expect(snapSplit(rows('#'.repeat(100)), 0.75, 0)).toBe(0.75);
  });
  it('does not look above lo', () => {
    const r = rows('.'.repeat(20) + '#'.repeat(80));
    expect(snapSplit(r, 0.75, 0.3)).toBe(0.75);
  });
  it('profiles dark pixels per row', () => {
    const w = 6, h = 2, data = new Uint8ClampedArray(w * h * 4).fill(255);
    data.fill(0, 0, 4); // the first pixel of the first row is black
    expect(Array.from(rowInk(data, w, h))).toEqual([0.5, 0]);
  });
});
