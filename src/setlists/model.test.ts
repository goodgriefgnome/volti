import { describe, expect, it } from 'vitest';
import { nameOf, setName, spanCuts, type Span } from '../excerpts';
import { insertPages, split } from '../scores/edits';
import type { Score, State } from '../scores';
import { A4, cut, state } from '../scores/testing';
import {
  addEntries, defaultSetlist, duplicate, followScore, moveEntry, moveExcerpt, newEntry, newSetlist, setEntrySpan, withSetlist, type Setlist,
} from './model';

const aspects = [A4, A4, A4, A4];

/** The cuts a span plays, as [page, y0, y1]. */
const plays = (s: State, span: Span) => spanCuts(s.score.cuts, span).map((c) => [c.page, c.y0, c.y1]);

/** Four whole pages; the span plays pages 2–3. */
const four = () => {
  const s = state([cut(0), cut(1), cut(2), cut(3)]);
  const [, b, c] = s.score.cuts;
  return { s, span: { first: b.id, last: c.id } as Span };
};

/** Four whole pages: the Kyrie is pages 1–2, the Gloria pages 3–4. */
const mass = () => {
  const s = state([cut(0), cut(1), cut(2), cut(3)]);
  const [a, b, c] = s.score.cuts;
  let score: Score = setName(s.score, { last: b.id }, 'Kyrie');
  score = setName(score, { first: c.id }, 'Gloria');
  return { s: { ...s, score }, a, b, c };
};

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
  it('adds entries at the end, each with only the ends of its span', () => {
    const named = { first: 'p', name: 'Kyrie' };
    const t = addEntries(s, [{ scoreId: 'd' }, { scoreId: 'e', span: named }]);
    expect(t.entries.slice(0, 3)).toEqual(s.entries);
    expect(t.entries.slice(3).map(({ id: _, ...e }) => e)).toEqual([{ scoreId: 'd' }, { scoreId: 'e', first: 'p' }]);
  });
  it('sets the span an entry plays', () => {
    const t = setEntrySpan(s, s.entries[1].id, { first: 'y' });
    expect(t.entries[1]).toEqual({ id: s.entries[1].id, scoreId: 'b', first: 'y' });
    expect(t.entries[0]).toBe(s.entries[0]);
  });
  it('puts a changed setlist in its place, and a new one first', () => {
    const other = newSetlist('Other'), renamed = { ...s, title: 'Autumn recital' };
    expect(withSetlist([other, s], renamed)).toEqual([other, renamed]);
    expect(withSetlist([s], other)).toEqual([other, s]);
  });
});

describe('defaultSetlist', () => {
  const a = newSetlist('A'), b = newSetlist('B'), old = { ...newSetlist('Old'), archived: true };

  it('is the setlist a score was last added to', () => {
    expect(defaultSetlist([a, b], b.id)).toBe(b);
  });

  it('is the first setlist not archived when that one is gone or archived, or there is none yet', () => {
    expect(defaultSetlist([a, b], 'deleted')).toBe(a);
    expect(defaultSetlist([old, a, b], old.id)).toBe(a);
    expect(defaultSetlist([a, b], undefined)).toBe(a);
  });

  it('is none without a setlist that isn\'t archived', () => {
    expect(defaultSetlist([], undefined)).toBeUndefined();
    expect(defaultSetlist([old], old.id)).toBeUndefined();
  });
});

describe('moveExcerpt', () => {
  it('moves the name and every entry of its span, in every setlist', () => {
    const { s, a, b } = mass();
    const kyrie = nameOf(s.score, { last: b.id })!;
    const e1 = { ...newEntry('p'), last: b.id }, e2 = { ...newEntry('p'), first: a.id, last: b.id }, other = { ...newEntry('p'), last: a.id };
    const setlists: Setlist[] = [
      { id: 'x', title: 'x', archived: false, entries: [e1, other] },
      { id: 'y', title: 'y', archived: false, entries: [e2] },
      { id: 'z', title: 'z', archived: false, entries: [newEntry('q')] },
    ];
    const r = moveExcerpt(s.score, setlists, kyrie, { last: a.id });
    expect(nameOf(r.score, { last: a.id })?.name).toBe('Kyrie');
    expect(nameOf(r.score, { last: b.id })).toBeUndefined();
    expect(r.setlists[0].entries[0]).toEqual({ id: e1.id, scoreId: 'p', last: a.id });
    expect(r.setlists[0].entries[1]).toBe(other);
    expect(r.setlists[1].entries[0]).toEqual({ id: e2.id, scoreId: 'p', last: a.id });
    expect(r.setlists[2]).toBe(setlists[2]);
  });
});

