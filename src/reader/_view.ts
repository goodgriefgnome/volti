// What every part of the reader sees of it: the current score and the frames on the screen. Each
// part's host (the cut editor's, the tools', pointer input's and the close-up's) is this view and
// the few things that part may ask the reader to do.

import type { Zoom } from '../render/zoom';
import type { Aspects, State } from '../scores/model';
import type { Frame } from '../scores/frames';
import type { DrawPage } from './_open-scores';
import type { FrameSlot } from './_spread';

/** The reader as it is now: read each time, as the reader turns from score to score and redraws. */
export interface ReaderView {
  stage: HTMLElement;
  /** The current score's original's page shapes. */
  aspects(): Aspects;
  /** Draw a page of the current score. */
  draw(): DrawPage;
  state(): State;
  /** The current item's frames: all of them, not only those on the screen. */
  frames(): Frame[];
  /** The frames on the screen. */
  slots(): FrameSlot[];
  zoom(): Zoom;
}
