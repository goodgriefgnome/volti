import { pieceEntries } from '../pieces/store';
import type { Setlist } from '../setlists/model';
import { changedEntries } from '../setlists/store';
import { kv } from '../storage/kv';
import type { Doc } from './docs';

/**
 * Saves within half a second of a change: the pieces changed, and the setlists if they changed.
 * Pieces and setlists are written together, so a piece's cuts and the excerpts naming them agree.
 */
export class Saver {
  /** Pieces with changes not yet written. */
  private dirty = new Set<Doc>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  /** `saved` is the setlists as last written. */
  constructor(private setlists: () => readonly Setlist[], private saved: readonly Setlist[]) {}

  soon(doc?: Doc) {
    if (doc) this.dirty.add(doc);
    this.timer ??= setTimeout(() => void this.flush(), 500);
  }

  async flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    const entries = [...this.dirty].flatMap((d) => pieceEntries(d.state));
    this.dirty.clear();
    const setlists = this.setlists();
    if (setlists !== this.saved) {
      entries.push(...changedEntries(setlists, this.saved));
      this.saved = setlists;
    }
    if (entries.length) await kv.setMany(entries);
  }
}
