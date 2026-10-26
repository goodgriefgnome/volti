import { describe, expect, it } from 'vitest';
import { nameOf, setName } from '../excerpts';
import { insertPages, remove } from '../scores';
import { aspects, cut, state } from '../scores/testing';
import { newEntry, newSetlist, type Setlist } from '../setlists/model';
import type { SourceFile } from '../originals';
import { Reading, setlistItems } from './reading';

/** Three whole pages, the Kyrie being the first two. */
const mass = () => {
  const s = state([cut(0), cut(1), cut(2)]);
  const [a, b] = s.score.cuts;
  return { s: { ...s, score: setName(s.score, { last: b.id }, 'Kyrie') }, a, b };
};
const item = { scoreId: 'p', title: 'Mass' };

describe('Reading', () => {
  it('plays a setlist entry\'s span, and the whole score for a score', () => {
    const { s, b } = mass();
    const e = { ...newEntry('p'), last: b.id };
    const set: Setlist = { ...newSetlist('Spring'), entries: [e] };
    const r = new Reading([{ ...item, entryId: e.id }], { kind: 'setlist', id: set.id }, [set]);
    expect(r.playedCuts(0, s.score.cuts)).toHaveLength(2);
    expect(r.excerptName(0, s.score)).toBe('Kyrie');
    expect(new Reading([item], { kind: 'score' }, []).playedCuts(0, s.score.cuts)).toHaveLength(3);
  });

  it('lists a setlist\'s entries again in place, keeping a score found missing', () => {
    const a = newEntry('p'), b = newEntry('q');
    const set: Setlist = { ...newSetlist('Spring'), entries: [a, b] };
    const originals = new Map([['p', { id: 'p', path: 'Mass.pdf' } as SourceFile]]);
    const items = setlistItems(set, originals, { q: 'Requiem' });
    expect(items.map((it) => [it.title, !!it.missing])).toEqual([['Mass', false], ['Requiem', true]]);
    const r = new Reading(items, { kind: 'setlist', id: set.id }, [set]);
    const shared = r.items;
    items[0].missing = true; // it couldn't be opened
    r.relist(setlistItems({ ...set, entries: [b, a, a] }, originals, {}));
    expect(r.items).toBe(shared);
    expect(r.items.map((it) => [it.title, !!it.missing])).toEqual([['Missing score', true], ['Mass', true], ['Mass', true]]);
  });

  it('turns to another score only in a score\'s own reader', () => {
    const r = new Reading([item], { kind: 'score' }, []);
    r.turnTo({ scoreId: 'q', title: 'Requiem' });
    expect(r.items.map((x) => x.title)).toEqual(['Requiem']);
    const x = new Reading([item], { kind: 'excerpt', span: {} }, []);
    x.turnTo({ scoreId: 'q', title: 'Requiem' });
    expect(x.items.map((it) => it.title)).toEqual(['Mass']);
  });

  it('carries an edit to the excerpt read, the score\'s names and every setlist', () => {
    const { s, b } = mass();
    const other: Setlist = { ...newSetlist('Autumn'), entries: [{ ...newEntry('p'), last: b.id }] };
    const r = new Reading([item], { kind: 'excerpt', span: { last: b.id } }, [other]);
    // A page inserted after the Kyrie, while reading it, joins it.
    const { state: after } = insertPages(s, { id: b.id, after: true }, 2, 2, false, aspects);
    const took = r.edited(0, 'p', s.score.cuts, after);
    const last = after.score.cuts[2].id;
    expect(r.what).toEqual({ kind: 'excerpt', span: { last } });
    expect(nameOf(took.score, { last })?.name).toBe('Kyrie');
    expect(r.setlists[0].entries[0].last).toBe(last);
  });

  it('carries a removed cut to the setlists, and can be put back as it was', () => {
    const { s, a, b } = mass();
    const set: Setlist = { ...newSetlist('Spring'), entries: [{ ...newEntry('p'), last: b.id }] };
    const r = new Reading([item], { kind: 'score' }, [set]);
    const was = r.snapshot();
    r.edited(0, 'p', s.score.cuts, remove(s, b.id));
    expect(r.setlists[0].entries[0].last).toBe(a.id);
    r.restore(was);
    expect(r.setlists).toEqual([set]);
  });

  it('plays another span: the entry, in a setlist; the excerpt read, otherwise', () => {
    const { b } = mass();
    const e = newEntry('p'), set: Setlist = { ...newSetlist('Spring'), entries: [e] };
    const r = new Reading([{ ...item, entryId: e.id }], { kind: 'setlist', id: set.id }, [set]);
    r.play(0, { last: b.id });
    expect(r.entry(0)).toEqual({ id: e.id, scoreId: 'p', last: b.id });
    const x = new Reading([item], { kind: 'excerpt', span: {} }, []);
    x.play(0, { first: b.id, name: 'not kept' } as never);
    expect(x.what).toEqual({ kind: 'excerpt', span: { first: b.id } });
  });

  it('adds what it reads to a setlist, new or not', () => {
    const { b } = mass();
    const r = new Reading([item], { kind: 'excerpt', span: { last: b.id } }, []);
    const fresh = newSetlist('New');
    r.addTo(fresh);
    expect(r.setlists).toHaveLength(1);
    expect(r.setlists[0].entries.map(({ id: _, ...e }) => e)).toEqual([{ scoreId: 'p', last: b.id }]);
  });
});
