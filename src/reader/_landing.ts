// Where the reader goes after what it reads changes: whether an edit moved the music, which
// screen then shows, where a score's last screen starts, and which entry a changed setlist reads.
// Pure: the reader's parts act on the answers.

import { framesOnScreen } from '../render/layout';
import { frameOf, type Frame } from '../scores/frames';
import type { Cut } from '../scores/model';
import type { Item } from './_open-scores';

/** Whether two played orders put the same music in the same places. */
export function sameLayout(a: readonly Cut[], b: readonly Cut[]): boolean {
  return a.length === b.length && a.every((c, i) => c.id === b[i].id && c.page === b[i].page && c.y0 === b[i].y0 && c.y1 === b[i].y1 && c.pad === b[i].pad);
}

/** What to show after an edit: only the ink again, or the screen starting at `frame`, kept where it is or placed fresh. */
export type AfterEdit = { kind: 'redraw' } | { kind: 'show'; frame: number; place: 'keep' | 'fresh' };

/**
 * After an edit: `before` is every cut of the item's frames before it, `frames` the item's frames
 * after it, `frame` and `shown` the screen's first frame and how many it shows, and `focus` the cut
 * the edit was made at.
 */
export function afterEdit(before: readonly Cut[], frames: readonly Frame[], frame: number, shown: number, focus?: string): AfterEdit {
  const moved = !sameLayout(frames.flatMap((f) => f.items.map((p) => p.cut)), before);
  const f = focus ? frameOf(frames, focus) : -1;
  // A cut on this screen stays put; one elsewhere opens the screen starting at its frame.
  const target = f >= 0 && (f < frame || f >= frame + shown) ? f : frame;
  if (!moved && target === frame) return { kind: 'redraw' };
  return { kind: 'show', frame: Math.min(target, Math.max(0, frames.length - 1)), place: target === frame ? 'keep' : 'fresh' };
}

/** Where a score's last screen starts: at its last two frames when the one before last shows two on a W × H stage. */
export function lastScreenStart(frames: readonly Frame[], W: number, H: number): number {
  const n = frames.length;
  return n >= 2 && framesOnScreen(frames[n - 2].aspect, W, H) === 2 ? n - 2 : n - 1;
}

/**
 * A setlist relisted: the item to read. `entryId` is the entry to read, `was` the entry read
 * before, `at` the place to fall back to. `same`: it is still the entry read, only elsewhere.
 */
export function relistTarget(items: readonly Item[], entryId: string | undefined, was: string | undefined, at: number): { k: number; same: boolean } {
  const k = entryId ? items.findIndex((it) => it.entryId === entryId) : -1;
  if (k >= 0 && entryId === was) return { k, same: true };
  return { k: k >= 0 ? k : Math.min(at, items.length - 1), same: false };
}
