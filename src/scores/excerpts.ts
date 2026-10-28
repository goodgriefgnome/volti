// Excerpts: which of a score's cuts are played, as the ids of the first and last, and the named
// excerpts a score keeps. Reading an excerpt, naming it by the score's pages, finding and keeping
// named excerpts, and keeping every excerpt on the same music when the cuts are edited. A setlist
// entry is an excerpt (setlists/); so is a named excerpt, which is an excerpt with a name, kept on
// the score, so every entry that plays it plays the named excerpt. Moving a named excerpt, with the
// setlist entries that play it, is setlists/model.ts. Pure: no DOM, no storage.

import { cutLetter, placeLabel, places } from './frames';
import type { Aspects, Cut, NamedExcerpt, Score } from './model';

/**
 * Which of a score's cuts are played: from `first` to `last`, in the score's order. A missing
 * end means the score's start or end, wherever that is now.
 */
export interface Excerpt { first?: string; last?: string }

/** The indexes i0..i1 of the cuts an excerpt plays. An end that can't be found falls back to the score's start or end. */
export function excerptRange(cuts: readonly { id: string }[], excerpt: Excerpt): { i0: number; i1: number; whole: boolean } {
  const n = cuts.length;
  let i0 = excerpt.first ? cuts.findIndex((c) => c.id === excerpt.first) : 0;
  let i1 = excerpt.last ? cuts.findIndex((c) => c.id === excerpt.last) : n - 1;
  if (i0 < 0) i0 = 0;
  if (i1 < 0) i1 = n - 1;
  if (i0 > i1) [i0, i1] = [0, n - 1];
  return { i0, i1, whole: i0 === 0 && i1 === n - 1 };
}

export function excerptCuts<C extends { id: string }>(cuts: readonly C[], excerpt: Excerpt): C[] {
  const { i0, i1 } = excerptRange(cuts, excerpt);
  return cuts.slice(i0, i1 + 1);
}

/**
 * The name an excerpt goes by until it is given one, or null when the whole score is played. It
 * counts the score's pages (its frames), with a letter for a cut that shares its page: "Page 3b – 5"
 * starts at page 3's second cut and plays all of page 5; "Pages 3–5" plays those pages whole.
 * Without the original's page shapes it falls back to the original pages: "Original pages 2–3".
 */
export function excerptLabel(cuts: readonly Cut[], excerpt: Excerpt, aspects?: Aspects): string | null {
  const { i0, i1, whole } = excerptRange(cuts, excerpt);
  if (whole || !cuts.length) return null;
  if (!aspects) {
    const a = cuts[i0].page + 1, b = cuts[i1].page + 1;
    return a === b ? `Original page ${a}` : `Original pages ${a}–${b}`;
  }
  const at = places(cuts, aspects), a = at[i0], z = at[i1];
  const fromTop = a.j === 0, toBottom = z.j === z.n - 1;
  if (a.page === z.page) {
    if (fromTop && toBottom) return `Page ${a.page}`;
    return i0 === i1 ? `Page ${placeLabel(a)}` : `Page ${placeLabel(a)}–${cutLetter(z.j)}`;
  }
  if (fromTop && toBottom) return `Pages ${a.page}–${z.page}`;
  return `Page ${fromTop ? a.page : placeLabel(a)} – ${toBottom ? z.page : placeLabel(z)}`;
}

/** The excerpt for cuts i0..i1, with ids only where it doesn't reach the score's start or end. */
export function excerptFor(cuts: readonly { id: string }[], i0: number, i1: number): Excerpt {
  const excerpt: Excerpt = {};
  if (i0 > 0) excerpt.first = cuts[i0].id;
  if (i1 < cuts.length - 1) excerpt.last = cuts[i1].id;
  return excerpt;
}

/** Keep the same excerpt with its ends cleared where they are now the score's start or end. */
function tidyExcerpt<S extends Excerpt>(excerpt: S, cuts: readonly { id: string }[]): S {
  const { first, last, ...rest } = excerpt;
  const out = rest as S;
  if (first && first !== cuts[0]?.id) out.first = first;
  if (last && last !== cuts.at(-1)?.id) out.last = last;
  return out;
}

/**
 * Move an excerpt after an edit to the score's cuts, so it plays the same music:
 * - a split cut keeps its upper half's id, so an excerpt ending on it now ends on the lower half;
 * - a cut joined into the one before it hands its place to that one;
 * - a removed cut hands the start to the next cut and the end to the one before;
 * - new cuts right before the start or after the end join the excerpt when `grow` is set.
 * Returns the same object when nothing changed.
 */
export function followEdit<S extends Excerpt>(excerpt: S, before: readonly Cut[], after: readonly Cut[], grow = false): S {
  const now = new Map(after.map((c, i) => [c.id, i]));
  const was = new Set(before.map((c) => c.id));
  const at = (id: string) => before.findIndex((c) => c.id === id);
  const isNew = (c: Cut | undefined) => !!c && !was.has(c.id);

  /** The cut that took over a removed cut's music by joining, if any. */
  const joinedInto = (i: number) => {
    const b = before[i], a = before[i - 1];
    const a2 = a && now.has(a.id) ? after[now.get(a.id)!] : undefined;
    return a2 && a2.page === b.page && a2.y1 === b.y1 && a.y1 !== a2.y1 ? a2.id : undefined;
  };
  /** The lower half split off cut `id`, which now holds the music it ended on. */
  const lowerHalf = (id: string) => {
    const old = before[at(id)], j = now.get(id)!, c = after[j], next = after[j + 1];
    if (c.y1 === old.y1 || !isNew(next) || next.page !== c.page || next.y0 !== c.y1 || next.y1 !== old.y1) return id;
    return next.id;
  };
  const survivor = (i: number, step: 1 | -1) => {
    for (let k = i + step; k >= 0 && k < before.length; k += step) if (now.has(before[k].id)) return before[k].id;
    return undefined;
  };

  let { first, last } = excerpt;
  if (first && last === first && !now.has(first) && !joinedInto(at(first))) {
    first = last = undefined;
  } else {
    if (first && !now.has(first)) {
      const i = at(first);
      first = i < 0 ? undefined : joinedInto(i) ?? survivor(i, 1);
    }
    if (last && !now.has(last)) {
      const i = at(last);
      last = i < 0 ? undefined : joinedInto(i) ?? survivor(i, -1);
    } else if (last) {
      last = lowerHalf(last);
    }
  }
  if (first && last && now.get(first)! > now.get(last)!) first = last = undefined;

  if (grow) {
    if (first) {
      let i = now.get(first)!;
      while (i > 0 && isNew(after[i - 1]) && !isLowerHalf(after, i - 1, before)) i--;
      first = after[i].id;
    }
    if (last) {
      let i = now.get(last)!;
      while (i < after.length - 1 && isNew(after[i + 1]) && !isLowerHalf(after, i + 1, before)) i++;
      last = after[i].id;
    }
  }

  const out = tidyExcerpt({ ...excerpt, first, last }, after);
  return out.first === excerpt.first && out.last === excerpt.last ? excerpt : out;
}

/** Whether the new cut at `i` is the lower half of a split of the cut before it, rather than inserted music. */
function isLowerHalf(after: readonly Cut[], i: number, before: readonly Cut[]): boolean {
  const c = after[i], up = after[i - 1];
  if (!up || up.page !== c.page || up.y1 !== c.y0) return false;
  const old = before.find((b) => b.id === up.id);
  return !!old && old.y1 === c.y1 && up.y1 !== old.y1;
}

/** Whether two excerpts play the same cuts, however their ends are stored. */
export function sameExcerpt(cuts: readonly { id: string }[], a: Excerpt, b: Excerpt): boolean {
  const x = excerptRange(cuts, a), y = excerptRange(cuts, b);
  return x.i0 === y.i0 && x.i1 === y.i1;
}

/** Only the excerpt's ends, without a name or anything else an object carries. */
export const ends = ({ first, last }: Excerpt): Excerpt => ({ ...(first ? { first } : {}), ...(last ? { last } : {}) });

/** The name on an excerpt, if it has one. */
export function namedExcerptOf(score: Score, excerpt: Excerpt): NamedExcerpt | undefined {
  if (excerptRange(score.cuts, excerpt).whole) return undefined;
  return score.excerpts?.find((n) => sameExcerpt(score.cuts, n, excerpt));
}

/** What an excerpt is called: its name, or else its generated name; null for the whole score. */
export function excerptName(score: Score, excerpt: Excerpt, aspects?: Aspects): string | null {
  return namedExcerptOf(score, excerpt)?.name ?? excerptLabel(score.cuts, excerpt, aspects);
}

/** A score's named excerpts in order: by their first cut, then their last. */
export function sortedExcerpts(score: Score): NamedExcerpt[] {
  const at = (n: NamedExcerpt) => excerptRange(score.cuts, n);
  return [...(score.excerpts ?? [])].sort((a, b) => at(a).i0 - at(b).i0 || at(a).i1 - at(b).i1);
}

/** Why a name can't go on an excerpt, or null if it can. `except` is a name being changed, which doesn't count. */
export function nameProblem(score: Score, excerpt: Excerpt, name: string, except?: NamedExcerpt): string | null {
  if (!name.trim()) return 'Give it a name.';
  if (excerptRange(score.cuts, excerpt).whole) return 'The whole score is the score itself; choose part of it.';
  const there = namedExcerptOf(score, excerpt);
  if (there && there !== except) return `That’s already “${there.name}”.`;
  const taken = score.excerpts?.find((n) => n !== except && n.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (taken) return `This score already has an excerpt called “${taken.name}”.`;
  return null;
}

/** Name an excerpt (or rename `was`). Check `nameProblem` first. */
export function setName(score: Score, excerpt: Excerpt, name: string, was?: NamedExcerpt): Score {
  const named: NamedExcerpt = { ...ends(excerpt), name: name.trim() };
  const excerpts = was ? (score.excerpts ?? []).map((n) => (n === was ? named : n)) : [...(score.excerpts ?? []), named];
  return { ...score, excerpts };
}

/** Take a name off its excerpt. Entries that play the excerpt keep playing it, under its generated name. */
export function removeName(score: Score, name: NamedExcerpt): Score {
  return { ...score, excerpts: (score.excerpts ?? []).filter((n) => n !== name) };
}

/**
 * Keep a score's names on the same music after an edit to its cuts, as entries' excerpts are kept
 * (`followEdit`). Names on `grow`, the excerpt being read, take in pages inserted at its edges, as
 * its entries do. Names that come to play the same cuts are joined ("Kyrie / Christe"), and a
 * name left on the whole score goes, as the whole score isn't named.
 */
export function followExcerpts(excerpts: readonly NamedExcerpt[] | undefined, before: readonly Cut[], after: readonly Cut[], grow?: Excerpt): NamedExcerpt[] | undefined {
  if (!excerpts || before === after) return excerpts as NamedExcerpt[] | undefined;
  const out: NamedExcerpt[] = [];
  for (const n of excerpts) {
    const f = followEdit(n, before, after, !!grow && sameExcerpt(before, n, grow));
    if (excerptRange(after, f).whole) continue;
    const k = out.findIndex((o) => sameExcerpt(after, o, f));
    if (k < 0) out.push(f);
    else out[k] = { ...out[k], name: `${out[k].name} / ${f.name}` };
  }
  const same = out.length === excerpts.length && out.every((n, i) => n === excerpts[i]);
  return same ? (excerpts as NamedExcerpt[]) : out;
}
