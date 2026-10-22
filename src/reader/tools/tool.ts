// What every tool is: the Tool interface, what a tool may ask of the reader, and the tools' names.
// A tool acts on the frames with a pointer; each tool has its own file here.

import type { Marking, Point } from '../../markings/model';
import type { Aspects, State } from '../../scores/model';
import type { FrameSlot } from '../spread';

export type ToolName = 'pen' | 'highlighter' | 'eraser';

/** What a tool needs from the reader. */
export interface ToolHost {
  /** The current score's: read each time, as the reader turns from score to score. */
  readonly aspects: Aspects;
  state(): State;
  penColor(): string;
  /** The zoom scale, so a tool can keep its size on the screen. */
  scale(): number;
  /** Draw a frame's ink again; `extra` is a marking still being made. */
  paintInk(slot: FrameSlot, extra?: Marking): void;
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
  start(host: ToolHost, slot: FrameSlot, p: Point): ToolPointer;
}
