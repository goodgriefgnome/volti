// What every tool is: the Tool interface, and what a tool may ask of the reader. A tool acts on the
// frames with a pointer; each tool has its own file here, and tools.ts lists them.

import type { SymbolLibrary, LibrarySymbol } from '../../markings/library';
import type { Marking, Point } from '../../markings/model';
import type { State } from '../../scores/model';
import type { Selected } from '../../scores/placing';
import type { FrameSlot } from '../_spread';
import type { ReaderView } from '../_view';

/** What a tool needs from the reader. */
export interface ToolHost extends ReaderView {
  penColor(): string;
  /** The symbol the symbol tool places: the current one of its group. */
  placing(): LibrarySymbol | undefined;
  library(): SymbolLibrary | undefined;
  /** The placed marking showing its box, if any. */
  selected(): Selected | undefined;
  select(s: Selected | undefined): void;
  /** Draw a frame's ink again; `extra` is a marking still being made. */
  paintInk(slot: FrameSlot, extra?: Marking): void;
  /** Draw a frame's ink as it would be in `s`, without taking the edit: a marking being dragged. The selection's box is hidden until the next `select`. */
  paintState(slot: FrameSlot, s: State): void;
  /** Take an edit: undo, save, reflow, and show the frame holding `focus`. */
  commit(s: State, focus?: string): void;
  /** The eraser took markings away from the frame in `slot`: show and save it, without an undo step yet. */
  erased(s: State, slot: FrameSlot): void;
  /** The eraser lifted: one undo step, back to `before`, for its whole sweep. */
  eraseEnded(before: State, slot: FrameSlot): void;
}

/**
 * One pointer using a tool on a frame, from going down to lifting. Points are on the frame: x as
 * a fraction of its width, y in frame widths from its top.
 */
export interface ToolPointer {
  move(p: Point): void;
  /** After the points of one pointer event have all been moved through. */
  moved?(): void;
  /** The pointer lifted, or the system cancelled it (`cancelled`: it decided this was a palm). */
  end(cancelled: boolean): void;
  /** Forget it: a palm, or a finger that turned out to start a pinch. */
  drop(): void;
}

export interface Tool {
  /** Its button in the toolbar. */
  label: string;
  start(host: ToolHost, slot: FrameSlot, p: Point): ToolPointer;
}
