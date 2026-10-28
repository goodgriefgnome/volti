// The frames on a screen: which frames a screen starting at a frame shows, where they sit, and the
// widths their pages are drawn at. Pure: no DOM. The reader puts boxes where this says
// (reader/_spread.ts); pages kept offline are drawn at the widths it gives (library/_offline-pages.ts).

import type { Frame } from '../scores/frames';
import { framesOnScreen, _placeFrames, _sideBySide } from './layout';

/** Space between frames on one screen, in CSS pixels. */
const GAP = 6;

/** Where a frame sits on the stage, in CSS pixels, with its size in device pixels (`fw` x `fh`). */
export interface ScreenBox { x: number; y: number; w: number; h: number; fw: number; fh: number }

/**
 * Where a screen's frames, of these shapes (height / width), go on a W x H stage: as the first one
 * decides, side by side or one above the other, on whole device pixels so they are shown exactly as
 * drawn, without resampling.
 */
export function placeScreen(aspects: readonly number[], W: number, H: number, scale: number): ScreenBox[] {
  const rects = _placeFrames(aspects, Math.round(W * scale), Math.round(H * scale), Math.round(GAP * scale), _sideBySide(aspects[0]));
  return rects.map((r) => ({ x: r.x / scale, y: r.y / scale, w: r.w / scale, h: r.h / scale, fw: r.w, fh: r.h }));
}

/**
 * The screen starting at frame `f`: the frames on it, how many it has room for, and where they go.
 * In a setlist (`fill`), a score's last screen keeps the rest of its room, for frames shaped like
 * its first.
 */
export function screenAt(frames: readonly Frame[], f: number, W: number, H: number, scale: number, fill: boolean) {
  const first = frames[f];
  if (!first) return { on: [] as Frame[], wanted: 1, rects: [] as ScreenBox[] };
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
