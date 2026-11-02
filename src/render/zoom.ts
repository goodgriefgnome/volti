// Pinch and pan maths, and which part of a frame is in view. Pure: no DOM. A zoom is a scale `s`
// about the stage's top-left corner, then a shift by (x, y), as in the CSS transform
// `translate(x, y) scale(s)`.

import type { _Rect } from './layout';

export interface Zoom { s: number; x: number; y: number }
export interface Pt { x: number; y: number }

export const NO_ZOOM: Zoom = { s: 1, x: 0, y: 0 };
export const _MAX_ZOOM = 5;

export const isZoomed = (z: Zoom) => z.s > 1.001;

/** Whether z leaves the spread as it is laid out: no transform needed. */
export const isIdentity = (z: Zoom) => Math.abs(z.s - 1) < 0.001 && Math.abs(z.x) < 0.5 && Math.abs(z.y) < 0.5;

/** The part of the stage the spread can be seen in: below `top`, the toolbar's height (0 when hidden). */
export interface View { top: number; W: number; H: number }

/** The largest scale at which the whole spread (the W x H stage) fits in the view. */
export function fitScale(v: View): number {
  return v.top === 0 ? 1 : (v.H - v.top) / v.H;
}

/** A new screen while the toolbar shows: the spread at fitScale, centred in the view both ways. */
export function placeFresh(v: View): Zoom {
  const s = fitScale(v);
  return { s, x: (v.W - v.W * s) / 2, y: v.top + (v.H - v.top - v.H * s) / 2 };
}

/**
 * Move one edge-pair along one axis by d: the spread covers [pos, pos + len], the view [v0, v1].
 * The move may keep or increase how much of the spread is in the view, never decrease it; what
 * goes past that is lost (the spread sticks).
 */
export function _slide(pos: number, len: number, v0: number, v1: number, d: number): number {
  const lo = Math.min(v0, v1 - len);
  const hi = Math.max(v0, v1 - len);
  if (d > 0) return Math.min(pos + d, Math.max(pos, hi));
  if (d < 0) return Math.max(pos + d, Math.min(pos, lo));
  return pos;
}

/** A one-finger drag by (dx, dy) from `start`, by `_slide` in each direction. */
export function drag(start: Zoom, dx: number, dy: number, v: View): Zoom {
  return {
    s: start.s,
    x: _slide(start.x, v.W * start.s, 0, v.W, dx),
    y: _slide(start.y, v.H * start.s, v.top, v.H, dy),
  };
}

/** One axis of a pinch: scale about c0, settle against the allowed range, slide by the travel. */
function pinchAxis(pos0: number, c0: number, c: number, s0: number, s: number, size: number, v0: number, v1: number): number {
  const scaled = c0 - ((c0 - pos0) / s0) * s;
  const lo0 = Math.min(v0, v1 - size * s0), hi0 = Math.max(v0, v1 - size * s0);
  const lo = Math.min(v0, v1 - size * s), hi = Math.max(v0, v1 - size * s);
  // Inside the allowed range to begin with: stay inside it. Outside: never get further out.
  const inside = pos0 >= lo0 && pos0 <= hi0;
  const min = inside ? lo : Math.min(lo, pos0);
  const max = inside ? hi : Math.max(hi, pos0);
  const settled = Math.min(max, Math.max(min, scaled));
  return _slide(settled, size * s, v0, v1, c - c0);
}

/**
 * Two fingers that went down `d0` apart around `c0` are now `d` apart around `c`: the scale goes
 * by d / d0, between `minScale` and _MAX_ZOOM, keeping the point under c0 under the fingers'
 * centre, then each direction is settled and slid.
 */
export function pinch(start: Zoom, c0: Pt, d0: number, c: Pt, d: number, v: View, minScale: number): Zoom {
  const s = Math.min(_MAX_ZOOM, Math.max(minScale, start.s * (d / d0)));
  return {
    s,
    x: pinchAxis(start.x, c0.x, c.x, start.s, s, v.W, 0, v.W),
    y: pinchAxis(start.y, c0.y, c.y, start.s, s, v.H, v.top, v.H),
  };
}

/**
 * The part of a page (placed at `box` in unzoomed stage coordinates) that is visible on a
 * W x H stage, in the page's own unzoomed coordinates; null when none of it is visible.
 */
export function visiblePart(z: Zoom, W: number, H: number, box: _Rect): _Rect | null {
  const left = Math.max(box.x, -z.x / z.s);
  const top = Math.max(box.y, -z.y / z.s);
  const right = Math.min(box.x + box.w, (W - z.x) / z.s);
  const bottom = Math.min(box.y + box.h, (H - z.y) / z.s);
  if (right <= left || bottom <= top) return null;
  return { x: left - box.x, y: top - box.y, w: right - left, h: bottom - top };
}

/**
 * Pinching content that scrolls rather than moves, such as a strip of thumbnails: at scale `s0`,
 * scrolled to `scroll0`, the fingers' centre was at `c0` in the scroll box; now the scale is `s`
 * and the centre is at `c`. The scroll position that keeps the same content under the fingers.
 */
export function scrollForPinch(s0: number, scroll0: Pt, c0: Pt, s: number, c: Pt): Pt {
  const k = s / s0;
  return { x: (scroll0.x + c0.x) * k - c.x, y: (scroll0.y + c0.y) * k - c.y };
}
