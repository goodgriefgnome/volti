import type { Stroke } from '../ink/model';
import type { Frame } from '../pieces/frames';
import { frameHeight, type Aspects, type PieceInk } from '../pieces/model';
import { el } from '../ui/dom';
import { drawFrame, drawFrameInk, type Hatches } from './frames';
import { fitPages, type Size } from './layout';

// The frames on the screen: their size, where they sit, and drawing them.

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
 * Slots for `frames`, the first being frame number `first`, centred on a W x H stage. They are
 * placed on whole screen pixels so they are shown exactly as drawn, without resampling.
 */
export function placeSlots(frames: Frame[], first: number, W: number, H: number, size: Size, scale: number): FrameSlot[] {
  const devW = Math.round(W * scale), devH = Math.round(H * scale), devGap = Math.round(GAP * scale);
  const fw = Math.round(size.w * scale), fh = Math.round(size.h * scale);
  const total = fw * frames.length + devGap * (frames.length - 1);
  let x = Math.floor((devW - total) / 2);
  return frames.map((frame, i) => {
    const slot: FrameSlot = {
      index: first + i,
      frame,
      box: el('div', 'page'),
      x: x / scale,
      y: Math.floor((devH - fh) / 2) / scale,
      w: fw / scale,
      h: fh / scale,
      canvas: Object.assign(el('canvas'), { width: fw, height: fh }),
      ink: Object.assign(el('canvas', 'ink'), { width: fw, height: fh }),
    };
    x += fw + devGap;
    Object.assign(slot.box.style, { left: slot.x + 'px', top: slot.y + 'px', width: slot.w + 'px', height: slot.h + 'px' });
    slot.box.append(slot.canvas, slot.ink);
    return slot;
  });
}

/** Draw a frame's music, from page canvases drawn at the frame's width, and its ink. */
export function paintSlot(slot: FrameSlot, pages: Map<number, HTMLCanvasElement>, aspects: Aspects, ink: PieceInk, hatches?: Hatches, extra?: Stroke) {
  const W = slot.canvas.width;
  drawFrame(slot.canvas.getContext('2d', { alpha: false })!, slot.frame, W, (p) => pages.get(p), aspects, hatches);
  paintSlotInk(slot, aspects, ink, extra);
}

/** Draw a frame's ink, and its close-up's; `extra` is a stroke still being drawn. */
export function paintSlotInk(slot: FrameSlot, aspects: Aspects, ink: PieceInk, extra?: Stroke) {
  drawFrameInk(slot.ink.getContext('2d')!, slot.frame, ink, aspects, slot.ink.width, 0, 0, extra);
  const d = slot.detail;
  if (d) drawFrameInk(d.ink.getContext('2d')!, slot.frame, ink, aspects, d.W, d.x, d.y, extra);
}
