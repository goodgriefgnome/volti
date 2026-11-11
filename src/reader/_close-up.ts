// The sharp close-up drawn over the frames while zoomed in.

import { drawFrameInk, regionBands } from '../render/draw';
import { isZoomed, visiblePart } from '../render/zoom';
import { dpr, el } from '../ui/dom';
import type { ReaderView } from './_view';
import { failedOnce } from '../ui/failure';

/** Wait this long after a pinch or pan settles before drawing the sharp close-up. */
const CLOSE_UP_DELAY_MS = 150;

/**
 * Zoomed in, the frame drawings are stretched and soft. This draws the visible part of each frame
 * again at the zoomed size, on top: the close-up hides the soft music and ink beneath it.
 */
export class CloseUp {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private seq = 0;
  private drawing = new AbortController();

  constructor(private host: ReaderView) {}

  /** The zoom changed: draw close-ups once it settles, or drop them when zoomed out. */
  update() {
    clearTimeout(this.timer);
    if (!isZoomed(this.host.zoom())) { this.drop(); return; }
    this.timer = setTimeout(() => void this.draw(), CLOSE_UP_DELAY_MS);
  }

  /** Supersede any close-up being drawn. */
  private restart(): AbortSignal {
    this.seq++;
    this.drawing.abort();
    return (this.drawing = new AbortController()).signal;
  }

  drop() {
    this.restart();
    for (const s of this.host.slots()) {
      s.closeUp?.canvas.remove();
      s.closeUp?.under.remove();
      s.closeUp?.ink.remove();
      s.closeUp = undefined;
    }
  }

  /** Stop drawing for good, as when the reader closes. */
  stop() {
    clearTimeout(this.timer);
    this.restart();
  }

  private async draw() {
    const signal = this.restart(), seq = this.seq;
    const { stage } = this.host, draw = this.host.draw(), aspects = this.host.aspects();
    const z = this.host.zoom();
    const W = stage.clientWidth, H = stage.clientHeight;
    const k = dpr() * z.s;
    for (const slot of this.host.slots()) {
      const part = visiblePart(z, W, H, slot);
      if (!part) continue;
      const fw = Math.round(slot.w * k);
      const x = Math.floor(part.x * k), y = Math.floor(part.y * k);
      const region = { x, y, w: Math.ceil((part.x + part.w) * k) - x, h: Math.ceil((part.y + part.h) * k) - y };
      const canvas = Object.assign(el('canvas', 'close-up'), { width: region.w, height: region.h });
      const ctx = canvas.getContext('2d', { alpha: false })!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, region.w, region.h);
      try {
        for (const b of regionBands(slot.frame, fw, aspects, region)) {
          const part = await draw(b.p.cut.page + 1, fw, { crop: { x, y: b.pageY, w: region.w, h: b.h }, priority: 'now', signal });
          if (seq !== this.seq) return;
          // From a page drawn at an equivalent width, it may be a pixel or two off the size asked for.
          ctx.drawImage(part.canvas, 0, b.destY, region.w, b.h);
        }
      } catch (e) {
        if (seq !== this.seq) return;
        failedOnce('draw the close-up', e);
        continue;
      }
      if (seq !== this.seq) return;
      const ink = Object.assign(el('canvas', 'ink close-up'), { width: region.w, height: region.h });
      const under = Object.assign(el('canvas', 'ink under close-up'), { width: region.w, height: region.h });
      for (const c of [canvas, under, ink]) {
        Object.assign(c.style, { left: x / k + 'px', top: y / k + 'px', width: region.w / k + 'px', height: region.h / k + 'px' });
      }
      slot.closeUp?.canvas.remove();
      slot.closeUp?.under.remove();
      slot.closeUp?.ink.remove();
      slot.closeUp = { canvas, under, ink, W: fw, x, y };
      drawFrameInk(ink.getContext('2d')!, slot.frame, this.host.state().ink, aspects, fw, x, y, undefined, under.getContext('2d')!);
      slot.box.insertBefore(canvas, slot.ui ?? null);
      slot.box.insertBefore(under, slot.ui ?? null);
      slot.box.insertBefore(ink, slot.ui ?? null);
    }
  }
}
