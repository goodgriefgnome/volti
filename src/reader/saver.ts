// Writing the reader's changes to storage: scores and setlists, together, at most twice a second.

import { scoreEntries } from '../scores/store';
import type { Setlist } from '../setlists/model';
import { saveChanged } from '../setlists/store';
import type { OpenScore } from './open-scores';

/**
 * Saves within half a second of a change: the scores changed, and the setlists if they changed.
 * Scores and setlists are written together, so a score's cuts and the excerpts naming them agree.
 */
export class Saver {
  /** Scores with changes not yet written. */
  private dirty = new Set<OpenScore>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  /** `saved` is the setlists as last written. */
  constructor(private setlists: () => readonly Setlist[], private saved: readonly Setlist[]) {}

  soon(score?: OpenScore) {
    if (score) this.dirty.add(score);
    this.timer ??= setTimeout(() => void this.flush(), 500);
  }

  async flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    const scores = [...this.dirty].flatMap((d) => scoreEntries(d.state));
    this.dirty.clear();
    const setlists = this.setlists(), before = this.saved;
    if (!scores.length && setlists === before) return;
    this.saved = setlists;
    await saveChanged(setlists, before, scores);
  }
}
