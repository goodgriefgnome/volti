// Drawing a symbol as a picture on a canvas: the toolbar's buttons and menus, the glyph picker's
// preview and the library editor's.

import { canvasDrawing } from '../markings/draw';
import type { LibrarySymbol } from '../markings/library';
import { drawMarkings } from '../markings/model';
import { emExtent, type Background, type PlacedMark } from '../markings/placed';
import { dpr, el } from '../ui/dom';

/** The size of a symbol's picture, in CSS pixels. */
export const PICTURE_PX = 48;
/** The em of a symbol of scale 1 in a picture of the usual size, in CSS pixels: pictures are in proportion to their scales. */
export const EM_PX = 36;

/** What a picture needs of a symbol. */
export type Pictured = Pick<LibrarySymbol, 'font' | 'text' | 'glyphs' | 'scale'>;

/** Whether the symbol has any ink to draw (its glyphs are in the table, and have outlines). */
export function hasInk(sym: Pictured): boolean {
  return !!emExtent(placed(sym, 1, '#000000'));
}

const placed = (sym: Pictured, size: number, color: string): PlacedMark =>
  ({ kind: 'symbol', text: sym.text, font: sym.font, glyphs: sym.glyphs, at: [0.5, 0.5], size, color });

/**
 * A canvas showing a symbol, centred, its size in proportion to its scale, in `color`. A square of
 * `side` CSS pixels, with the em of scale 1 at 3/4 of that unless `em` says. Without a background
 * unless one is given: the toolbar's pictures are white on dark, where a light one would hide them.
 */
export function symbolPicture(
  sym: Pictured, color: string, side = PICTURE_PX, em = (side * EM_PX) / PICTURE_PX, background?: Background,
): HTMLCanvasElement {
  const scale = dpr();
  const canvas = el('canvas');
  canvas.width = canvas.height = Math.round(side * scale);
  canvas.style.width = canvas.style.height = side + 'px';
  const mark = { ...placed(sym, (em * sym.scale) / side, color), ...(background && { background }) };
  if (emExtent(mark)) {
    const ctx = canvas.getContext('2d');
    if (ctx) drawMarkings({ draw: canvasDrawing(ctx), w: canvas.width, h: canvas.height, ox: 0, oy: 0 }, [mark]);
  }
  return canvas;
}
