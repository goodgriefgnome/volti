// The frames on the screen: their size, where they sit, and painting them. FrameSlot, the reader's
// record of a frame on the screen, is defined here.

import type { Marking } from '../markings/model';
import type { Frame } from '../scores/frames';
import type { Aspects, ScoreInk } from '../scores/model';
import { el } from '../ui/dom';
import { drawFrame, drawFrameInk, type Hatches } from './frames';
import { framesOnScreen, placeFrames, sideBySide } from './layout';

/** Space between frames on one screen, in CSS pixels. */
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

/** Where boxes for frames of these shapes go on a W x H stage, in CSS pixels, with their size in device pixels. */
export interface Placed { x: number; y: number; w: number; h: number; fw: number; fh: number }

/**
 * Where a screen's frames, of these shapes (height / width), go on a W x H stage: as the first one
 * decides, side by side or one above the other, on whole device pixels so they are shown exactly as
 * drawn, without resampling.
 */
export function placeScreen(aspects: readonly number[], W: number, H: number, scale: number): Placed[] {
  const rects = placeFrames(aspects, Math.round(W * scale), Math.round(H * scale), Math.round(GAP * scale), sideBySide(aspects[0]));
  return rects.map((r) => ({ x: r.x / scale, y: r.y / scale, w: r.w / scale, h: r.h / scale, fw: r.w, fh: r.h }));
}

/**
 * The screen starting at frame `f`: the frames on it, how many it has room for, and where they go.
 * In a setlist (`fill`), a score's last screen keeps the rest of its room, for frames shaped like
 * its first.
 */
export function screenAt(frames: readonly Frame[], f: number, W: number, H: number, scale: number, fill: boolean) {
  const first = frames[f];
  if (!first) return { on: [] as Frame[], wanted: 1, rects: [] as Placed[] };
  const wanted = framesOnScreen(first.aspect, W, H);
  const on = frames.slice(f, f + wanted);
  const room = fill ? wanted - on.length : 0;
  return { on, wanted, rects: placeScreen([...on.map((x) => x.aspect), ...Array<number>(room).fill(first.aspect)], W, H, scale) };
}

/** Each page the frames are cut from, with the widest of their slots it is drawn into (CSS pixels). */
export function pageWidths(frames: readonly Frame[], widths: readonly number[]): Map<number, number> {
  const out = new Map<number, number>();
  frames.forEach((f, i) => { for (const p of f.items) out.set(p.cut.page, Math.max(out.get(p.cut.page) ?? 0, widths[i])); });
  return out;
}

/**
 * Every page shown reading the frames from the start, a screen at a time as a setlist does, with
 * the widths (CSS pixels) it is drawn at.
 */
export function readPageWidths(frames: readonly Frame[], W: number, H: number, scale: number): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  for (let f = 0; f < frames.length;) {
    const { on, rects } = screenAt(frames, f, W, H, scale, true);
    for (const [p, w] of pageWidths(on, rects.map((r) => r.w))) out.set(p, (out.get(p) ?? new Set()).add(w));
    f += on.length;
  }
  return out;
}

/** Put boxes where `placeScreen` says, with `aspects` their shapes. */
export function placeBoxes(boxes: HTMLElement[], aspects: readonly number[], W: number, H: number, scale: number): Placed[] {
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
