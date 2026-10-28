// Spans and the names on them. A span is which of a score's cuts an excerpt plays, as the ids of its
// first and last cut: reading it, naming it by the score's pages, and keeping it on the same music
// when the score's cuts are edited. A setlist entry is a span (setlists/); so is a named excerpt,
// which is a name on a span, kept on the score. An excerpt is its span and nothing more, so a name
// is a label on a span: every entry that plays the span plays the named excerpt. Naming, renaming
// and finding names, and keeping them on the same music when the cuts are edited. Moving a named
// excerpt, with the setlist entries that play it, is setlists/model.ts. Pure: no DOM, no storage.

import { cutLetter, placeLabel, places } from './frames';
import type { Aspects, Cut, ExcerptName, Score } from './model';

/**
 * Which of a score's cuts are played: from `first` to `last`, in the score's order. A missing
 * end means the score's start or end, wherever that is now.
 */
export interface Span { first?: string; last?: string }

/** The indexes i0..i1 of the cuts a span plays. An end that can't be found falls back to the score's start or end. */
export function spanOf(cuts: readonly { id: string }[], span: Span): { i0: number; i1: number; whole: boolean } {
  const n = cuts.length;
  let i0 = span.first ? cuts.findIndex((c) => c.id === span.first) : 0;
  let i1 = span.last ? cuts.findIndex((c) => c.id === span.last) : n - 1;
  if (i0 < 0) i0 = 0;
  if (i1 < 0) i1 = n - 1;
  if (i0 > i1) [i0, i1] = [0, n - 1];
  return { i0, i1, whole: i0 === 0 && i1 === n - 1 };
}

export function spanCuts<C extends { id: string }>(cuts: readonly C[], span: Span): C[] {
  const { i0, i1 } = spanOf(cuts, span);
  return cuts.slice(i0, i1 + 1);
}

/**
 * The name an excerpt goes by until it is given one, or null when the whole score is played. It
 * counts the score's pages (its frames), with a letter for a cut that shares its page: "Page 3b – 5"
 * starts at page 3's second cut and plays all of page 5; "Pages 3–5" plays those pages whole.
 * Without the original's page shapes it falls back to the original pages: "Original pages 2–3".
 */
export function spanLabel(cuts: readonly Cut[], span: Span, aspects?: Aspects): string | null {
  const { i0, i1, whole } = spanOf(cuts, span);
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

/** The span for cuts i0..i1, with ids only where it doesn't reach the score's start or end. */
export function spanFor(cuts: readonly { id: string }[], i0: number, i1: number): Span {
  const span: Span = {};
  if (i0 > 0) span.first = cuts[i0].id;
  if (i1 < cuts.length - 1) span.last = cuts[i1].id;
  return span;
}

/** Keep the same span with its ends cleared where they are now the score's start or end. */
function tidySpan<S extends Span>(span: S, cuts: readonly { id: string }[]): S {
  const { first, last, ...rest } = span;
  const out = rest as S;
  if (first && first !== cuts[0]?.id) out.first = first;
  if (last && last !== cuts.at(-1)?.id) out.last = last;
  return out;
}

/**
 * Move a span after an edit to the score's cuts, so it plays the same music:
 * - a split cut keeps its upper half's id, so a span ending on it now ends on the lower half;
 * - a cut joined into the one before it hands its place to that one;
 * - a removed cut hands the start to the next cut and the end to the one before;
 * - new cuts right before the start or after the end join the span when `grow` is set.
 * Returns the same object when nothing changed.
 */
export function followEdit<S extends Span>(span: S, before: readonly Cut[], after: readonly Cut[], grow = false): S {
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

  let { first, last } = span;
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

  const out = tidySpan({ ...span, first, last }, after);
  return out.first === span.first && out.last === span.last ? span : out;
}

/** Whether the new cut at `i` is the lower half of a split of the cut before it, rather than inserted music. */
function isLowerHalf(after: readonly Cut[], i: number, before: readonly Cut[]): boolean {
  const c = after[i], up = after[i - 1];
  if (!up || up.page !== c.page || up.y1 !== c.y0) return false;
  const old = before.find((b) => b.id === up.id);
  return !!old && old.y1 === c.y1 && up.y1 !== old.y1;
}

/** Whether two spans play the same cuts, however their ends are stored. */
export function sameSpan(cuts: readonly { id: string }[], a: Span, b: Span): boolean {
  const x = spanOf(cuts, a), y = spanOf(cuts, b);
  return x.i0 === y.i0 && x.i1 === y.i1;
}

/** Only the span's ends, without a name or anything else an object carries. */
export const ends = ({ first, last }: Span): Span => ({ ...(first ? { first } : {}), ...(last ? { last } : {}) });

/** The name on a span, if it has one. */
export function nameOf(score: Score, span: Span): ExcerptName | undefined {
  if (spanOf(score.cuts, span).whole) return undefined;
  return score.names?.find((n) => sameSpan(score.cuts, n, span));
}

/** What an excerpt is called: its name, or else its generated name; null for the whole score. */
export function excerptName(score: Score, span: Span, aspects?: Aspects): string | null {
  return nameOf(score, span)?.name ?? spanLabel(score.cuts, span, aspects);
}

/** A score's named excerpts in order: by their first cut, then their last. */
export function sortedNames(score: Score): ExcerptName[] {
  const at = (n: ExcerptName) => spanOf(score.cuts, n);
  return [...(score.names ?? [])].sort((a, b) => at(a).i0 - at(b).i0 || at(a).i1 - at(b).i1);
}

/** Why a name can't go on a span, or null if it can. `except` is a name being changed, which doesn't count. */
export function nameProblem(score: Score, span: Span, name: string, except?: ExcerptName): string | null {
  if (!name.trim()) return 'Give it a name.';
  if (spanOf(score.cuts, span).whole) return 'The whole score is the score itself; choose part of it.';
  const there = nameOf(score, span);
  if (there && there !== except) return `That’s already “${there.name}”.`;
  const taken = score.names?.find((n) => n !== except && n.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (taken) return `This score already has an excerpt called “${taken.name}”.`;
  return null;
}

/** Name a span (or rename `was`). Check `nameProblem` first. */
export function setName(score: Score, span: Span, name: string, was?: ExcerptName): Score {
  const named: ExcerptName = { ...ends(span), name: name.trim() };
  const names = was ? (score.names ?? []).map((n) => (n === was ? named : n)) : [...(score.names ?? []), named];
  return { ...score, names };
}

/** Take a name off its span. Entries that play the span keep playing it, under its generated name. */
export function removeName(score: Score, name: ExcerptName): Score {
  return { ...score, names: (score.names ?? []).filter((n) => n !== name) };
}

/**
 * Keep a score's names on the same music after an edit to its cuts, as entries' spans are kept
 * (`followEdit`). Names on `grow`, the span being read, take in pages inserted at its edges, as
 * its entries do. Names that come to play the same cuts are joined ("Kyrie / Christe"), and a
 * name left on the whole score goes, as the whole score isn't named.
 */
export function followNames(names: readonly ExcerptName[] | undefined, before: readonly Cut[], after: readonly Cut[], grow?: Span): ExcerptName[] | undefined {
  if (!names || before === after) return names as ExcerptName[] | undefined;
  const out: ExcerptName[] = [];
  for (const n of names) {
    const f = followEdit(n, before, after, !!grow && sameSpan(before, n, grow));
    if (spanOf(after, f).whole) continue;
    const k = out.findIndex((o) => sameSpan(after, o, f));
    if (k < 0) out.push(f);
    else out[k] = { ...out[k], name: `${out[k].name} / ${f.name}` };
  }
  const same = out.length === names.length && out.every((n, i) => n === names[i]);
  return same ? (names as ExcerptName[]) : out;
}
