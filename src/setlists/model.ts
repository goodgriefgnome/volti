// Setlists, their entries, and the excerpt of a score each entry plays: making them, reading
// spans, and keeping spans on the same music when a score's cuts change. Pure: no DOM, no storage.

import type { Cut } from '../scores/model';

/**
 * Which of a score's cuts are played: from `first` to `last`, in the score's order. A missing
 * end means the score's start or end, wherever that is now.
 */
export interface Span { first?: string; last?: string }

/**
 * One excerpt of a score, in a setlist. It plays either
 * - the whole score: no span, so `first` and `last` are both missing; or
 * - a custom excerpt: a span kept only in this setlist.
 * Named excerpts, kept on the score and shared between setlists, are not designed yet; an entry
 * that plays one will refer to it here instead of holding a span.
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

/** "Pages 1–2" for an excerpt, or null when the whole score is played. */
export function spanLabel(cuts: readonly Cut[], span: Span): string | null {
  const { i0, i1, whole } = spanOf(cuts, span);
  if (whole || !cuts.length) return null;
  const a = cuts[i0].page + 1, b = cuts[i1].page + 1;
  return a === b ? `Page ${a}` : `Pages ${a}–${b}`;
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

/** Apply an edit of a score's cuts to every entry that plays the score. Unchanged setlists stay the same objects. */
export function followScore(setlists: readonly Setlist[], scoreId: string, before: readonly Cut[], after: readonly Cut[], grow?: { setlist: string; entries: ReadonlySet<string> }): Setlist[] {
  if (before === after) return setlists as Setlist[];
  return setlists.map((s) => {
    let changed = false;
    const entries = s.entries.map((e) => {
      if (e.scoreId !== scoreId) return e;
      const f = followEdit(e, before, after, grow?.setlist === s.id && grow.entries.has(e.id));
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
