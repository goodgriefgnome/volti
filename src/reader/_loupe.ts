// The loupe shown while a symbol or text is dragged: the music around it, magnified, above the
// finger.

import { dpr, el } from '../ui/dom';
import type { FrameSlot } from './_spread';

/** The loupe's diameter, and the height the dragged marking's ink is shown at in it, in CSS px. */
export const LOUPE_PX = 128;
export const LOUPE_INK_PX = 48;
/** The gap between the finger and the loupe's bottom edge, in CSS px. */
export const LOUPE_GAP_PX = 56;

/** How much to magnify: the ink shown LOUPE_INK_PX tall, but never smaller than on screen. */
export const magnification = (inkPx: number) => Math.max(1, LOUPE_INK_PX / inkPx);

/** The point of an ink box (screen px) the loupe centres on: h/2 in from its top, left and bottom; across, its middle when it is narrower than tall. */
export function loupeTarget(ink: { x0: number; y0: number; x1: number; y1: number }): { x: number; y: number } {
  const h = ink.y1 - ink.y0;
  return { x: ink.x1 - ink.x0 < h ? (ink.x0 + ink.x1) / 2 : ink.x0 + h / 2, y: ink.y0 + h / 2 };
}

/** Where the loupe's centre goes for a finger at `f`: above it, or beside it when that would be under `barBottom`; kept on the screen `W` wide. */
export function loupeCentre(f: { x: number; y: number }, barBottom: number, W: number): { x: number; y: number } {
  const r = LOUPE_PX / 2, within = (x: number) => Math.min(Math.max(x, r), W - r);
  const y = f.y - LOUPE_GAP_PX - r;
  if (y - r >= barBottom) return { x: within(f.x), y };
  // Beside the finger, at its height: to the left, or to the right when there is no room.
  const side = r + LOUPE_GAP_PX, left = f.x - side;
  return { x: left - r >= 0 ? left : within(f.x + side), y: f.y };
}

export class Loupe {
  private canvas: HTMLCanvasElement | undefined;
  private m = 1;

  constructor(private root: HTMLElement) {}

  /** Start: magnification fixed from the marking's ink height on screen. */
  begin(inkPx: number): void {
    this.m = magnification(inkPx);
    if (this.canvas) return;
    const d = dpr();
    this.canvas = Object.assign(el('canvas', 'loupe'), { width: Math.round(LOUPE_PX * d), height: Math.round(LOUPE_PX * d) });
    this.canvas.style.width = this.canvas.style.height = LOUPE_PX + 'px';
    this.canvas.hidden = true;
    this.root.append(this.canvas);
  }

  /** Show the area around screen point `target` with the finger at `finger`; draws from the slots' canvases. */
  show(slots: readonly FrameSlot[], target: { x: number; y: number }, finger: { x: number; y: number }): void {
    const canvas = this.canvas, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const r = LOUPE_PX / 2, d = dpr(), m = this.m;
    const bar = this.root.querySelector('.bar')?.getBoundingClientRect().bottom ?? 0;
    const c = loupeCentre(finger, bar, innerWidth);
    canvas.style.left = c.x - r + 'px';
    canvas.style.top = c.y - r + 'px';
    canvas.hidden = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(m * d, 0, 0, m * d, (r - target.x * m) * d, (r - target.y * m) * d);
    const put = (from: HTMLCanvasElement) => {
      const b = from.getBoundingClientRect();
      ctx.drawImage(from, b.left, b.top, b.width, b.height);
    };
    // As they are stacked on the screen: music, ink, then the close-up's music and ink.
    for (const slot of slots) {
      put(slot.canvas);
      put(slot.ink);
      const detail = slot.detail;
      if (detail?.canvas.isConnected) { put(detail.canvas); put(detail.ink); }
    }
  }

  end(): void {
    this.canvas?.remove();
    this.canvas = undefined;
  }
}
