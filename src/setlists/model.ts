// Setlists and their entries, each playing an excerpt of a score (scores/excerpts.ts): making and
// changing them, and keeping every entry on the same music when a score's cuts change. Pure: no
// DOM, no storage.

import { type Excerpt, ends, followEdit, sameExcerpt, setName, excerptRange } from '../scores/excerpts';
import type { Cut, NamedExcerpt, Score } from '../scores/model';

/**
 * One excerpt of a score, in a setlist. It plays either
 * - the whole score: no excerpt, so `first` and `last` are both missing; or
 * - part of it: an excerpt. A named excerpt is a name on an excerpt (scores/excerpts.ts), so an entry
 *   whose excerpt has a name plays that named excerpt.
 */
export interface Entry extends Excerpt {
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

export const _newId = () => crypto.randomUUID();

export const newEntry = (scoreId: string): Entry => ({ id: _newId(), scoreId });

export const newSetlist = (title: string): Setlist => ({ id: _newId(), title, archived: false, entries: [] });

/** The setlists with `s` in place of the one with its id, or, when it is new, `s` first. */
export function withSetlist(all: readonly Setlist[], s: Setlist): Setlist[] {
  return all.some((x) => x.id === s.id) ? all.map((x) => (x.id === s.id ? s : x)) : [s, ...all];
}

/** The setlist with entries playing these excerpts of the score added at its end, each its own entry. */
export const addEntries = (s: Setlist, add: readonly { scoreId: string; excerpt?: Excerpt }[]): Setlist =>
  ({ ...s, entries: [...s.entries, ...add.map(({ scoreId, excerpt }) => ({ ...newEntry(scoreId), ...ends(excerpt ?? {}) }))] });

/** An entry that plays `excerpt` of its score instead. */
const playing = (e: Entry, excerpt: Excerpt): Entry => ({ id: e.id, scoreId: e.scoreId, ...ends(excerpt) });

/** The setlist with entry `entryId` playing `excerpt` of its score instead. */
export const setEntryExcerpt = (s: Setlist, entryId: string, excerpt: Excerpt): Setlist =>
  ({ ...s, entries: s.entries.map((e) => (e.id === entryId ? playing(e, excerpt) : e)) });

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
 * the excerpt being read, take in pages inserted at its edges, so they all stay the same excerpt. Unchanged setlists stay the same objects.
 */
export function followScore(setlists: readonly Setlist[], scoreId: string, before: readonly Cut[], after: readonly Cut[], grow?: Excerpt): Setlist[] {
  if (before === after) return setlists as Setlist[];
  const g = grow && excerptRange(before, grow);
  return setlists.map((s) => {
    let changed = false;
    const entries = s.entries.map((e) => {
      if (e.scoreId !== scoreId) return e;
      const at = g && excerptRange(before, e);
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
  return { id: _newId(), title: `${s.title} (copy)`, archived: false, entries: s.entries.map((e) => ({ ...e, id: _newId() })) };
}

/**
 * Give a named excerpt other cuts: the name moves to `to`, and so does every entry, in every
 * setlist, that played the old excerpt. Check `nameProblem` first.
 */
export function moveExcerpt(score: Score, setlists: readonly Setlist[], name: NamedExcerpt, to: Excerpt): { score: Score; setlists: Setlist[] } {
  const cuts = score.cuts;
  const out = setlists.map((s) => {
    let changed = false;
    const entries = s.entries.map((e) => {
      if (e.scoreId !== score.id || !sameExcerpt(cuts, e, name)) return e;
      changed = true;
      return playing(e, to);
    });
    return changed ? { ...s, entries } : s;
  });
  return { score: setName(score, to, name.name, name), setlists: out };
}
