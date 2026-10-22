import type { Aspects, State } from '../pieces/model';
import { loadPiece } from '../pieces/store';
import { openPdf, type PageCache } from '../sources/pdf';
import type { Score } from '../sources/scores';

/** A piece open in the reader. Every entry of a setlist that plays the piece shares it. */
export interface Doc {
  id: string;
  score: Score;
  aspects: Aspects;
  state: State;
  /** Closed while the piece is far from the one being read, and opened again when needed. */
  cache?: PageCache;
}

/** A piece in the order read: the piece itself, or one entry of a setlist. */
export interface Item {
  pieceId: string;
  title: string;
  /** Not in the library, or its file can't be read. */
  score?: Score;
  entryId?: string;
  missing?: boolean;
}

/** The pieces being read, each opened when first needed, with its PDF open only near the one being read. */
export class Docs {
  private docs = new Map<string, Doc>();
  private opening = new Map<string, Promise<Doc | null>>();
  /** The reader has closed: a PDF that finishes opening now is closed again. */
  closed = false;

  constructor(private items: readonly Item[], first: Doc | null) {
    if (first) this.docs.set(first.id, first);
  }

  get(pieceId: string): Doc | undefined { return this.docs.get(pieceId); }

  /** Open item k's piece, or find that it can't be. */
  ensure(k: number): Promise<Doc | null> {
    const it = this.items[k];
    if (!it || it.missing || !it.score) return Promise.resolve(null);
    const have = this.docs.get(it.pieceId);
    if (have?.cache) return Promise.resolve(have);
    let p = this.opening.get(it.pieceId);
    if (!p) {
      p = this.open(it, it.score).catch((e) => {
        console.error(e);
        for (const x of this.items) if (x.pieceId === it.pieceId) x.missing = true;
        return null;
      }).finally(() => this.opening.delete(it.pieceId));
      this.opening.set(it.pieceId, p);
    }
    return p;
  }

  private async open(it: Item, score: Score): Promise<Doc> {
    const cache = await openPdf(await score.getFile());
    if (this.closed) { cache.destroy(); throw new Error('Closed'); }
    const have = this.docs.get(it.pieceId);
    if (have) { have.cache = cache; return have; }
    const aspects = await cache.allAspects();
    const { state } = await loadPiece(it.pieceId, it.title, aspects);
    const doc: Doc = { id: it.pieceId, score, aspects, state, cache };
    this.docs.set(doc.id, doc);
    return doc;
  }

  /** Open the piece after item k ahead of time, and close the PDFs of pieces further away. */
  keepNear(k: number) {
    const near = new Set([k - 1, k, k + 1].map((i) => this.items[i]?.pieceId));
    for (const d of this.docs.values()) {
      if (near.has(d.id) || !d.cache) continue;
      d.cache.destroy();
      d.cache = undefined;
    }
    if (k + 1 < this.items.length) void this.ensure(k + 1);
  }

  destroy() {
    for (const d of this.docs.values()) d.cache?.destroy();
  }
}
