// The bookkeeping of one scan of the linked folder, with no files and no storage: where each id is
// as the scan goes, and the rules for which of an id's copies is its place. The linked folder root
// (handles/_roots.ts) feeds it the files it sees, and says what it gives back.

import { _sameStamp } from './_record-model';
import type { Found, Known, Stamp, Update } from './_types';

/** A file a scan has an id for: its path, id and stamp. */
export interface _Seen { path: string; id: string; stamp?: Stamp }

/**
 * Where one id is in the folder, from where it was (`before`: known) and the copies of it seen (in
 * the order they were seen): it stays at its path while a copy is there (taking that copy's
 * stamp); otherwise the copy whose path sorts first (plain string comparison) takes over; an id
 * that was nowhere goes to its first copy seen. Undefined when no copy has been seen.
 */
export function _placeOf(before: Found | undefined, copies: readonly _Seen[]): Found | undefined {
  if (!copies.length) return undefined;
  const chosen = copies.find((c) => c.path === before?.path)
    ?? (before ? copies.reduce((a, b) => (b.path < a.path ? b : a)) : copies[0]);
  return { path: chosen.path, stamp: chosen.stamp };
}

/** One scan's bookkeeping: what has been seen, and what each id was last said to be. */
export class _FolderScan {
  /** Where each id was before this scan (known), or at the first copy seen of a new id: what stickiness goes by. */
  private origin: Map<string, Found>;
  /** What each id was last said to be. */
  private said: Map<string, Found>;
  private seen = new Map<string, _Seen>();
  private copies = new Map<string, Map<string, _Seen>>();
  private finished = false;

  constructor(known: Known) {
    this.origin = new Map(known);
    this.said = new Map(known);
  }

  /** A file seen with its id (trusted, or hashed); the files at known paths are seen before the others. Replaces what was seen at its path. Gives the change to say for its id, and for an id that was at that path before, if any. */
  see(file: _Seen): Update[] {
    const before = this.seen.get(file.path);
    this.seen.set(file.path, file);
    const affected = [file.id];
    if (before && before.id !== file.id) {
      this.copies.get(before.id)?.delete(file.path);
      affected.push(before.id);
    }
    let own = this.copies.get(file.id);
    if (!own) this.copies.set(file.id, (own = new Map()));
    own.set(file.path, file);

    const changes: Update[] = [];
    for (const id of affected) {
      const place = _placeOf(this.origin.get(id), [...(this.copies.get(id)?.values() ?? [])]);
      const said = this.said.get(id);
      if (place) {
        if (!this.origin.has(id)) this.origin.set(id, place);
        if (!said || said.path !== place.path || !_sameStamp(said.stamp, place.stamp)) {
          this.said.set(id, place);
          changes.push({ id, found: place });
        }
      } else if (this.finished && said) {
        // Pass 2: an id left with no copy at all.
        this.said.delete(id);
        changes.push({ id });
      }
    }
    return changes;
  }

  /** Every file is hashed: the ids whose known path wasn't seen and which have no copy, said gone. */
  finish(): Update[] {
    this.finished = true;
    const gone: Update[] = [];
    for (const id of [...this.said.keys()]) {
      if (this.copies.get(id)?.size) continue;
      this.said.delete(id);
      gone.push({ id });
    }
    return gone;
  }

  /** The copies seen that aren't their id's place: kept by the root for its next scan. */
  hidden(): Map<string, { id: string; stamp?: Stamp }> {
    const out = new Map<string, { id: string; stamp?: Stamp }>();
    for (const [path, f] of this.seen) if (this.said.get(f.id)?.path !== path) out.set(path, { id: f.id, stamp: f.stamp });
    return out;
  }
}
