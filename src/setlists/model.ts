// Setlists and their entries, each playing a span of a score (excerpts/span.ts): making and
// changing them, and keeping every entry on the same music when a score's cuts change. Pure: no
// DOM, no storage.

import { setName } from '../excerpts/names';
import { ends, followEdit, sameSpan, spanOf, type Span } from '../excerpts/span';
import type { Cut, ExcerptName, Score } from '../scores/model';

/**
 * One excerpt of a score, in a setlist. It plays either
 * - the whole score: no span, so `first` and `last` are both missing; or
 * - part of it: a span. A named excerpt is a name on a span (excerpts/names.ts), so an entry
 *   whose span has a name plays that named excerpt.
 */
export interface Entry extends Span {
  id: string;
  scoreId: string;
}

/** A list of excerpts, read as one continuous score. */
export interface Setlist {
  id: string;
  title: string;
  archived: boolean;
  entries: Entry[];
}

export const newId = () => crypto.randomUUID();

export const newEntry = (scoreId: string): Entry => ({ id: newId(), scoreId });

export const newSetlist = (title: string): Setlist => ({ id: newId(), title, archived: false, entries: [] });

/**
 * The setlist scores are added to by default: the one a score was last added to (`last`), or,
 * when there is none or it is archived or deleted, the first setlist not archived.
 */
export function defaultSetlist(setlists: readonly Setlist[], last: string | undefined): Setlist | undefined {
  const active = setlists.filter((s) => !s.archived);
  return active.find((s) => s.id === last) ?? active[0];
}

/**
 * Apply an edit of a score's cuts to every entry that plays the score. Entries that play `grow`,
 * the span being read, take in pages inserted at its edges: an excerpt is its span, so they all
 * stay the same excerpt. Unchanged setlists stay the same objects.
 */
export function followScore(setlists: readonly Setlist[], scoreId: string, before: readonly Cut[], after: readonly Cut[], grow?: Span): Setlist[] {
  if (before === after) return setlists as Setlist[];
  const g = grow && spanOf(before, grow);
  return setlists.map((s) => {
    let changed = false;
    const entries = s.entries.map((e) => {
      if (e.scoreId !== scoreId) return e;
      const at = g && spanOf(before, e);
      const f = followEdit(e, before, after, !!at && at.i0 === g.i0 && at.i1 === g.i1);
      if (f !== e) changed = true;
      return f;
    });
    return changed ? { ...s, entries } : s;
  });
}

export const setlistsWith = (setlists: readonly Setlist[], scoreId: string) => setlists.filter((s) => s.entries.some((e) => e.scoreId === scoreId));

/** Move entry `from` to position `to`. */
export function moveEntry(s: Setlist, from: number, to: number): Setlist {
  const entries = [...s.entries];
  const [e] = entries.splice(from, 1);
  entries.splice(to, 0, e);
  return { ...s, entries };
}

/** A copy with new entry ids, keeping each entry's excerpt. */
export function duplicate(s: Setlist): Setlist {
  return { id: newId(), title: `${s.title} (copy)`, archived: false, entries: s.entries.map((e) => ({ ...e, id: newId() })) };
}

/**
 * Give a named excerpt other cuts: the name moves to `to`, and so does every entry, in every
 * setlist, that played the old span, as the excerpt is its span. Check `nameProblem` first.
 */
export function moveExcerpt(score: Score, setlists: readonly Setlist[], name: ExcerptName, to: Span): { score: Score; setlists: Setlist[] } {
  const cuts = score.cuts;
  const out = setlists.map((s) => {
    let changed = false;
    const entries = s.entries.map((e) => {
      if (e.scoreId !== score.id || !sameSpan(cuts, e, name)) return e;
      changed = true;
      return { id: e.id, scoreId: e.scoreId, ...ends(to) };
    });
    return changed ? { ...s, entries } : s;
  });
  return { score: setName(score, to, name.name, name), setlists: out };
}
