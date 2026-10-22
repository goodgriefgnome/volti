// Fitting pages to the screen: how many side by side, and how large. Pure maths.

import type { PagesPerScreen } from '../storage/prefs';

export interface Size { w: number; h: number }

/** How many pages to show side by side. 'auto' shows two in landscape, one in portrait. */
export function pagesPerScreen(pref: PagesPerScreen, stageW: number, stageH: number): 1 | 2 {
  if (pref === 'auto') return stageW > stageH ? 2 : 1;
  return pref;
}

/**
 * Sizes for pages placed side by side, all at the same height, as large as fits.
 * `aspects` are height / width of each page.
 */
export function fitPages(stageW: number, stageH: number, aspects: number[], gap: number): Size[] {
  if (!aspects.length) return [];
  const widthPerHeight = aspects.reduce((sum, a) => sum + 1 / a, 0);
  const h = Math.min(stageH, (stageW - gap * (aspects.length - 1)) / widthPerHeight);
  // the epsilon stops float error turning an exact fit like 800 into 799
  return aspects.map((a) => ({ w: Math.floor(h / a + 1e-6), h: Math.floor(h + 1e-6) }));
}
