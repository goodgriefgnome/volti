import type { Point, Stroke } from '../../ink/model';
import type { Aspects, State } from '../../pieces/model';
import type { FrameSlot } from '../spread';

// The toolbar's tools that act on the frames. A new kind of marking adds a tool here.

export type ToolName = 'pen' | 'highlighter' | 'eraser';

/** What a tool needs from the reader. */
export interface ToolHost {
  /** The current piece's: read each time, as the reader turns from piece to piece. */
  readonly aspects: Aspects;
  state(): State;
  penColor(): string;
  /** The zoom scale, so a tool can keep its size on the screen. */
  scale(): number;
  /** Draw a frame's ink again; `extra` is a stroke still being drawn. */
  paintInk(slot: FrameSlot, extra?: Stroke): void;
  /** Take an edit: undo, save, reflow, and show the frame holding `focus`. */
  commit(s: State, focus?: string): void;
  /** The eraser took strokes away from the frame in `slot`: show and save it, without an undo step yet. */
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
