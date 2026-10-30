// The selected marking's box over its frame: an outline, a handle at each corner and a delete button
// above. DOM elements in the frame's box, so they zoom with it; on screen only, never exported.

import { el } from '../ui/dom';
import type { FrameSlot } from './_spread';

export class SelectionBox {
  private box = el('div', 'selection');
  private remove = el('button', 'selection-delete', '×');

  constructor(onDelete: () => void) {
    this.remove.type = 'button';
    this.remove.setAttribute('aria-label', 'Delete');
    this.remove.addEventListener('click', onDelete);
    this.box.append(...[0, 1, 2, 3].map((i) => el('div', `selection-handle c${i}`)), this.remove);
    this.box.hidden = true;
  }

  /** Show it over `slot` at `ext` (frame coordinates: x in frame widths, y in frame widths from its top), or hide it. */
  show(slot: FrameSlot | undefined, ext?: [number, number, number, number]) {
    if (!slot || !ext) { this.box.hidden = true; return; }
    const a = slot.frame.aspect, [x0, y0, x1, y1] = ext;
    Object.assign(this.box.style, { left: x0 * 100 + '%', top: (y0 / a) * 100 + '%', width: (x1 - x0) * 100 + '%', height: ((y1 - y0) / a) * 100 + '%' });
    if (this.box.parentElement !== slot.box) slot.box.append(this.box);
    this.box.hidden = false;
  }
}
