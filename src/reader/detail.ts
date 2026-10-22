import type { Aspects, PieceInk } from '../pieces/model';
import type { PageCache } from '../sources/pdf';
import { el } from '../ui/dom';
import { drawFrameInk, regionBands } from './frames';
import type { FrameSlot } from './spread';
import { isZoomed, visiblePart, type Zoom } from './zoom';

/** Wait this long after a pinch or pan settles before drawing the sharp close-up. */
const DETAIL_DELAY_MS = 150;

const dpr = () => window.devicePixelRatio || 1;

export interface DetailHost {
  stage: HTMLElement;
  cache: PageCache;
  aspects: Aspects;
  slots(): FrameSlot[];
  zoom(): Zoom;
  ink(): PieceInk;
}

/**
 * Zoomed in, the frame drawings are stretched and soft. This draws the visible part of each frame
 * again at the zoomed size, on top: the close-up hides the soft music and ink beneath it.
 */
export class Detail {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private seq = 0;

  constructor(private host: DetailHost) {}

  /** The zoom changed: draw close-ups once it settles, or drop them when zoomed out. */
  update() {
    clearTimeout(this.timer);
    if (!isZoomed(this.host.zoom())) { this.drop(); return; }
    this.timer = setTimeout(() => void this.draw(), DETAIL_DELAY_MS);
  }

  drop() {
    this.seq++;
    for (const s of this.host.slots()) {
      s.detail?.canvas.remove();
      s.detail?.ink.remove();
      s.detail = undefined;
    }
  }

  /** Stop drawing for good, as when the reader closes. */
  stop() {
    clearTimeout(this.timer);
    this.seq++;
  }

  private async draw() {
    const seq = ++this.seq;
    const { stage, cache, aspects } = this.host;
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
          const part = await cache.renderRegion(b.p.cut.page + 1, fw, { x, y: b.pageY, w: region.w, h: b.h });
          if (seq !== this.seq) return;
          ctx.drawImage(part, 0, b.destY);
        }
      } catch (e) {
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
      drawFrameInk(ink.getContext('2d')!, slot.frame, this.host.ink(), aspects, fw, x, y);
      slot.box.insertBefore(canvas, slot.ui ?? null);
      slot.box.insertBefore(ink, slot.ui ?? null);
    }
  }
}
