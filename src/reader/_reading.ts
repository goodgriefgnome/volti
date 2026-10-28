// What the reader reads, apart from the screen: the items read in order, whether they are a score,
// a named excerpt or a setlist, and the setlists, which edits to a score keep in step. Pure: no
// DOM, no storage; reader.ts shows and saves what changes here.

import { type Excerpt, ends, excerptName, followEdit, followExcerpts, excerptCuts } from '../scores/excerpts';
import { titleOf } from '../originals/path-utils';
import { type SourceFile } from '../originals/types';
import type { Aspects, Cut, Score, State } from '../scores/model';
import { addEntries, followScore, setEntryExcerpt, withSetlist, type Entry, type Setlist } from '../setlists/model';
import type { Item } from './_open-scores';

/**
 * What is read: a score; a named excerpt of it, read as a setlist entry playing it would be (its
 * excerpt follows edits, as entries' excerpts do); or a setlist.
 */
export type ReadingKind = { kind: 'score' } | { kind: 'excerpt'; excerpt: Excerpt } | { kind: 'setlist'; id: string };

/**
 * A setlist's items, one for each entry: its score's original (from `originals`, by id), or, for a
 * score missing from the library, its title as last seen.
 */
export function setlistItems(s: Setlist, originals: ReadonlyMap<string, SourceFile>, titles: Readonly<Record<string, string>>): Item[] {
  return s.entries.map((e) => {
    const original = originals.get(e.scoreId);
    return { scoreId: e.scoreId, entryId: e.id, original, title: (original && titleOf(original.path)) ?? titles[e.scoreId] ?? 'Missing score', fileGone: !original };
  });
}

/** What a Reading is at one moment, for undo. */
export interface ReadingSnapshot { what: ReadingKind; setlists: readonly Setlist[] }

export class Reading {
  constructor(readonly items: Item[], public what: ReadingKind, public setlists: readonly Setlist[]) {}

  get setlistId(): string | null { return this.what.kind === 'setlist' ? this.what.id : null; }
  get setlist(): Setlist | undefined { return this.setlists.find((s) => s.id === this.setlistId); }

  /** In a setlist, the entry item k is. */
  entry(k: number): Entry | undefined {
    const id = this.items[k]?.entryId;
    return id ? this.setlist?.entries.find((e) => e.id === id) : undefined;
  }

  /** The excerpt item k plays: its entry's, or the excerpt's; none for the whole score. */
  excerpt(k: number): Excerpt | undefined {
    return this.what.kind === 'excerpt' ? this.what.excerpt : this.entry(k);
  }

  /** The cuts item k plays, of its score's `cuts`. */
  playedCuts(k: number, cuts: Cut[]): Cut[] {
    const excerpt = this.excerpt(k);
    return excerpt ? excerptCuts(cuts, excerpt) : cuts;
  }

  /** What item k plays of `score`, when it is part of it ("Kyrie", "Pages 2–3"); null for the whole score. */
  excerptName(k: number, score: Score, aspects?: Aspects): string | null {
    const excerpt = this.excerpt(k);
    return excerpt ? excerptName(score, excerpt, aspects) : null;
  }

  /**
   * Take an edit to item k's score, `s` being the score after it and `before` its cuts before:
   * the score's named excerpts, the excerpt read, and every setlist's entries of the score follow
   * the edit. Pages inserted at the edges of the excerpt being read join it, wherever it is
   * played. Returns the edit with the score's named excerpts moved.
   */
  edited(k: number, scoreId: string, before: readonly Cut[], s: State): State {
    const after = s.score.cuts, grow = this.what.kind === 'score' ? undefined : this.excerpt(k);
    const excerpts = followExcerpts(s.score.excerpts, before, after, grow);
    if (excerpts !== s.score.excerpts) s = { ...s, score: { ...s.score, excerpts } };
    if (this.what.kind === 'excerpt') this.what = { kind: 'excerpt', excerpt: followEdit(this.what.excerpt, before, after, true) };
    this.setlists = followScore(this.setlists, scoreId, before, after, grow);
    return s;
  }

  /** Item k plays `excerpt` instead: in a setlist, its entry; otherwise the excerpt read becomes it. */
  play(k: number, excerpt: Excerpt) {
    const entry = this.entry(k), setlist = this.setlist;
    if (entry && setlist) this.setlists = withSetlist(this.setlists, setEntryExcerpt(setlist, entry.id, excerpt));
    else this.what = { kind: 'excerpt', excerpt: ends(excerpt) };
  }

  /** Add what is read (a score, or the excerpt read) to the end of `setlist`, which may be new. */
  addTo(setlist: Setlist) {
    this.setlists = withSetlist(this.setlists, addEntries(setlist, [{ scoreId: this.items[0].scoreId, excerpt: this.excerpt(0) }]));
  }

  /**
   * In a setlist, its entries changed (added, moved or removed): its items again, in place, as
   * `setlistItems` makes them. A score found missing while reading stays missing.
   */
  relist(items: Item[]) {
    const missing = new Set(this.items.filter((it) => it.missing).map((it) => it.scoreId));
    for (const it of items) if (missing.has(it.scoreId)) it.missing = true;
    this.items.splice(0, this.items.length, ...items);
  }

  /** A score's file was renamed: its items take the new name. */
  renamed(o: SourceFile) {
    for (const it of this.items) if (it.scoreId === o.id) { it.title = titleOf(o.path); it.original = o; }
  }

  /** In a score's own reader: read another score instead. */
  turnTo(it: Item) {
    if (this.what.kind === 'score') this.items[0] = it;
  }

  snapshot(): ReadingSnapshot { return { what: this.what, setlists: this.setlists }; }

  restore(r: ReadingSnapshot) {
    this.what = r.what;
    this.setlists = r.setlists;
  }
}
