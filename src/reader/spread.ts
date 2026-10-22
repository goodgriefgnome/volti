// The frames on the screen: their size, where they sit, and painting them. FrameSlot, the reader's
// record of a frame on the screen, is defined here.

import type { Marking } from '../markings/model';
import type { Frame } from '../pieces/frames';
import { frameHeight, type Aspects, type PieceInk } from '../pieces/model';
import { el } from '../ui/dom';
import { drawFrame, drawFrameInk, type Hatches } from './frames';
import { fitPages, type Size } from './layout';

/** Space between frames side by side, in CSS pixels. */
const GAP = 6;

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

/** The size of each frame when `perScreen` of them share a W x H stage. */
export function frameSize(W: number, H: number, perScreen: number, aspects: Aspects): Size {
  return fitPages(W, H, Array(perScreen).fill(frameHeight(aspects)), GAP)[0];
}

/**
 * Lay out boxes the size of a frame across a W x H stage, centred, on whole screen pixels so
 * they are shown exactly as drawn, without resampling. `fw` and `fh` are in device pixels.
 */
export function placeBoxes(boxes: HTMLElement[], size: Size, W: number, H: number, scale: number) {
  const devW = Math.round(W * scale), devH = Math.round(H * scale), devGap = Math.round(GAP * scale);
  const fw = Math.round(size.w * scale), fh = Math.round(size.h * scale);
  const total = fw * boxes.length + devGap * (boxes.length - 1);
  let x = Math.floor((devW - total) / 2);
  return boxes.map((box) => {
    const r = { x: x / scale, y: Math.floor((devH - fh) / 2) / scale, w: fw / scale, h: fh / scale, fw, fh };
    Object.assign(box.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    x += fw + devGap;
    return r;
  });
}

/**
 * Slots for `frames`, the first being frame number `first`, placed with `after` (boxes that
 * fill the rest of the screen) following them.
 */
export function placeSlots(frames: Frame[], first: number, W: number, H: number, size: Size, scale: number, after: HTMLElement[] = []): FrameSlot[] {
  const boxes = frames.map(() => el('div', 'page'));
  const rects = placeBoxes([...boxes, ...after], size, W, H, scale);
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
export function paintSlot(slot: FrameSlot, pages: Map<number, HTMLCanvasElement>, aspects: Aspects, ink: PieceInk, hatches?: Hatches, extra?: Marking) {
  const W = slot.canvas.width;
  drawFrame(slot.canvas.getContext('2d', { alpha: false })!, slot.frame, W, (p) => pages.get(p), aspects, hatches);
  paintSlotInk(slot, aspects, ink, extra);
}

/** Draw a frame's ink, and its close-up's; `extra` is a marking still being made. */
export function paintSlotInk(slot: FrameSlot, aspects: Aspects, ink: PieceInk, extra?: Marking) {
  drawFrameInk(slot.ink.getContext('2d')!, slot.frame, ink, aspects, slot.ink.width, 0, 0, extra);
  const d = slot.detail;
  if (d) drawFrameInk(d.ink.getContext('2d')!, slot.frame, ink, aspects, d.W, d.x, d.y, extra);
}
