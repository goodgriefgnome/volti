// Opening and closing the scores being read: each score's saved state and a way to draw its pages,
// opened when first needed and dropped when far from the score being read.

import { askPassword } from '../dialogs/passwords';
import { savedPages } from '../originals/original';
import { NoAccess, PasswordNotGiven, type DrawOptions, type SourceFile } from '../originals/types';
import type { Drawn } from '../page-cache/types';
import { loadScore } from '../scores/store';
import { type Aspects, type State } from '../scores/model';

/** Draw a page of the score (from 1), `pxWidth` device pixels wide. */
export type DrawPage = (page: number, pxWidth: number, options?: DrawOptions) => Promise<Drawn>;

/** The score's file isn't in the library, and none of its pages is saved. */
export class FileGone extends Error {
  name = 'FileGone';
}

/**
 * A score's pages, to read: drawn from its file where it can be read; where it can't (no file in
 * the library, no access to the scores folder yet, or no password given) but its pages are saved
 * and their shapes known, drawn by id, which can show only the pages saved. Only with `ask` is its
 * password asked for.
 */
export async function openPages(id: string, o: SourceFile | undefined, ask: boolean): Promise<{ draw: DrawPage; aspects: Aspects; readable: boolean }> {
  let failure: unknown = o ? undefined : new FileGone(`The file of ${id} is gone`);
  if (o) {
    try {
      const original = await o.read(ask ? askPassword : undefined);
      return { draw: (page, pxWidth, options) => original.draw(page, pxWidth, options), aspects: await original.aspects(), readable: original.whole };
    } catch (e) {
      if (!(e instanceof NoAccess || e instanceof PasswordNotGiven)) throw e;
      failure = e;
    }
  }
  const pages = await savedPages(id);
  if (!pages) throw failure;
  return { draw: (page, pxWidth, options) => pages.draw(page, pxWidth, options), aspects: await pages.aspects(), readable: pages.whole };
}

/** A score open in the reader. Every entry of a setlist that plays the score shares it. */
export interface OpenScore {
  id: string;
  /** Missing when the file is gone from the library. */
  original?: SourceFile;
  aspects: Aspects;
  state: State;
  /** Dropped while the score is far from the one being read, and opened again when needed. */
  draw?: DrawPage;
  /** Its file can be read; false when its pages are drawn by id, so only those saved can be shown. */
  readable?: boolean;
}

/** A score in the order read: the score itself, or one entry of a setlist. */
export interface Item {
  scoreId: string;
  title: string;
  /** Missing when the score isn't in the library. */
  original?: SourceFile;
  entryId?: string;
  /** Can't be opened: no file, or none that can be read. */
  missing?: boolean;
  /** No file in the library, so its saved pages are all it can show. */
  fileGone?: boolean;
  /** Its file is in the scores folder, which Volti may not read until access is allowed again. */
  needsAccess?: boolean;
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

  /** Take a score opened elsewhere, as when the reader turns to another score. */
  adopt(s: OpenScore) { this.scores.set(s.id, s); }

  /**
   * Open item k's score, or find that it can't be. Only with `ask` (the score is being turned to,
   * not opened ahead of time) is a PDF's password asked for; one that can't be opened without it
   * then waits for that.
   */
  ensure(k: number, ask = false): Promise<OpenScore | null> {
    const it = this.items[k];
    if (!it || it.missing || it.needsAccess) return Promise.resolve(null);
    const have = this.scores.get(it.scoreId);
    if (have?.draw) return Promise.resolve(have);
    let p = this.opening.get(it.scoreId);
    if (!p) {
      p = this.open(it, it.original, ask).catch((e) => {
        if (e instanceof PasswordNotGiven && !ask) return null;
        // Not lost, only not readable until access to the scores folder is allowed again.
        const locked = e instanceof NoAccess;
        if (!locked && !(e instanceof FileGone)) console.error(e);
        for (const x of this.items) if (x.scoreId === it.scoreId) x[locked ? 'needsAccess' : 'missing'] = true;
        return null;
      }).finally(() => this.opening.delete(it.scoreId));
      this.opening.set(it.scoreId, p);
    }
    // Opened ahead of time without asking for a password: ask now.
    return ask ? p.then((s) => s ?? (it.missing ? null : this.ensure(k, true))) : p;
  }

  private async open(it: Item, original: SourceFile | undefined, ask: boolean): Promise<OpenScore> {
    const { draw, aspects, readable } = await openPages(it.scoreId, original, ask);
    if (this.closed) throw new Error('Closed');
    const have = this.scores.get(it.scoreId);
    if (have) { have.draw = draw; have.readable = readable; return have; }
    const { state } = await loadScore(it.scoreId, aspects);
    const s: OpenScore = { id: it.scoreId, original, aspects, state, draw, readable };
    this.scores.set(s.id, s);
    return s;
  }

  /** Access to the scores folder was allowed: open the scores again, now from their PDFs too. */
  accessAllowed() {
    for (const it of this.items) it.needsAccess = false;
    for (const s of this.scores.values()) s.draw = undefined;
  }

  /** Open the score after item k ahead of time, and close the originals of scores further away. */
  keepNear(k: number) {
    const near = new Set([k - 1, k, k + 1].map((i) => this.items[i]?.scoreId));
    for (const s of this.scores.values()) {
      if (!near.has(s.id)) s.draw = undefined;
    }
    if (k + 1 < this.items.length) void this.ensure(k + 1);
  }

  destroy() {
    for (const s of this.scores.values()) s.draw = undefined;
  }
}
