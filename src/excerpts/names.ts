// Named excerpts: names on spans of a score's cuts, kept on the score. An excerpt is its span and
// nothing more, so a name is a label on a span: every entry that plays the span plays the named
// excerpt. Naming, renaming and finding names, and keeping them on the same music when the cuts
// are edited. Moving a named excerpt, with the setlist entries that play it, is setlists/model.ts.
// Pure: no DOM, no storage.

import type { Aspects, Cut, ExcerptName, Score } from '../scores';
import { followEdit, sameSpan, spanLabel, spanOf, type Span } from './span';

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

/** Only the span's ends, without a name or anything else an object carries. */
export const ends = ({ first, last }: Span): Span => ({ ...(first ? { first } : {}), ...(last ? { last } : {}) });

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
