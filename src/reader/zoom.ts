// Pinch and pan maths, and which part of a frame is in view. Pure: no DOM. A zoom is a scale `s`
// about the stage's top-left corner, then a shift by (x, y), as in the CSS transform
// `translate(x, y) scale(s)`.

export interface Zoom { s: number; x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface Pt { x: number; y: number }

export const NO_ZOOM: Zoom = { s: 1, x: 0, y: 0 };
export const MAX_ZOOM = 5;

export const isZoomed = (z: Zoom) => z.s > 1.001;

/** Keep the zoom between 1x and MAX_ZOOM, with the stage always covered by the zoomed spread. */
export function clamp(z: Zoom, W: number, H: number): Zoom {
  const s = Math.min(MAX_ZOOM, Math.max(1, z.s));
  return {
    s,
    x: Math.min(0, Math.max(W - W * s, z.x)),
    y: Math.min(0, Math.max(H - H * s, z.y)),
  };
}

/**
 * Two fingers moved from centre `c0`, `d0` apart, to centre `c`, `d` apart: scale by d / d0,
 * keeping the point that was under the fingers' centre under it.
 */
export function pinch(start: Zoom, c0: Pt, d0: number, c: Pt, d: number, W: number, H: number): Zoom {
  const s = Math.min(MAX_ZOOM, Math.max(1, start.s * (d / d0)));
  const px = (c0.x - start.x) / start.s;
  const py = (c0.y - start.y) / start.s;
  return clamp({ s, x: c.x - px * s, y: c.y - py * s }, W, H);
}

export function pan(start: Zoom, dx: number, dy: number, W: number, H: number): Zoom {
  return clamp({ ...start, x: start.x + dx, y: start.y + dy }, W, H);
}

/**
 * The part of a page (placed at `box` in unzoomed stage coordinates) that is visible on a
 * W x H stage, in the page's own unzoomed coordinates; null when none of it is visible.
 */
export function visiblePart(z: Zoom, W: number, H: number, box: Rect): Rect | null {
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
