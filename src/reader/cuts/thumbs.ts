import { el } from '../../ui/dom';
import type { Editing } from './host';

export const THUMB_W = 84;

/** A copy of a page thumbnail, or of the band y0..y1 of it, drawn into a new canvas once it is ready. */
export function thumbCanvas({ host, popups }: Editing, page: number, y0 = 0, y1 = 1): HTMLCanvasElement {
  const c = el('canvas');
  const a = host.aspects[page], scale = window.devicePixelRatio || 1;
  c.width = Math.round(THUMB_W * scale);
  c.height = Math.max(1, Math.round(THUMB_W * a * (y1 - y0) * scale));
  c.style.width = THUMB_W + 'px';
  const dialog = popups.dialog;
  void host.thumb(page, THUMB_W).then((src) => {
    if (popups.dialog !== dialog) return;
    c.getContext('2d')!.drawImage(src, 0, y0 * src.height, src.width, (y1 - y0) * src.height, 0, 0, c.width, c.height);
  }).catch(() => {});
  return c;
}
