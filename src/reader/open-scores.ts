// Opening and closing the scores being read: each score's saved state and its original, opened when
// first needed and closed when far from the score being read.

import type { PageCache } from '../originals/pdf';
import type { Original } from '../originals/originals';
import type { Aspects, State } from '../scores/model';
import { loadScore } from '../scores/store';
import { openOriginal, PasswordNotGiven } from '../ui/passwords';

/** A score open in the reader. Every entry of a setlist that plays the score shares it. */
export interface OpenScore {
  id: string;
  original: Original;
  aspects: Aspects;
  state: State;
  /** Closed while the score is far from the one being read, and opened again when needed. */
  cache?: PageCache;
}

/** A score in the order read: the score itself, or one entry of a setlist. */
export interface Item {
  scoreId: string;
  title: string;
  /** Not in the library, or its file can't be read. */
  original?: Original;
  entryId?: string;
  missing?: boolean;
}

/** The scores being read, each opened when first needed, with its original open only near the one being read. */
export class OpenScores {
  private scores = new Map<string, OpenScore>();
  private opening = new Map<string, Promise<OpenScore | null>>();
  /** The reader has closed: an original that finishes opening now is closed again. */
  closed = false;

  constructor(private items: readonly Item[], first: OpenScore | null) {
    if (first) this.scores.set(first.id, first);
  }

  get(scoreId: string): OpenScore | undefined { return this.scores.get(scoreId); }

  /**
   * Open item k's score, or find that it can't be. Only with `ask` (the score is being turned to,
   * not opened ahead of time) is a PDF's password asked for; one that can't be opened without it
   * then waits for that.
   */
  ensure(k: number, ask = false): Promise<OpenScore | null> {
    const it = this.items[k];
    if (!it || it.missing || !it.original) return Promise.resolve(null);
    const have = this.scores.get(it.scoreId);
    if (have?.cache) return Promise.resolve(have);
    let p = this.opening.get(it.scoreId);
    if (!p) {
      p = this.open(it, it.original, ask).catch((e) => {
        if (e instanceof PasswordNotGiven && !ask) return null;
        console.error(e);
        for (const x of this.items) if (x.scoreId === it.scoreId) x.missing = true;
        return null;
      }).finally(() => this.opening.delete(it.scoreId));
      this.opening.set(it.scoreId, p);
    }
    // Opened ahead of time without asking for a password: ask now.
    return ask ? p.then((s) => s ?? (it.missing ? null : this.ensure(k, true))) : p;
  }

  private async open(it: Item, original: Original, ask: boolean): Promise<OpenScore> {
    const cache = await openOriginal(original, ask);
    if (this.closed) { cache.destroy(); throw new Error('Closed'); }
    const have = this.scores.get(it.scoreId);
    if (have) { have.cache = cache; return have; }
    const aspects = await cache.allAspects();
    const { state } = await loadScore(it.scoreId, it.title, aspects);
    const s: OpenScore = { id: it.scoreId, original, aspects, state, cache };
    this.scores.set(s.id, s);
    return s;
  }

  /** Open the score after item k ahead of time, and close the originals of scores further away. */
  keepNear(k: number) {
    const near = new Set([k - 1, k, k + 1].map((i) => this.items[i]?.scoreId));
    for (const s of this.scores.values()) {
      if (near.has(s.id) || !s.cache) continue;
      s.cache.destroy();
      s.cache = undefined;
    }
    if (k + 1 < this.items.length) void this.ensure(k + 1);
  }

  destroy() {
    for (const s of this.scores.values()) s.cache?.destroy();
  }
}
