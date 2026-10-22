import { describe, expect, it } from 'vitest';
import type { Stroke } from '../src/ink/model';
import {
  insertArchived, insertPages, joinNext, remove, setEdge, split, type Cut, type State,
} from '../src/pieces/model';
import {
  duplicate, followEdit, followPiece, moveEntry, newEntry, spanCuts, spanFor, spanLabel, spanOf, type Setlist, type Span,
} from '../src/setlists/model';

const A4 = 297 / 210;
const aspects = [A4, A4, A4, A4];

let n = 0;
const cut = (page: number, y0 = 0, y1 = 1, extra: Partial<Cut> = {}): Cut => ({ id: `c${n++}`, page, y0, y1, ...extra });
const state = (cuts: Cut[], ink: State['ink'] = {}): State => ({
  piece: { id: 'p', sourceId: 's', title: 't', key: '', orientation: 'landscape', cuts, archived: [] },
  ink,
});
const dot: Stroke = { tool: 'pen', color: '#000', size: 0.002, points: [[0.5, 0.5, 0.5]] };
const ids = (s: State) => s.piece.cuts.map((c) => c.id);
/** The cuts a span plays, as [page, y0, y1]. */
const plays = (s: State, span: Span) => spanCuts(s.piece.cuts, span).map((c) => [c.page, c.y0, c.y1]);

/** Four whole pages; the span plays pages 2–3. */
const four = () => {
  const s = state([cut(0), cut(1), cut(2), cut(3)]);
  const [, b, c] = s.piece.cuts;
  return { s, span: { first: b.id, last: c.id } as Span };
};

describe('spanOf', () => {
  const cuts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('plays the whole piece without ends', () => {
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
  it('plays the whole piece when the start is after the end', () => {
    expect(spanOf(cuts, { first: 'c', last: 'a' })).toEqual({ i0: 0, i1: 2, whole: true });
  });
});

describe('spanFor and spanLabel', () => {
  const s = state([cut(0), cut(1), cut(2, 0, 0.5), cut(2, 0.5, 1)]);
  const cuts = s.piece.cuts;
  it('stores ids only where the span stops short of the start or end', () => {
    expect(spanFor(cuts, 0, 3)).toEqual({});
    expect(spanFor(cuts, 1, 3)).toEqual({ first: cuts[1].id });
    expect(spanFor(cuts, 0, 2)).toEqual({ last: cuts[2].id });
  });
  it('names the pages played', () => {
    expect(spanLabel(cuts, {})).toBeNull();
    expect(spanLabel(cuts, spanFor(cuts, 0, 1))).toBe('Pages 1–2');
    expect(spanLabel(cuts, spanFor(cuts, 2, 2))).toBe('Page 3');
  });
});

describe('followEdit', () => {
  it('a span ending on a split cut ends on its lower half', () => {
    const { s, span } = four();
    const r = split(s, span.last!, 0.4, aspects);
    const f = followEdit(span, s.piece.cuts, r.state.piece.cuts);
    expect(f).toEqual({ first: span.first, last: r.lower });
    expect(plays(r.state, f)).toEqual([[1, 0, 1], [2, 0, 0.4], [2, 0.4, 1]]);
  });
  it('a span starting on a split cut is unchanged', () => {
    const { s, span } = four();
    const r = split(s, span.first!, 0.4, aspects);
    expect(followEdit(span, s.piece.cuts, r.state.piece.cuts)).toBe(span);
  });
  it('a span of one split cut plays both halves', () => {
    const s = state([cut(0), cut(1), cut(2)]);
    const span = { first: ids(s)[1], last: ids(s)[1] };
    const r = split(s, span.first, 0.5, aspects);
    expect(plays(r.state, followEdit(span, s.piece.cuts, r.state.piece.cuts))).toEqual([[1, 0, 0.5], [1, 0.5, 1]]);
  });
  it('splitting the cut before the start leaves the start alone, even when growing', () => {
    const { s, span } = four();
    const r = split(s, ids(s)[0], 0.5, aspects);
    expect(followEdit(span, s.piece.cuts, r.state.piece.cuts, true)).toBe(span);
  });
  it('a span starting or ending on a joined cut does so on the one it joined', () => {
    const s = state([cut(0), cut(1, 0, 0.5), cut(1, 0.5, 1), cut(2), cut(3)]);
    const [, a, b] = ids(s);
    const after = joinNext(s, a).piece.cuts;
    expect(followEdit({ first: b, last: ids(s)[3] }, s.piece.cuts, after)).toEqual({ first: a, last: ids(s)[3] });
    expect(followEdit({ first: ids(s)[0], last: b }, s.piece.cuts, after)).toEqual({ last: a });
    expect(followEdit({ first: b, last: b }, s.piece.cuts, after)).toEqual({ first: a, last: a });
  });
  it('a removed start moves to the next cut, a removed end to the one before', () => {
    const { s, span } = four();
    expect(followEdit(span, s.piece.cuts, remove(s, span.first!).piece.cuts)).toEqual({ first: ids(s)[2], last: ids(s)[2] });
    expect(followEdit(span, s.piece.cuts, remove(s, span.last!).piece.cuts)).toEqual({ first: ids(s)[1], last: ids(s)[1] });
  });
  it('a span of only the removed cut plays the whole piece', () => {
    const { s } = four();
    const id = ids(s)[1];
    expect(followEdit({ first: id, last: id }, s.piece.cuts, remove(s, id).piece.cuts)).toEqual({});
  });
  it('clears an end that is now the piece\'s start or end', () => {
    const { s } = four();
    const span = { first: ids(s)[1] };
    expect(followEdit(span, s.piece.cuts, remove(s, ids(s)[0]).piece.cuts)).toEqual({});
  });
  it('moving an edge changes nothing', () => {
    const { s, span } = four();
    expect(followEdit(span, s.piece.cuts, setEdge(s, span.last!, 'bottom', 0.5, [0, 1]).piece.cuts)).toBe(span);
  });
  it('pages inserted inside a span are played', () => {
    const { s, span } = four();
    const r = insertPages(s, { id: span.first!, after: true }, 0, 0, false, aspects);
    const f = followEdit(span, s.piece.cuts, r.state.piece.cuts);
    expect(f).toBe(span);
    expect(plays(r.state, f).map((c) => c[0])).toEqual([1, 0, 2]);
  });
  it('pages inserted at a span\'s edges stay outside it, unless it grows', () => {
    const { s, span } = four();
    const before = insertPages(s, { id: span.first!, after: false }, 0, 1, false, aspects);
    expect(followEdit(span, s.piece.cuts, before.state.piece.cuts)).toBe(span);
    const grown = followEdit(span, s.piece.cuts, before.state.piece.cuts, true);
    expect(grown.first).toBe(before.first);
    expect(plays(before.state, grown).map((c) => c[0])).toEqual([0, 1, 1, 2]);

    const after = insertPages(s, { id: span.last!, after: true }, 0, 0, false, aspects);
    expect(plays(after.state, followEdit(span, s.piece.cuts, after.state.piece.cuts, true)).map((c) => c[0])).toEqual([1, 2, 0]);
  });
  it('an archived cut brought back at an edge grows the span too', () => {
    const marked = cut(1, 0, 1, { ownInk: true });
    const s = state([cut(0), marked, cut(2), cut(3)], { [marked.id]: [dot] });
    const removed = remove(s, marked.id);
    const span = { first: ids(s)[2], last: ids(s)[2] };
    const back = insertArchived(removed, { id: span.first, after: false }, marked.id);
    expect(followEdit(span, removed.piece.cuts, back.piece.cuts, true)).toEqual({ first: marked.id, last: span.last });
  });
  it('a whole piece stays whole whatever is inserted at its ends', () => {
    const { s } = four();
    const r = insertPages(s, { id: ids(s)[3], after: true }, 0, 0, false, aspects);
    expect(followEdit({}, s.piece.cuts, r.state.piece.cuts, true)).toEqual({});
  });
});

describe('followPiece', () => {
  const { s, span } = four();
  const other = newEntry('q');
  const list = (id: string, ...entries: Setlist['entries']): Setlist => ({ id, title: id, archived: false, entries });
  const e1 = { ...newEntry('p'), ...span }, e2 = { ...newEntry('p'), ...span };
  const setlists = [list('a', e1, other), list('b', e2), list('c', other)];

  it('updates every entry of the piece and leaves other setlists as they were', () => {
    const r = split(s, span.last!, 0.5, aspects);
    const out = followPiece(setlists, 'p', s.piece.cuts, r.state.piece.cuts);
    expect(out[0].entries[0].last).toBe(r.lower);
    expect(out[0].entries[1]).toBe(other);
    expect(out[1].entries[0].last).toBe(r.lower);
    expect(out[2]).toBe(setlists[2]);
  });
  it('grows only the entry being read', () => {
    const r = insertPages(s, { id: span.first!, after: false }, 0, 0, false, aspects);
    const out = followPiece(setlists, 'p', s.piece.cuts, r.state.piece.cuts, { setlist: 'a', entries: new Set([e1.id]) });
    expect(out[0].entries[0].first).toBe(r.first);
    expect(out[1]).toBe(setlists[1]);
  });
});

describe('setlist edits', () => {
  const s: Setlist = { id: 's', title: 'Spring recital', archived: true, entries: [newEntry('a'), { ...newEntry('b'), last: 'x' }, newEntry('c')] };
  it('moves an entry', () => {
    expect(moveEntry(s, 0, 2).entries.map((e) => e.pieceId)).toEqual(['b', 'c', 'a']);
    expect(moveEntry(s, 2, 0).entries.map((e) => e.pieceId)).toEqual(['c', 'a', 'b']);
  });
  it('duplicates with new ids, keeping the excerpts', () => {
    const d = duplicate(s);
    expect(d.title).toBe('Spring recital (copy)');
    expect(d.archived).toBe(false);
    expect(d.entries.map((e) => [e.pieceId, e.last])).toEqual([['a', undefined], ['b', 'x'], ['c', undefined]]);
    expect(d.entries.some((e, i) => e.id === s.entries[i].id)).toBe(false);
  });
});
