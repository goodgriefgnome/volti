// What the cut editor needs from the reader (EditorHost), and small helpers the cut editor's files
// share.

import type { Hatches } from '../../render/paint';
import type { Cut, State } from '../../scores/model';
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
  /** An ink tool is selected, so a long press on the music draws instead of opening a menu. */
  inking(): boolean;
  /** Forget the tap or swipe that started with this pointer. */
  cancelGesture(): void;
  say(text: string): void;
  /** Something the toolbar shows may have changed. */
  changed(): void;
}

export type Edge = 'top' | 'bottom';

/** The page of the original a cut is from. The score's own pages are its frames. */
export const pageLabel = (c: Cut) => `original page ${c.page + 1}`;

export function sayArchived(host: EditorHost) {
  host.say('The cut had markings, so it was archived. Insert it again from "Insert original pages…".');
}
