// Where turning the page goes: to another screen of what is read, to the next or previous entry of
// a setlist, to the library's next or previous score from a score's own reader (offered first, and
// opened by turning that way again), or nowhere. Pure: reader.ts does the turning.

import type { ReadingKind } from './_reading';

/** Where the reader is: the item read, its first frame on the screen, and how many frames there are. */
export interface Place {
  /** The item read, and how many there are (a setlist's entries; one otherwise). */
  k: number;
  items: number;
  /** The first frame on the screen, how many the screen shows, and how many the item has. */
  frame: number;
  shown: number;
  frames: number;
}

export type Turn =
  /** Another screen of the item read, starting at `frame`. */
  | { to: 'frame'; frame: number }
  /** In a setlist, entry `k`: from its first screen going forward, its last going back. */
  | { to: 'item'; k: number; at: 'first' | 'last' }
  /** In a score's own reader, past its end or start: the library's next or previous score. */
  | { to: 'score'; dir: 1 | -1 }
  /** Nowhere: the end or start of a named excerpt, or of a setlist. */
  | { to: 'none' };

/** Where turning forward (1) or back (-1) from `p` goes, reading a `kind`. */
export function turnFrom(p: Place, dir: 1 | -1, kind: ReadingKind['kind']): Turn {
  // Forward by the frames shown; back by as many (to the first frame, near the start).
  const next = dir > 0 ? p.frame + p.shown : p.frame > 0 ? Math.max(0, p.frame - p.shown) : -1;
  if (next >= 0 && next < p.frames) return { to: 'frame', frame: next };
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
