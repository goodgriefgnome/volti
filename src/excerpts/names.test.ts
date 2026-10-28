import { describe, expect, it } from 'vitest';
import { insertPages, joinNext, remove, split } from '../scores/edits';
import type { Score } from '../scores/model';
import { A4, cut, state } from '../scores/testing';
import { excerptName, followNames, nameOf, nameProblem, removeName, setName, sortedNames } from './names';
import { sameSpan } from './span';

const aspects = [A4, A4, A4, A4];

/** Four whole pages: the Kyrie is pages 1–2, the Gloria pages 3–4. */
const mass = () => {
  const s = state([cut(0), cut(1), cut(2), cut(3)]);
  const [a, b, c] = s.score.cuts;
  let score: Score = setName(s.score, { last: b.id }, 'Kyrie');
  score = setName(score, { first: c.id }, 'Gloria');
  return { s: { ...s, score }, a, b, c };
};

describe('names on spans', () => {
  it('finds a name by the cuts its span plays, however the ends are stored', () => {
    const { s, a, b } = mass();
    expect(nameOf(s.score, { first: a.id, last: b.id })?.name).toBe('Kyrie');
    expect(nameOf(s.score, { last: b.id })?.name).toBe('Kyrie');
    expect(sameSpan(s.score.cuts, { first: a.id, last: b.id }, { last: b.id })).toBe(true);
  });
  it('calls an unnamed excerpt by its pages', () => {
    const { s, b } = mass();
    expect(excerptName(s.score, { first: b.id, last: b.id }, aspects)).toBe('Page 2');
    expect(excerptName(s.score, { last: b.id }, aspects)).toBe('Kyrie');
    expect(excerptName(s.score, {}, aspects)).toBeNull();
  });
  it('lists names by their first cut, then their last', () => {
    const { s, a, b } = mass();
    const score = setName(setName(s.score, { first: b.id }, 'Christe to the end'), { first: a.id, last: a.id }, 'Kyrie I');
    expect(sortedNames(score).map((n) => n.name)).toEqual(['Kyrie I', 'Kyrie', 'Christe to the end', 'Gloria']);
  });
  it('allows one name per span, unique in the score, and none on the whole score', () => {
    const { s, a, b } = mass();
    expect(nameProblem(s.score, { last: b.id }, 'Kyrie eleison')).toBe('That’s already “Kyrie”.');
    expect(nameProblem(s.score, { last: a.id }, 'gloria')).toBe('This score already has an excerpt called “Gloria”.');
    expect(nameProblem(s.score, {}, 'All')).toMatch(/whole score/);
    expect(nameProblem(s.score, { last: a.id }, ' ')).toBe('Give it a name.');
    expect(nameProblem(s.score, { last: a.id }, 'Kyrie I')).toBeNull();
    // Renaming keeps its own span and may keep its own name.
    const kyrie = nameOf(s.score, { last: b.id })!;
    expect(nameProblem(s.score, { last: b.id }, 'Kyrie', kyrie)).toBeNull();
  });
  it('renames in place and takes a name off', () => {
    const { s, b } = mass();
    const kyrie = nameOf(s.score, { last: b.id })!;
    const renamed = setName(s.score, kyrie, 'Kyrie eleison', kyrie);
    expect(sortedNames(renamed).map((n) => n.name)).toEqual(['Kyrie eleison', 'Gloria']);
    expect(nameOf(removeName(s.score, kyrie), { last: b.id })).toBeUndefined();
  });
});

describe('followNames', () => {
  it('keeps names on the same music', () => {
    const { s, b } = mass();
    const r = split(s, b.id, 0.5, aspects);
    const names = followNames(s.score.names, s.score.cuts, r.state.score.cuts)!;
    expect(names[0]).toEqual({ last: r.lower, name: 'Kyrie' });
    expect(names[1]).toBe(s.score.names![1]);
  });
  it('returns the same list when nothing moved', () => {
    const { s, a } = mass();
    const r = split(s, a.id, 0.5, aspects);
    expect(followNames(s.score.names, s.score.cuts, r.state.score.cuts)).toBe(s.score.names);
  });
  it('grows the name of the excerpt being read, and only that one', () => {
    const { s, b, c } = mass();
    const r = insertPages(s, { id: b.id, after: true }, 0, 0, false, aspects);
    const names = followNames(s.score.names, s.score.cuts, r.state.score.cuts, { last: b.id })!;
    expect(names[0].last).toBe(r.first);
    expect(names[1].first).toBe(c.id);
  });
  it('joins names that come to play the same cuts', () => {
    const s = state([cut(0, 0, 0.5), cut(0, 0.5, 1), cut(1)]);
    const [a, b] = s.score.cuts;
    const score = setName(setName(s.score, { last: a.id }, 'Kyrie'), { first: a.id, last: b.id }, 'Kyrie–Christe');
    const joined = joinNext({ ...s, score }, a.id);
    const names = followNames(score.names, s.score.cuts, joined.score.cuts)!;
    expect(names).toEqual([{ last: a.id, name: 'Kyrie / Kyrie–Christe' }]);
  });
  it('drops a name left on the whole score', () => {
    const { s, b, c } = mass();
    const r = remove(remove(s, c.id), s.score.cuts[3].id);
    expect(sameSpan(r.score.cuts, { last: b.id }, {})).toBe(true);
    expect(followNames(s.score.names, s.score.cuts, r.score.cuts)).toEqual([]);
  });
});
