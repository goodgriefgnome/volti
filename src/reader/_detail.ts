// The sharp close-up drawn over the frames while zoomed in.

import { drawFrameInk, regionBands } from '../render/paint';
import { isZoomed, visiblePart } from '../render/zoom';
import { dpr, el } from '../ui/dom';
import type { ReaderView } from './_view';

/** Wait this long after a pinch or pan settles before drawing the sharp close-up. */
const DETAIL_DELAY_MS = 150;

/**
 * Zoomed in, the frame drawings are stretched and soft. This draws the visible part of each frame
 * again at the zoomed size, on top: the close-up hides the soft music and ink beneath it.
 */
export class Detail {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private seq = 0;
  private drawing = new AbortController();

  constructor(private host: ReaderView) {}

  /** The zoom changed: draw close-ups once it settles, or drop them when zoomed out. */
  update() {
    clearTimeout(this.timer);
    if (!isZoomed(this.host.zoom())) { this.drop(); return; }
    this.timer = setTimeout(() => void this.draw(), DETAIL_DELAY_MS);
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
      s.detail?.canvas.remove();
      s.detail?.ink.remove();
      s.detail = undefined;
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
      const canvas = Object.assign(el('canvas', 'detail'), { width: region.w, height: region.h });
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
        console.error(e);
        continue;
      }
      if (seq !== this.seq) return;
      const ink = Object.assign(el('canvas', 'ink detail'), { width: region.w, height: region.h });
      for (const c of [canvas, ink]) {
        Object.assign(c.style, { left: x / k + 'px', top: y / k + 'px', width: region.w / k + 'px', height: region.h / k + 'px' });
      }
      slot.detail?.canvas.remove();
      slot.detail?.ink.remove();
      slot.detail = { canvas, ink, W: fw, x, y };
      drawFrameInk(ink.getContext('2d')!, slot.frame, this.host.state().ink, aspects, fw, x, y);
      slot.box.insertBefore(canvas, slot.ui ?? null);
      slot.box.insertBefore(ink, slot.ui ?? null);
    }
  }
}
