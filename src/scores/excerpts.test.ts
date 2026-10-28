import { describe, expect, it } from 'vitest';
import type { Stroke } from '../markings/stroke';
import { insertArchived, insertPages, joinNext, remove, setEdge, split } from './edits';
import { excerptName, followEdit, followNames, nameOf, nameProblem, removeName, sameSpan, setName, sortedNames, spanCuts, spanFor, spanLabel, spanOf, type Span } from './excerpts';
import type { Score, State } from './model';
import { A4, cut, state } from './testing';

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
