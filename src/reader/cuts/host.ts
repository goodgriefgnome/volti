import type { Frame } from '../../pieces/frames';
import type { Aspects, Cut, State } from '../../pieces/model';
import type { Popups } from '../../ui/menu';
import type { Hatches } from '../frames';
import type { FrameSlot } from '../spread';

/** What the cut editor needs from the reader. */
export interface EditorHost {
  root: HTMLElement;
  stage: HTMLElement;
  /** The current piece's: read each time, as the reader turns from piece to piece. */
  readonly aspects: Aspects;
  state(): State;
  frames(): Frame[];
  slots(): FrameSlot[];
  /** Take the result of an edit: undo, save, reflow, and show the frame holding `focus`. */
  commit(s: State, focus?: string): void;
  /** Show a drag in progress with the layout frozen, or (null) go back to the real layout. */
  preview(s: State | null, frames: Frame[] | null, hatches?: Hatches): void;
  thumb(page: number, width: number): Promise<HTMLCanvasElement>;
  /** An ink tool is selected, so a long press on the music draws instead of opening a menu. */
  inking(): boolean;
  /** Forget the tap or swipe that started with this pointer. */
  cancelGesture(): void;
  say(text: string): void;
  /** Something the toolbar shows may have changed. */
  changed(): void;
}

/** What the editor's menus and dialogs work with. */
export interface Editing { host: EditorHost; popups: Popups }

export type Edge = 'top' | 'bottom';

export const pageLabel = (c: Cut) => `page ${c.page + 1}`;

export function sayArchived(host: EditorHost) {
  host.say('The cut had markings, so it was archived. Insert it again from "Insert pages…".');
}
