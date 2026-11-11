// What the cut editor needs from the reader (EditorHost), and small helpers the cut editor's files
// share.

import type { Hatches } from '../../render/paint';
import { passesOf } from '../../scores/edits';
import { passOf, type Cut, type Score, type State } from '../../scores/model';
import type { Frame } from '../../scores/frames';
import type { ReaderView } from '../_view';

/** What the cut editor needs from the reader. Menus are kept inside the stage. */
export interface EditorHost extends ReaderView {
  /** Take the result of an edit: undo, save, reflow, and show the frame holding `focus`. */
  commit(s: State, focus?: string): void;
  /** Show a drag in progress with the layout frozen, or (null) go back to the real layout. */
  preview(s: State | null, frames: Frame[] | null, hatches?: Hatches): void;
  /** A page thumbnail `width` CSS pixels wide: stand-ins first, then the page itself. */
  thumbs(page: number, width: number): AsyncIterable<HTMLCanvasElement>;
  /** Forget the tap or swipe that started with this pointer. */
  cancelGesture(): void;
  say(text: string): void;
  /** Something the toolbar shows may have changed. */
  changed(): void;
}

export type Edge = 'top' | 'bottom';

/** Whether the cuts of a cut's page have more than one pass among them, so its pass is worth saying. */
export const passShown = (c: Cut, score: Score) => passesOf(score, [c.page]).length > 1;

/** The page of the original a cut is from, and its pass when its page has more than one. The score's own pages are its frames. */
export const pageLabel = (c: Cut, score: Score) => `original page ${c.page + 1}` + (passShown(c, score) ? `, pass ${passOf(c)}` : '');
