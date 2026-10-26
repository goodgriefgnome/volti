// The frames on the reader's screen as elements: putting their boxes where render/screen.ts says,
// and painting them. FrameSlot, the reader's record of a frame on the screen, is defined here.

import type { Marking } from '../markings';
import { drawFrame, drawFrameInk, placeScreen, type Hatches, type ScreenBox } from '../render';
import type { Aspects, Frame, ScoreInk } from '../scores';
import { el } from '../ui';

/** A frame on the screen. Sizes are CSS pixels in the unzoomed spread. */
export interface FrameSlot {
  index: number;
  frame: Frame;
  box: HTMLElement;
  x: number; y: number; w: number; h: number;
  canvas: HTMLCanvasElement;
  ink: HTMLCanvasElement;
  /** A sharp close-up of the visible part while zoomed in: drawn as if the frame were W device pixels wide, from (x, y). */
  detail?: { canvas: HTMLCanvasElement; ink: HTMLCanvasElement; W: number; x: number; y: number };
  /** The editing tabs and shading over the frame. */
  ui?: HTMLElement;
}

/** Put boxes where `placeScreen` says, with `aspects` their shapes. */
export function placeBoxes(boxes: HTMLElement[], aspects: readonly number[], W: number, H: number, scale: number): ScreenBox[] {
  const rects = placeScreen(aspects, W, H, scale);
  boxes.forEach((box, i) => Object.assign(box.style, { left: rects[i].x + 'px', top: rects[i].y + 'px', width: rects[i].w + 'px', height: rects[i].h + 'px' }));
  return rects;
}

/**
 * Slots for `frames`, the first being frame number `first`, placed with `after` (boxes shaped like
 * the first frame, that fill the rest of the screen) following them.
 */
export function placeSlots(frames: Frame[], first: number, W: number, H: number, scale: number, after: HTMLElement[] = []): FrameSlot[] {
  const boxes = frames.map(() => el('div', 'page'));
  const rects = placeBoxes([...boxes, ...after], [...frames.map((f) => f.aspect), ...after.map(() => frames[0].aspect)], W, H, scale);
  return frames.map((frame, i) => {
    const r = rects[i];
    const slot: FrameSlot = {
      index: first + i,
      frame,
      box: boxes[i],
      x: r.x, y: r.y, w: r.w, h: r.h,
      canvas: Object.assign(el('canvas'), { width: r.fw, height: r.fh }),
      ink: Object.assign(el('canvas', 'ink'), { width: r.fw, height: r.fh }),
    };
    slot.box.append(slot.canvas, slot.ink);
    return slot;
  });
}

/** Draw a frame's music, from page canvases drawn at the frame's width, and its ink. */
export function paintSlot(slot: FrameSlot, pages: Map<number, HTMLCanvasElement>, aspects: Aspects, ink: ScoreInk, hatches?: Hatches, extra?: Marking) {
  const W = slot.canvas.width;
  drawFrame(slot.canvas.getContext('2d', { alpha: false })!, slot.frame, W, (p) => pages.get(p), aspects, hatches);
  paintSlotInk(slot, aspects, ink, extra);
}

/** Draw a frame's ink, and its close-up's; `extra` is a marking still being made. */
export function paintSlotInk(slot: FrameSlot, aspects: Aspects, ink: ScoreInk, extra?: Marking) {
  drawFrameInk(slot.ink.getContext('2d')!, slot.frame, ink, aspects, slot.ink.width, 0, 0, extra);
  const d = slot.detail;
  if (d) drawFrameInk(d.ink.getContext('2d')!, slot.frame, ink, aspects, d.W, d.x, d.y, extra);
}
