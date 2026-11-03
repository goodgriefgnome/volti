// The loupe shown while a symbol or text is dragged: the music around it, magnified, above the
// finger.

import { dpr, el } from '../ui/dom';
import type { Marking } from '../markings/model';
import { drawFrameInk, regionBands } from '../render/paint';
import type { ScoreInk } from '../scores/model';
import type { FrameSlot } from './_spread';
import type { ReaderView } from './_view';

/** The loupe's diameter, and the height the score's staff (one em of a music font) is shown at in it, in CSS px. */
export const LOUPE_PX = 128;
export const LOUPE_STAFF_PX = 64;
/** The gap between the finger and the loupe's bottom edge, in CSS px. */
export const LOUPE_GAP_PX = 56;

/** How much to magnify: the staff (`staffPx` tall on screen) shown LOUPE_STAFF_PX tall, but never smaller than on screen. */
export const magnification = (staffPx: number) => Math.max(1, LOUPE_STAFF_PX / staffPx);

/** The point of an ink box (screen px) the loupe centres on: its middle. */
export function loupeTarget(ink: { x0: number; y0: number; x1: number; y1: number }): { x: number; y: number } {
  return { x: (ink.x0 + ink.x1) / 2, y: (ink.y0 + ink.y1) / 2 };
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

/** The most device pixels across a sharp region drawn for the loupe. */
const SHARP_MAX_PX = 2048;
/** Sharp music is drawn this far (CSS px) beyond what the loupe shows, each way. */
const SHARP_REACH_PX = 256;
/** Sharp music is asked for once the finger has held still this long (ms), so drawing it never holds up a frame while the finger moves. */
export const SHARP_HOLD_MS = 150;
/** A new region is asked for when the loupe's area comes this near (CSS px) the edge of the one drawn. */
const SHARP_EDGE_PX = 64;

/**
 * How far across (CSS px) a sharp region is drawn at magnification `m` and `d` device pixels per
 * CSS pixel: SHARP_REACH_PX each way beyond the `shown` the loupe covers, but at most SHARP_MAX_PX.
 */
export const sharpSide = (shown: number, m: number, d: number) => Math.min(shown + 2 * SHARP_REACH_PX, SHARP_MAX_PX / (m * d));

/**
 * Whether the region for a loupe at magnification `m` is as big as SHARP_MAX_PX allows, in that
 * it can't keep the loupe SHARP_EDGE_PX from its edge: above about `16 / d - 1` magnification.
 * Asking again would only shift an equally small region, over and over as the finger moves.
 */
export const sharpIsFull = (m: number, d: number) => (sharpSide(LOUPE_PX / m, m, d) - LOUPE_PX / m) / 2 <= SHARP_EDGE_PX;

/** Music drawn sharp for a slot: the region of its frame (x in frame widths, y in frame widths from its top) and its pixels. */
interface Sharp { canvas: HTMLCanvasElement; x0: number; y0: number; x1: number; y1: number }

/** The ink to draw sharp: the state's, and a marking being dragged (on its slot). */
export interface SharpInk { ink: ScoreInk; extra?: { slot: FrameSlot; mark: Marking } }

export class Loupe {
  private canvas: HTMLCanvasElement | undefined;
  private m = 1;
  private sharp = new Map<FrameSlot, Sharp>();
  private asking = new Map<FrameSlot, AbortController>();
  private hold: ReturnType<typeof setTimeout> | undefined;
  /** The slots (and their boxes) the last frame shown has no sharp region for, to ask for once the finger holds still. */
  private lacking: [FrameSlot, DOMRect][] = [];
  private inkCanvas: HTMLCanvasElement | undefined;
  private underCanvas: HTMLCanvasElement | undefined;
  private last: [readonly FrameSlot[], { x: number; y: number }, { x: number; y: number }, SharpInk | undefined] | undefined;

  constructor(private root: HTMLElement, private view: Pick<ReaderView, 'draw' | 'aspects'>) {}

  /** Start: magnification fixed from the score's staff height on screen. */
  begin(staffPx: number): void {
    this.m = magnification(staffPx);
    this.forget();
    if (this.canvas) return;
    const d = dpr();
    this.canvas = Object.assign(el('canvas', 'loupe'), { width: Math.round(LOUPE_PX * d), height: Math.round(LOUPE_PX * d) });
    this.canvas.style.width = this.canvas.style.height = LOUPE_PX + 'px';
    this.canvas.hidden = true;
    this.root.append(this.canvas);
  }

  /**
   * Show the area around screen point `target` with the finger at `finger`; draws from the slots'
   * canvases, and from sharper music and (given `ink`) ink once those have been drawn; sharp
   * music is asked for only after the finger has held still for SHARP_HOLD_MS.
   */
  show(slots: readonly FrameSlot[], target: { x: number; y: number }, finger: { x: number; y: number }, ink?: SharpInk): void {
    // The finger moved: stop drawing a region, and ask for the next one only when it holds still.
    this.abortAsking();
    clearTimeout(this.hold);
    this.render(slots, target, finger, ink);
    if (this.lacking.length) {
      this.hold = setTimeout(() => {
        for (const [slot, b] of this.lacking) this.ask(slot, target, b);
        this.lacking = [];
      }, SHARP_HOLD_MS);
    }
  }

  private render(slots: readonly FrameSlot[], target: { x: number; y: number }, finger: { x: number; y: number }, ink?: SharpInk): void {
    const canvas = this.canvas, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    this.last = [slots, target, finger, ink];
    this.lacking = [];
    const r = LOUPE_PX / 2, d = dpr(), m = this.m, half = r / m;
    const bar = this.root.querySelector('.bar')?.getBoundingClientRect().bottom ?? 0;
    const c = loupeCentre(finger, bar, innerWidth);
    canvas.style.left = c.x - r + 'px';
    canvas.style.top = c.y - r + 'px';
    canvas.hidden = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const put = (from: HTMLCanvasElement) => {
      const b = from.getBoundingClientRect();
      ctx.drawImage(from, b.left, b.top, b.width, b.height);
    };
    // What multiplies goes over the music multiplied, as the page's CSS does.
    const putUnder = (from: HTMLCanvasElement) => {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      put(from);
      ctx.restore();
    };
    for (const slot of slots) {
      const b = slot.box.getBoundingClientRect(), w = b.width;
      // The loupe's area on this slot's frame, clipped to it; nothing of it is on a slot it misses.
      const area = {
        x0: Math.max(0, (target.x - half - b.left) / w), y0: Math.max(0, (target.y - half - b.top) / w),
        x1: Math.min(1, (target.x + half - b.left) / w), y1: Math.min(b.height / w, (target.y + half - b.top) / w),
      };
      if (area.x1 <= area.x0 || area.y1 <= area.y0) continue;
      const sharp = this.sharp.get(slot);
      const edge = SHARP_EDGE_PX / w;
      const covered = sharp && area.x0 >= sharp.x0 + (sharp.x0 > 0 ? edge : 0) && area.y0 >= sharp.y0 + (sharp.y0 > 0 ? edge : 0)
        && area.x1 <= sharp.x1 - (sharp.x1 < 1 ? edge : 0) && area.y1 <= sharp.y1 - (sharp.y1 < b.height / w ? edge : 0);
      // Where the region is as big as it can be, a new one only shifts it, and is drawn again and again as the finger moves: keep it, and show the softer copy past its edge.
      if (!covered && !(sharp && sharpIsFull(m, d))) this.lacking.push([slot, b]);
      ctx.setTransform(m * d, 0, 0, m * d, (r - target.x * m) * d, (r - target.y * m) * d);
      if (sharp && area.x0 >= sharp.x0 && area.y0 >= sharp.y0 && area.x1 <= sharp.x1 && area.y1 <= sharp.y1) {
        ctx.drawImage(sharp.canvas, b.left + sharp.x0 * w, b.top + sharp.y0 * w, (sharp.x1 - sharp.x0) * w, (sharp.y1 - sharp.y0) * w);
        if (ink) this.drawInk(ctx, slot, b, target, ink);
        else { putUnder(slot.under); put(slot.ink); }
      } else {
        // As they are stacked on the screen: music, ink, then the close-up's music and ink.
        put(slot.canvas);
        putUnder(slot.under);
        put(slot.ink);
        const detail = slot.detail;
        if (detail?.canvas.isConnected) { put(detail.canvas); putUnder(detail.under); put(detail.ink); }
      }
    }
  }

  /** The slot's ink, sharp, over the loupe: drawn as if its frame were as wide as the loupe shows it, offset to the loupe's area. */
  private drawInk(ctx: CanvasRenderingContext2D, slot: FrameSlot, b: DOMRect, target: { x: number; y: number }, ink: SharpInk) {
    const d = dpr(), m = this.m, r = LOUPE_PX / 2, side = Math.round(LOUPE_PX * d);
    const own = this.inkCanvas ??= Object.assign(el('canvas'), { width: side, height: side });
    const lower = this.underCanvas ??= Object.assign(el('canvas'), { width: side, height: side });
    const W = b.width * m * d;
    const ox = (target.x - b.left) * m * d - r * d, oy = (target.y - b.top) * m * d - r * d;
    drawFrameInk(own.getContext('2d')!, slot.frame, ink.ink, this.view.aspects(), W, ox, oy, ink.extra?.slot === slot ? ink.extra.mark : undefined, lower.getContext('2d')!);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(lower, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(own, 0, 0);
    ctx.restore();
  }

  /** Draw music for a region around `target` on the slot at `b`, sharp at the loupe's magnification; the loupe shows it when it is done. */
  private ask(slot: FrameSlot, target: { x: number; y: number }, b: DOMRect) {
    // One at a time; a finger that moves on aborts it (`show`), and the next is asked for when it holds still again.
    if (this.asking.has(slot)) return;
    const control = new AbortController();
    this.asking.set(slot, control);
    const d = dpr(), m = this.m, w = b.width, W = Math.round(w * m * d);
    // Around what the loupe shows, as far as 256 px each way, in a canvas of at most SHARP_MAX_PX.
    const shown = LOUPE_PX / m, side = sharpSide(shown, m, d), reach = (side - shown) / 2 + shown / 2;
    const x0 = Math.max(0, (target.x - reach - b.left) / w), y0 = Math.max(0, (target.y - reach - b.top) / w);
    const x1 = Math.min(1, (target.x + reach - b.left) / w), y1 = Math.min(b.height / w, (target.y + reach - b.top) / w);
    const region = { x: Math.floor(x0 * W), y: Math.floor(y0 * W), w: 0, h: 0 };
    region.w = Math.ceil(x1 * W) - region.x;
    region.h = Math.ceil(y1 * W) - region.y;
    if (region.w <= 0 || region.h <= 0) return;
    void (async () => {
      const canvas = Object.assign(el('canvas'), { width: region.w, height: region.h });
      const ctx = canvas.getContext('2d', { alpha: false })!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, region.w, region.h);
      try {
        for (const band of regionBands(slot.frame, W, this.view.aspects(), region)) {
          const part = await this.view.draw()(band.p.cut.page + 1, W, { crop: { x: region.x, y: band.pageY, w: region.w, h: band.h }, priority: 'ahead', signal: control.signal });
          if (control.signal.aborted) return;
          ctx.drawImage(part.canvas, 0, band.destY, region.w, band.h);
        }
      } catch (e) {
        if (!control.signal.aborted) { console.error(e); this.asking.delete(slot); }
        return;
      }
      if (control.signal.aborted) return;
      this.asking.delete(slot);
      this.sharp.set(slot, { canvas, x0: region.x / W, y0: region.y / W, x1: (region.x + region.w) / W, y1: (region.y + region.h) / W });
      if (this.last) this.render(...this.last);
    })();
  }

  /** Abort the regions being drawn. */
  private abortAsking() {
    for (const c of this.asking.values()) c.abort();
    this.asking.clear();
  }

  /** Drop the sharp music, and stop drawing it. */
  private forget() {
    clearTimeout(this.hold);
    this.lacking = [];
    this.abortAsking();
    this.sharp.clear();
    this.last = undefined;
  }

  end(): void {
    this.forget();
    this.canvas?.remove();
    this.canvas = undefined;
  }
}
