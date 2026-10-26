// Fitting frames to the screen: how many a screen shows, which way they sit, and how large. Pure
// maths.

import { isLandscape } from '../scores';

export interface Rect { x: number; y: number; w: number; h: number }

/**
 * How many frames a screen shows, decided by its first frame (`aspect`, height / width): one of the
 * screen's own orientation fills it; one of the other shares it with the next.
 */
export function framesOnScreen(aspect: number, stageW: number, stageH: number): 1 | 2 {
  return isLandscape({ aspect }) === stageW > stageH ? 1 : 2;
}

/** Two frames sit side by side when the first is portrait, one above the other when landscape. */
export const sideBySide = (firstAspect: number) => !isLandscape({ aspect: firstAspect });

/**
 * Where frames of these shapes (height / width) go on a W x H stage, in whole pixels: each as
 * large as fits in its share of the stage (all of it, or half, side by side or one above the other),
 * together centred, `gap` apart.
 */
export function placeFrames(aspects: readonly number[], W: number, H: number, gap: number, across: boolean): Rect[] {
  const n = aspects.length;
  if (!n) return [];
  const cellW = across ? (W - gap * (n - 1)) / n : W, cellH = across ? H : (H - gap * (n - 1)) / n;
  // the epsilon stops float error turning an exact fit like 800 into 799
  const sizes = aspects.map((a) => {
    // Round from the side that limits it, so a frame that fills the height fills it exactly.
    if (cellH / a <= cellW) { const h = Math.floor(cellH + 1e-6); return { w: Math.floor(h / a + 1e-6), h }; }
    const w = Math.floor(cellW + 1e-6);
    return { w, h: Math.floor(w * a + 1e-6) };
  });
  const total = sizes.reduce((sum, s) => sum + (across ? s.w : s.h), 0) + gap * (n - 1);
  let at = Math.floor(((across ? W : H) - total) / 2);
  return sizes.map((s) => {
    const r = across ? { x: at, y: Math.floor((H - s.h) / 2), ...s } : { x: Math.floor((W - s.w) / 2), y: at, ...s };
    at += (across ? s.w : s.h) + gap;
    return r;
  });
}
