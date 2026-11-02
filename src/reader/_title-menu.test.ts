import { describe, expect, it } from 'vitest';
import { setName } from '../scores/excerpts';
import type { State } from '../scores/model';
import { aspects, cut, state } from '../scores/testing';
import { newEntry, newSetlist, type Setlist } from '../setlists/model';
import { Reading } from './_reading';
import { _titleRows } from './_title-menu';
import type { MenusHost } from './_toolbar-menus';
import type { OpenScore } from './_open-scores';

/** Three pages; "Kyrie" is the first two, "Gloria" the third. */
const mass = () => {
  const st = state([cut(0), cut(1), cut(2)]);
  const [a, b, c] = st.score.cuts;
  const named = setName(setName(st.score, { last: b.id }, 'Kyrie'), { first: c.id }, 'Gloria');
  return { s: { ...st, score: named }, a, b, c };
};

/** Only what _titleRows reads. */
const host = (reading: Reading, k: number, open: Record<number, OpenScore | undefined>, calls: string[] = []): MenusHost => ({
  reading,
  k: () => k,
  open: (i: number) => open[i],
  goTo: (i: number) => calls.push(`goTo ${i}`),
  readWhole: () => calls.push('whole'),
  playExcerpt: (x: { first?: string; last?: string }) => calls.push(`play ${x.first ?? ''}-${x.last ?? ''}`),
}) as unknown as MenusHost;

const opened = (s: State) => ({ id: 'p', state: s, aspects }) as unknown as OpenScore;

describe('_titleRows', () => {
  it('lists a setlist\'s entries, the one read marked', () => {
    const { s, b } = mass();
    const e1 = newEntry('p'), e2 = { ...newEntry('p'), last: b.id };
    const set: Setlist = { ...newSetlist('Spring'), entries: [e1, e2] };
    const r = new Reading([{ scoreId: 'p', title: 'Mass', entryId: e1.id }, { scoreId: 'p', title: 'Mass', entryId: e2.id }], { kind: 'setlist', id: set.id }, [set]);
    const calls: string[] = [];
    const rows = _titleRows(host(r, 1, { 0: opened(s), 1: opened(s) }, calls));
    expect(rows.map((x) => [x.label, x.current])).toEqual([['1. Mass', false], ['2. Mass · Kyrie', true]]);
    rows[0].go();
    expect(calls).toEqual(['goTo 0']);
    // every entry can be moved, changed and removed
    expect(rows.map((x) => [x.index, !!x.change, !!x.remove])).toEqual([[0, true, true], [1, true, true]]);
  });

  it('gives Whole score first, then the excerpts in library order', () => {
    const { s } = mass();
    const r = new Reading([{ scoreId: 'p', title: 'Mass' }], { kind: 'score' }, []);
    const rows = _titleRows(host(r, 0, { 0: opened(s) }));
    expect(rows.map((x) => [x.label, x.current])).toEqual([['Whole score', true], ['Kyrie', false], ['Gloria', false]]);
  });

  it('gives Whole score no swap or bin, and each excerpt both', () => {
    const { s } = mass();
    const r = new Reading([{ scoreId: 'p', title: 'Mass' }], { kind: 'score' }, []);
    const rows = _titleRows(host(r, 0, { 0: opened(s) }));
    expect(rows.map((x) => [!!x.change, !!x.remove, x.index])).toEqual([[false, false, undefined], [true, true, undefined], [true, true, undefined]]);
  });

  it('has only Whole score before the score is open', () => {
    const r = new Reading([{ scoreId: 'p', title: 'Mass' }], { kind: 'score' }, []);
    expect(_titleRows(host(r, 0, {})).map((x) => x.label)).toEqual(['Whole score']);
  });

  it('marks the named excerpt being read', () => {
    const { s, c } = mass();
    const r = new Reading([{ scoreId: 'p', title: 'Mass' }], { kind: 'excerpt', excerpt: { first: c.id } }, []);
    const calls: string[] = [];
    const rows = _titleRows(host(r, 0, { 0: opened(s) }, calls));
    expect(rows.map((x) => [x.label, x.current])).toEqual([['Whole score', false], ['Kyrie', false], ['Gloria', true]]);
    rows[0].go();
    rows[1].go();
    expect(calls).toEqual(['whole', `play -${s.score.cuts[1].id}`]);
  });
});
