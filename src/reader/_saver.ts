// Writing the reader's changes to storage: scores and setlists, together, at most twice a second,
// and again until a write that failed succeeds.

import { scoreEntries } from '../scores/store';
import { saveChanged } from '../setlists/store';
import { type Setlist } from '../setlists/model';
import type { State } from '../scores/model';
import type { OpenScore } from './_open-scores';

/** How soon after a change it is written. */
const SAVE_MS = 500;
/** How soon a write that failed is tried again. */
export const _RETRY_MS = 5000;

/**
 * Saves within half a second of a change: the scores changed, and the setlists if they changed.
 * Scores and setlists are written together, so a score's cuts and the excerpts naming them agree.
 * A change stays to be written until a write of it succeeds: a write that fails is tried again
 * every few seconds, and `failed` hears the first failure of each run of them.
 */
export class Saver {
  /** Scores with changes not yet written. */
  private dirty = new Set<OpenScore>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** The writes, one after another. */
  private writing: Promise<void> = Promise.resolve();
  /** The last write failed, and nothing has been written since. */
  private failing = false;
  private stopped = false;

  /** `saved` is the setlists as last written. */
  constructor(private setlists: () => readonly Setlist[], private saved: readonly Setlist[], private failed: (e: unknown) => void = () => {}) {}

  soon(score?: OpenScore) {
    if (score) this.dirty.add(score);
    this.later(SAVE_MS);
  }

  /** Write what has changed now, after any write still going. Rejects when the write fails; what it held stays to be written. */
  flush(): Promise<void> {
    const run = this.writing.then(() => this.write());
    this.writing = run.catch(() => {});
    return run;
  }

  /** Write nothing more, and forget what isn't written: the reader is closing without it. */
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.dirty.clear();
  }

  private later(ms: number) {
    if (this.stopped) return;
    this.timer ??= setTimeout(() => void this.flush().catch(() => {}), ms);
  }

  private async write() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.stopped) return;
    // The state of each score as written: one changed again while it is written stays dirty.
    const states = new Map<OpenScore, State>([...this.dirty].map((d) => [d, d.state]));
    const setlists = this.setlists(), before = this.saved;
    if (!states.size && setlists === before) return;
    try {
      await saveChanged(setlists, before, [...states.values()].flatMap(scoreEntries));
    } catch (e) {
      console.error('Could not save the changes:', e);
      if (!this.failing) this.failed(e);
      this.failing = true;
      this.later(_RETRY_MS);
      throw e;
    }
    this.failing = false;
    this.saved = setlists;
    for (const [d, state] of states) if (d.state === state) this.dirty.delete(d);
  }
}
