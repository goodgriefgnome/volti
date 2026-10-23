// What the reader reads, apart from the screen: the items read in order, whether they are a score,
// a named excerpt or a setlist, and the setlists, which edits to a score keep in step. Pure: no
// DOM, no storage; reader.ts shows and saves what changes here.

import { excerptName, followNames } from '../excerpts/names';
import { ends, followEdit, spanCuts, type Span } from '../excerpts/span';
import type { Aspects, Cut, Score, State } from '../scores/model';
import { addEntries, followScore, setEntrySpan, withSetlist, type Entry, type Setlist } from '../setlists/model';
import type { Item } from './open-scores';

/**
 * What is read: a score; a named excerpt of it, read as a setlist entry playing it would be (its
 * span follows edits, as entries' spans do); or a setlist.
 */
export type ReadingKind = { kind: 'score' } | { kind: 'excerpt'; span: Span } | { kind: 'setlist'; id: string };

/** What a Reading is at one moment, for undo. */
export interface ReadingSnapshot { what: ReadingKind; setlists: readonly Setlist[] }

export class Reading {
  constructor(readonly items: readonly Item[], public what: ReadingKind, public setlists: readonly Setlist[]) {}

  get setlistId(): string | null { return this.what.kind === 'setlist' ? this.what.id : null; }
  get setlist(): Setlist | undefined { return this.setlists.find((s) => s.id === this.setlistId); }

  /** In a setlist, the entry item k is. */
  entry(k: number): Entry | undefined {
    const id = this.items[k]?.entryId;
    return id ? this.setlist?.entries.find((e) => e.id === id) : undefined;
  }

  /** The span item k plays: its entry's, or the excerpt's; none for the whole score. */
  span(k: number): Span | undefined {
    return this.what.kind === 'excerpt' ? this.what.span : this.entry(k);
  }

  /** The cuts item k plays, of its score's `cuts`. */
  playedCuts(k: number, cuts: Cut[]): Cut[] {
    const span = this.span(k);
    return span ? spanCuts(cuts, span) : cuts;
  }

  /** What item k plays of `score`, when it is part of it ("Kyrie", "Pages 2–3"); null for the whole score. */
  excerptName(k: number, score: Score, aspects?: Aspects): string | null {
    const span = this.span(k);
    return span ? excerptName(score, span, aspects) : null;
  }

  /**
   * Take an edit to item k's score, `s` being the score after it and `before` its cuts before:
   * the score's named excerpts, the excerpt read, and every setlist's entries of the score follow
   * the edit. Pages inserted at the edges of the excerpt being read join it, wherever it is
   * played. Returns the edit with the score's names moved.
   */
  edited(k: number, scoreId: string, before: readonly Cut[], s: State): State {
    const after = s.score.cuts, grow = this.what.kind === 'score' ? undefined : this.span(k);
    const names = followNames(s.score.names, before, after, grow);
    if (names !== s.score.names) s = { ...s, score: { ...s.score, names } };
    if (this.what.kind === 'excerpt') this.what = { kind: 'excerpt', span: followEdit(this.what.span, before, after, true) };
    this.setlists = followScore(this.setlists, scoreId, before, after, grow);
    return s;
  }

  /** Item k plays `span` instead: in a setlist, its entry; otherwise the excerpt read becomes it. */
  play(k: number, span: Span) {
    const entry = this.entry(k), setlist = this.setlist;
    if (entry && setlist) this.setlists = withSetlist(this.setlists, setEntrySpan(setlist, entry.id, span));
    else this.what = { kind: 'excerpt', span: ends(span) };
  }

  /** Add what is read (a score, or the excerpt read) to the end of `setlist`, which may be new. */
  addTo(setlist: Setlist) {
    this.setlists = withSetlist(this.setlists, addEntries(setlist, [{ scoreId: this.items[0].scoreId, span: this.span(0) }]));
  }

  snapshot(): ReadingSnapshot { return { what: this.what, setlists: this.setlists }; }

  restore(r: ReadingSnapshot) {
    this.what = r.what;
    this.setlists = r.setlists;
  }
}
