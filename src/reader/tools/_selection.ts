// The selected marking's box over its frame: a line, a handle at each corner and a delete button above. DOM elements in a tool's layer of the frame's box, so they zoom with it; on screen only, never exported.

import { el } from '../../ui/dom';
import { handleRadius, MIN_BOX_PX, selectionBox } from '../../scores/placing';
import type { FrameSlot } from '../_spread';

type Ext = [number, number, number, number];

/** Each corner's handle keeps the quarter of its disc inside the box cut away: top left, top right, bottom right, bottom left. */
const CUTS = [
  'polygon(0 0, 100% 0, 100% 50%, 50% 50%, 50% 100%, 0 100%)',
  'polygon(0 0, 100% 0, 100% 100%, 50% 100%, 50% 50%, 0 50%)',
  'polygon(50% 0, 100% 0, 100% 100%, 0 100%, 0 50%, 50% 50%)',
  'polygon(0 0, 50% 0, 50% 50%, 100% 50%, 100% 100%, 0 100%)',
];



export class SelectionBox {
  private box = el('div', 'selection');
  private handles = CUTS.map((cut) => { const h = el('div', 'selection-handle'); h.style.clipPath = cut; return h; });
  private line = el('div', 'selection-line');
  private remove = el('button', 'selection-delete', '×');
  private shown: { slot: FrameSlot; ext: Ext } | undefined;

  constructor(onDelete: () => void) {
    this.remove.type = 'button';
    this.remove.dataset.ownPresses = '';
    this.remove.setAttribute('aria-label', 'Delete');
    this.remove.addEventListener('click', onDelete);
    // The line over the handles, and the button last, so it wins over both where they overlap.
    this.box.append(...this.handles, this.line, this.remove);
    this.box.hidden = true;
  }

  /**
   * Show it in `layer` of `slot` round the marking whose ink is at `ext` (frame coordinates: x in
   * frame widths, y in frame widths from its top), the spread zoomed by `s`; or hide it.
   */
  show(layer: HTMLElement | undefined, slot: FrameSlot | undefined, ext: Ext | undefined, s: number) {
    if (!layer || !slot || !ext) { this.hide(); return; }
    this.shown = { slot, ext };
    if (this.box.parentElement !== layer) layer.append(this.box);
    this.zoomed(s);
    this.box.hidden = false;
  }

  hide() {
    this.shown = undefined;
    this.box.hidden = true;
  }

  /** The spread's zoom changed: the box, its line and its handles keep their size on screen. */
  zoomed(s: number) {
    if (!this.shown) return;
    const { slot, ext } = this.shown, a = slot.frame.aspect, px = slot.w * s; // CSS pixels in a frame width
    const [x0, y0, x1, y1] = selectionBox(ext, MIN_BOX_PX / px);
    Object.assign(this.box.style, { left: x0 * 100 + '%', top: (y0 / a) * 100 + '%', width: (x1 - x0) * 100 + '%', height: ((y1 - y0) / a) * 100 + '%' });
    // The line's border is centred on the box's edge.
    const w = 1 / s;
    Object.assign(this.line.style, { inset: -w / 2 + 'px', borderWidth: w + 'px' });
    const r = handleRadius(Math.min(x1 - x0, y1 - y0) * px) / s; // in the zoomed spread's pixels
    this.handles.forEach((h, i) => Object.assign(h.style, {
      left: i === 1 || i === 2 ? '100%' : '0', top: i >= 2 ? '100%' : '0',
      width: 2 * r + 'px', height: 2 * r + 'px', margin: -r + 'px 0 0 ' + -r + 'px', borderWidth: 1.5 / s + 'px',
    }));
  }
}
