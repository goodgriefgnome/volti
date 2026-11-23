// An item's frames laid end to end as a strip, each at its fitted size, and the screens onto it:
// which frames a screen starting at a frame shows whole, the part after them, where each goes on
// the stage, the list of screens for an Advance, and where landing on a frame goes. Pure maths: the
// reader puts boxes where this says (reader/_screen.ts).

import type { Frame } from '../scores/frames';
import type { Advance } from '../settings/turning';
import { GAP, _placeFrames, type ScreenBox } from './layout';

/** A frame on the strip, in device pixels: where it starts along, its length along, its size across and where it sits across. */
export interface StripFrame { at: number; len: number; size: number; off: number }

export interface Strip {
  /** 'x' on a landscape stage (wider than tall), 'y' on a portrait one. */
  along: 'x' | 'y';
  /** The stage's length along, in device pixels. */
  length: number;
  scale: number;
  frames: StripFrame[];
  /** When every frame fits on the stage at once: where the strip starts along, centred. Else null. */
  centred: number | null;
}

/**
 * A frame's fitted size on a W × H stage (device pixels), `aspect` its height over width: its full
 * size (as large as fits the stage), shrunk to the largest share 1/n of the stage along (gaps
 * included) it can reach without going below `smallest` of its full size; never larger than full.
 */
export function _fitted(aspect: number, W: number, H: number, gap: number, smallest: number): { w: number; h: number } {
  const [full] = _placeFrames([aspect], W, H, gap, true);
  const along = W > H;
  const L = along ? W : H, f = along ? full.w : full.h;
  const n = Math.floor((L + gap) / (f * smallest + gap) + 1e-6);
  if (n < 2) return { w: full.w, h: full.h };
  const share = Math.floor((L - gap * (n - 1)) / n);
  if (share >= f) return { w: full.w, h: full.h };
  return along ? { w: share, h: Math.floor(share * aspect + 1e-6) } : { w: Math.floor(share / aspect + 1e-6), h: share };
}

/** The strip of frames of these aspects on a W × H stage (CSS pixels) at `scale` device pixels per CSS pixel. */
export function layStrip(aspects: readonly number[], W: number, H: number, scale: number, smallest: number): Strip {
  const Wd = Math.round(W * scale), Hd = Math.round(H * scale), gap = Math.round(GAP * scale);
  const along = Wd > Hd ? 'x' : 'y';
  const length = along === 'x' ? Wd : Hd, across = along === 'x' ? Hd : Wd;
  let at = 0;
  const frames = aspects.map((a): StripFrame => {
    const { w, h } = _fitted(a, Wd, Hd, gap, smallest);
    const len = along === 'x' ? w : h, size = along === 'x' ? h : w;
    const f = { at, len, size, off: Math.floor((across - size) / 2) };
    at += len + gap;
    return f;
  });
  const total = frames.length ? at - gap : 0;
  return { along, length, scale, frames, centred: frames.length && total <= length ? Math.floor((length - total) / 2) : null };
}

/** A screen: its first frame, the frames whole on it, the part after them, and where each goes. */
export interface StripScreen {
  first: number;
  /** Frame indices whole on the screen, in order. */
  whole: number[];
  /** The frame after them, partly on the screen; undefined when none is. */
  part?: number;
  /** Where each of `whole`, then `part`, goes on the stage, as placeScreen gives (the part runs past the stage's edge). */
  boxes: ScreenBox[];
  /** Past the item's last frame, the empty stretch along, in CSS pixels from the stage's start; null when there is none. */
  empty: { at: number; len: number } | null;
}

/** The screen starting at frame `first`. */
export function stripScreen(s: Strip, first: number): StripScreen {
  const { frames } = s;
  const start = frames[first]?.at ?? 0, end = start + s.length;
  const whole: number[] = [];
  let j = first;
  while (j < frames.length && frames[j].at + frames[j].len <= end) whole.push(j++);
  const part = j < frames.length && frames[j].at < end ? j : undefined;
  const shift = s.centred ?? 0;
  const box = (k: number): ScreenBox => {
    const f = frames[k], along = shift + f.at - start;
    const [x, y, fw, fh] = s.along === 'x' ? [along, f.off, f.len, f.size] : [f.off, along, f.size, f.len];
    return { x: x / s.scale, y: y / s.scale, w: fw / s.scale, h: fh / s.scale, fw, fh };
  };
  let empty: StripScreen['empty'] = null;
  const last = frames[frames.length - 1];
  if (last && whole[whole.length - 1] === frames.length - 1) {
    const from = shift + last.at + last.len + Math.round(GAP * s.scale) - start;
    if (s.length - from > Math.round(GAP * s.scale)) empty = { at: from / s.scale, len: (s.length - from) / s.scale };
  }
  return { first, whole, part, boxes: [...whole, ...(part === undefined ? [] : [part])].map(box), empty };
}

/** The first frame of each screen in the list, in order (spec, "The list of screens"). */
export function screenStarts(s: Strip, advance: Advance): number[] {
  const n = s.frames.length;
  if (!n || s.centred !== null) return [0];
  const starts: number[] = [];
  for (let first = 0; first < n;) {
    starts.push(first);
    const { whole } = stripScreen(s, first);
    if (whole[whole.length - 1] === n - 1) break;
    first = advance === 'page' ? first + 1 : whole[whole.length - 1] + 1;
  }
  return starts;
}

/** Where landing on `frame` goes: the index in `starts` of the screen starting there, else of the last one starting before it (0 when none does). */
export function landingIndex(starts: readonly number[], frame: number): number {
  let at = 0;
  starts.forEach((s, i) => { if (s <= frame) at = i; });
  return at;
}

/** How far the strip moves, in CSS pixels along, from the screen starting at frame `a` to the one at `b`. */
export function stripDistance(s: Strip, a: number, b: number): number {
  return ((s.frames[b]?.at ?? 0) - (s.frames[a]?.at ?? 0)) / s.scale;
}

/** Each page the frames are cut from, with the widths (CSS pixels) it is drawn at: every frame at its fitted width. */
export function stripPageWidths(frames: readonly Frame[], W: number, H: number, scale: number, smallest: number): Map<number, Set<number>> {
  const strip = layStrip(frames.map((f) => f.aspect), W, H, scale, smallest);
  const out = new Map<number, Set<number>>();
  frames.forEach((f, i) => {
    const w = strip.along === 'x' ? strip.frames[i].len : strip.frames[i].size;
    for (const p of f.items) out.set(p.cut.page, (out.get(p.cut.page) ?? new Set()).add(w / scale));
  });
  return out;
}
