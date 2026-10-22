import { describe, expect, it } from 'vitest';
import type { Stroke } from '../markings/stroke';
import { insertArchived, insertPages, joinNext, remove, setEdge, split } from '../scores/edits';
import type { State } from '../scores/model';
import { A4, cut, state } from '../scores/testing';
import {
  duplicate, followEdit, followScore, moveEntry, newEntry, spanCuts, spanFor, spanLabel, spanOf, type Setlist, type Span,
} from './model';

const aspects = [A4, A4, A4, A4];

const dot: Stroke = { tool: 'pen', color: '#000', size: 0.002, points: [[0.5, 0.5, 0.5]] };
const ids = (s: State) => s.score.cuts.map((c) => c.id);
/** The cuts a span plays, as [page, y0, y1]. */
const plays = (s: State, span: Span) => spanCuts(s.score.cuts, span).map((c) => [c.page, c.y0, c.y1]);

/** Four whole pages; the span plays pages 2–3. */
const four = () => {
  const s = state([cut(0), cut(1), cut(2), cut(3)]);
  const [, b, c] = s.score.cuts;
  return { s, span: { first: b.id, last: c.id } as Span };
};

describe('spanOf', () => {
  const cuts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('plays the whole score without ends', () => {
    expect(spanOf(cuts, {})).toEqual({ i0: 0, i1: 2, whole: true });
  });
  it('plays from first to last', () => {
    expect(spanOf(cuts, { first: 'b' })).toEqual({ i0: 1, i1: 2, whole: false });
    expect(spanOf(cuts, { last: 'b' })).toEqual({ i0: 0, i1: 1, whole: false });
    expect(spanOf(cuts, { first: 'b', last: 'b' })).toEqual({ i0: 1, i1: 1, whole: false });
  });
  it('falls back to the start or end for an id it cannot find', () => {
    expect(spanOf(cuts, { first: 'x', last: 'b' })).toEqual({ i0: 0, i1: 1, whole: false });
    expect(spanOf(cuts, { first: 'b', last: 'x' })).toEqual({ i0: 1, i1: 2, whole: false });
  });
  it('plays the whole score when the start is after the end', () => {
    expect(spanOf(cuts, { first: 'c', last: 'a' })).toEqual({ i0: 0, i1: 2, whole: true });
  });
});

describe('spanFor and spanLabel', () => {
  const s = state([cut(0), cut(1), cut(2, 0, 0.5), cut(2, 0.5, 1)]);
  const cuts = s.score.cuts;
  it('stores ids only where the span stops short of the start or end', () => {
    expect(spanFor(cuts, 0, 3)).toEqual({});
    expect(spanFor(cuts, 1, 3)).toEqual({ first: cuts[1].id });
    expect(spanFor(cuts, 0, 2)).toEqual({ last: cuts[2].id });
  });
  it('names the original pages played, without their shapes', () => {
    expect(spanLabel(cuts, {})).toBeNull();
    expect(spanLabel(cuts, spanFor(cuts, 0, 1))).toBe('Original pages 1–2');
    expect(spanLabel(cuts, spanFor(cuts, 2, 2))).toBe('Original page 3');
  });
});

describe('spanLabel', () => {
  // Pages (frames) of the score: 1 is original page 1; 2 holds three thirds of original page 2;
  // 3 is original page 3; 4 holds the two halves of original page 4.
  const s = state([cut(0), cut(1, 0, 1 / 3), cut(1, 1 / 3, 2 / 3), cut(1, 2 / 3, 1), cut(2), cut(3, 0, 0.5), cut(3, 0.5, 1)]);
  const cuts = s.score.cuts;
  const label = (i0: number, i1: number) => spanLabel(cuts, spanFor(cuts, i0, i1), aspects);
  it('is null for the whole score', () => {
    expect(label(0, 6)).toBeNull();
  });
  it('counts whole pages without letters', () => {
    expect(label(0, 0)).toBe('Page 1');
    expect(label(1, 3)).toBe('Page 2');
    expect(label(0, 4)).toBe('Pages 1–3');
  });
  it('gives a letter where an excerpt starts or ends partway down a page', () => {
    expect(label(2, 4)).toBe('Page 2b – 3');
    expect(label(0, 5)).toBe('Page 1 – 4a');
    expect(label(2, 5)).toBe('Page 2b – 4a');
  });
  it('names part of one page by its letters', () => {
    expect(label(2, 2)).toBe('Page 2b');
    expect(label(1, 2)).toBe('Page 2a–b');
    expect(label(6, 6)).toBe('Page 4b');
  });
});

describe('followEdit', () => {
  it('a span ending on a split cut ends on its lower half', () => {
    const { s, span } = four();
    const r = split(s, span.last!, 0.4, aspects);
    const f = followEdit(span, s.score.cuts, r.state.score.cuts);
    expect(f).toEqual({ first: span.first, last: r.lower });
    expect(plays(r.state, f)).toEqual([[1, 0, 1], [2, 0, 0.4], [2, 0.4, 1]]);
  });
  it('a span starting on a split cut is unchanged', () => {
    const { s, span } = four();
    const r = split(s, span.first!, 0.4, aspects);
    expect(followEdit(span, s.score.cuts, r.state.score.cuts)).toBe(span);
  });
  it('a span of one split cut plays both halves', () => {
    const s = state([cut(0), cut(1), cut(2)]);
    const span = { first: ids(s)[1], last: ids(s)[1] };
    const r = split(s, span.first, 0.5, aspects);
    expect(plays(r.state, followEdit(span, s.score.cuts, r.state.score.cuts))).toEqual([[1, 0, 0.5], [1, 0.5, 1]]);
  });
  it('splitting the cut before the start leaves the start alone, even when growing', () => {
    const { s, span } = four();
    const r = split(s, ids(s)[0], 0.5, aspects);
    expect(followEdit(span, s.score.cuts, r.state.score.cuts, true)).toBe(span);
  });
  it('a span starting or ending on a joined cut does so on the one it joined', () => {
    const s = state([cut(0), cut(1, 0, 0.5), cut(1, 0.5, 1), cut(2), cut(3)]);
    const [, a, b] = ids(s);
    const after = joinNext(s, a).score.cuts;
    expect(followEdit({ first: b, last: ids(s)[3] }, s.score.cuts, after)).toEqual({ first: a, last: ids(s)[3] });
    expect(followEdit({ first: ids(s)[0], last: b }, s.score.cuts, after)).toEqual({ last: a });
    expect(followEdit({ first: b, last: b }, s.score.cuts, after)).toEqual({ first: a, last: a });
  });
  it('a removed start moves to the next cut, a removed end to the one before', () => {
    const { s, span } = four();
    expect(followEdit(span, s.score.cuts, remove(s, span.first!).score.cuts)).toEqual({ first: ids(s)[2], last: ids(s)[2] });
    expect(followEdit(span, s.score.cuts, remove(s, span.last!).score.cuts)).toEqual({ first: ids(s)[1], last: ids(s)[1] });
  });
  it('a span of only the removed cut plays the whole score', () => {
    const { s } = four();
    const id = ids(s)[1];
    expect(followEdit({ first: id, last: id }, s.score.cuts, remove(s, id).score.cuts)).toEqual({});
  });
  it('clears an end that is now the score\'s start or end', () => {
    const { s } = four();
    const span = { first: ids(s)[1] };
    expect(followEdit(span, s.score.cuts, remove(s, ids(s)[0]).score.cuts)).toEqual({});
  });
  it('moving an edge changes nothing', () => {
    const { s, span } = four();
    expect(followEdit(span, s.score.cuts, setEdge(s, span.last!, 'bottom', 0.5, [0, 1]).score.cuts)).toBe(span);
  });
  it('pages inserted inside a span are played', () => {
    const { s, span } = four();
    const r = insertPages(s, { id: span.first!, after: true }, 0, 0, false, aspects);
    const f = followEdit(span, s.score.cuts, r.state.score.cuts);
    expect(f).toBe(span);
    expect(plays(r.state, f).map((c) => c[0])).toEqual([1, 0, 2]);
  });
  it('pages inserted at a span\'s edges stay outside it, unless it grows', () => {
    const { s, span } = four();
    const before = insertPages(s, { id: span.first!, after: false }, 0, 1, false, aspects);
    expect(followEdit(span, s.score.cuts, before.state.score.cuts)).toBe(span);
    const grown = followEdit(span, s.score.cuts, before.state.score.cuts, true);
    expect(grown.first).toBe(before.first);
    expect(plays(before.state, grown).map((c) => c[0])).toEqual([0, 1, 1, 2]);

    const after = insertPages(s, { id: span.last!, after: true }, 0, 0, false, aspects);
    expect(plays(after.state, followEdit(span, s.score.cuts, after.state.score.cuts, true)).map((c) => c[0])).toEqual([1, 2, 0]);
  });
  it('an archived cut brought back at an edge grows the span too', () => {
    const marked = cut(1, 0, 1, { ownInk: true });
    const s = state([cut(0), marked, cut(2), cut(3)], { [marked.id]: [dot] });
    const removed = remove(s, marked.id);
    const span = { first: ids(s)[2], last: ids(s)[2] };
    const back = insertArchived(removed, { id: span.first, after: false }, marked.id);
    expect(followEdit(span, removed.score.cuts, back.score.cuts, true)).toEqual({ first: marked.id, last: span.last });
  });
  it('a whole score stays whole whatever is inserted at its ends', () => {
    const { s } = four();
    const r = insertPages(s, { id: ids(s)[3], after: true }, 0, 0, false, aspects);
    expect(followEdit({}, s.score.cuts, r.state.score.cuts, true)).toEqual({});
  });
});

describe('followScore', () => {
  const { s, span } = four();
  const other = newEntry('q');
  const list = (id: string, ...entries: Setlist['entries']): Setlist => ({ id, title: id, archived: false, entries });
  const e1 = { ...newEntry('p'), ...span }, e2 = { ...newEntry('p'), ...span };
  const setlists = [list('a', e1, other), list('b', e2), list('c', other)];

  it('updates every entry of the score and leaves other setlists as they were', () => {
    const r = split(s, span.last!, 0.5, aspects);
    const out = followScore(setlists, 'p', s.score.cuts, r.state.score.cuts);
    expect(out[0].entries[0].last).toBe(r.lower);
    expect(out[0].entries[1]).toBe(other);
    expect(out[1].entries[0].last).toBe(r.lower);
    expect(out[2]).toBe(setlists[2]);
  });
  it('grows every entry of the excerpt being read, and no other', () => {
    const r = insertPages(s, { id: span.first!, after: false }, 0, 0, false, aspects);
    const third = { ...newEntry('p'), first: span.first }, mixed = [...setlists, list('d', third)];
    const out = followScore(mixed, 'p', s.score.cuts, r.state.score.cuts, span);
    expect(out[0].entries[0].first).toBe(r.first);
    expect(out[1].entries[0].first).toBe(r.first);
    expect(out[3]).toBe(mixed[3]);
  });
  it('moves each entry of a score that comes twice on its own music', () => {
    // The Kyrie (page 1), another piece, then the Gloria (pages 3–4), all from one score.
    const [p1, , p3] = s.score.cuts;
    const kyrie = { ...newEntry('p'), last: p1.id }, gloria = { ...newEntry('p'), first: p3.id };
    const mass = [list('m', kyrie, other, gloria)];
    const r = split(s, p1.id, 0.5, aspects).state;
    const out = followScore(mass, 'p', s.score.cuts, r.score.cuts)[0].entries;
    expect(plays(r, out[0])).toEqual([[0, 0, 0.5], [0, 0.5, 1]]);
    expect(out[1]).toBe(other);
    expect(out[2]).toBe(gloria);
    expect(plays(r, out[2])).toEqual([[2, 0, 1], [3, 0, 1]]);
  });
  it('grows only the entry being read when the score comes twice', () => {
    const [, , p3] = s.score.cuts;
    const kyrie = { ...newEntry('p'), last: p3.id }, gloria = { ...newEntry('p'), first: p3.id };
    const mass = [list('m', kyrie, gloria)];
    const r = insertPages(s, { id: p3.id, after: true }, 0, 0, false, aspects);
    const out = followScore(mass, 'p', s.score.cuts, r.state.score.cuts, kyrie)[0].entries;
    expect(out[0].last).toBe(r.first);
    expect(out[1]).toBe(gloria);
  });
});

describe('setlist edits', () => {
  const s: Setlist = { id: 's', title: 'Spring recital', archived: true, entries: [newEntry('a'), { ...newEntry('b'), last: 'x' }, newEntry('c')] };
  it('moves an entry', () => {
    expect(moveEntry(s, 0, 2).entries.map((e) => e.scoreId)).toEqual(['b', 'c', 'a']);
    expect(moveEntry(s, 2, 0).entries.map((e) => e.scoreId)).toEqual(['c', 'a', 'b']);
  });
  it('duplicates with new ids, keeping the excerpts', () => {
    const d = duplicate(s);
    expect(d.title).toBe('Spring recital (copy)');
    expect(d.archived).toBe(false);
    expect(d.entries.map((e) => [e.scoreId, e.last])).toEqual([['a', undefined], ['b', 'x'], ['c', undefined]]);
    expect(d.entries.some((e, i) => e.id === s.entries[i].id)).toBe(false);
  });
});
