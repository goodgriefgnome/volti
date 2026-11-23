// Where turning the page goes: to another screen of what is read (the next in its list, or the one before), to the next or previous entry of
// a setlist, to the library's next or previous score from a score's own reader (offered first, and
// opened by turning that way again), or nowhere. Pure: reader.ts does the turning.

import type { ReadingKind } from './_reading';

/** Where the reader is: the item read, and its screen in the item's list of screens. */
export interface Place {
  /** The item read, and how many there are (a setlist's entries; one otherwise). */
  k: number;
  items: number;
  /** The screen's index in the item's list of screens (render/strip.ts), and the list's length. */
  screen: number;
  screens: number;
}

export type Turn =
  /** Another screen of the item read: the one at this index in its list. */
  | { to: 'screen'; screen: number }
  /** In a setlist, entry `k`: from its first screen going forward, its last going back. */
  | { to: 'item'; k: number; at: 'first' | 'last' }
  /** In a score's own reader, past its end or start: the library's next or previous score. */
  | { to: 'score'; dir: 1 | -1 }
  /** Nowhere: the end or start of a named excerpt, or of a setlist. */
  | { to: 'none' };

/** Where turning forward (1) or back (-1) from `p` goes, reading a `kind`. */
export function turnFrom(p: Place, dir: 1 | -1, kind: ReadingKind['kind']): Turn {
  const next = p.screen + dir;
  if (next >= 0 && next < p.screens) return { to: 'screen', screen: next };
  if (kind === 'score') return { to: 'score', dir };
  const k = p.k + dir;
  return k < 0 || k >= p.items ? { to: 'none' } : { to: 'item', k, at: dir > 0 ? 'first' : 'last' };
}

/** A score offered by turning past the end of another: turning the same way again before `until` opens it. */
export interface Offer { dir: 1 | -1; id: string; until: number }

/**
 * Turning past a score's end towards score `id` (none when there is no score that way), at time
 * `now`: open it, when it was offered and still is; offer it otherwise.
 */
export function offerScore(offered: Offer | null, dir: 1 | -1, id: string | undefined, now: number, forMs: number): { open: boolean; offered: Offer | null } {
  if (id === undefined) return { open: false, offered: null };
  if (offered?.dir === dir && offered.id === id && now < offered.until) return { open: true, offered: null };
  return { open: false, offered: { dir, id, until: now + forMs } };
}
