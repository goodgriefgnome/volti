// A score's frames as a strip of thumbnails, all as tall, drawn one after another so the strip
// shows at once: a pinch zooms it, and a finger drags along it. The excerpt picker puts a band over
// each cut; the screen for incoming files shows a file's pages as they are.

import { drawFrame, drawFrameInk } from '../render/paint';
import { scrollForPinch, type Pt } from '../render/zoom';
import { pack, type Frame } from '../scores/frames';
import { type Aspects, type State } from '../scores/model';
import { dpr, el } from '../ui/dom';

/** How tall the thumbnails are, unzoomed, as a share of the screen's height; and how narrow they may get. */
const THUMB_SHARE = 1 / 3;
const MIN_THUMB_W = 112;
/** How far the thumbnails zoom in. */
const MAX_THUMB_ZOOM = 4;
/** A finger that moves this far (CSS pixels) is panning, not tapping. */
const SLOP = 8;

/** A score to show, with its pages. */
export interface ExcerptSource {
  state: State;
  aspects: Aspects;
  /** A page drawn `w` CSS pixels wide: stand-ins first, each closer to the width than the last, then the page itself. */
  pages(page: number, w: number): AsyncIterable<HTMLCanvasElement>;
}

/** A length in the strip, `n` CSS pixels unzoomed: sizes are in --u, so zooming changes one property. */
export const _u = (n: number) => `calc(var(--u) * ${n})`;

/**
 * The score's frames as thumbnails, in boxes to put more over. Pinch to zoom them, and drag to
 * move along them; a click that ends a drag or a pinch doesn't reach what is over them.
 */
export class ThumbStrip {
  readonly el = el('div', 'thumbs excerpt');
  readonly frames: Frame[];
  /** Each frame's box, its thumbnail at the back. */
  readonly boxes: HTMLElement[];
  /** Each frame's thumbnail width unzoomed, in CSS pixels: all are the same height, each its frame's shape. */
  readonly widths: number[];
  /** The width each frame's thumbnail was last drawn at, in CSS pixels; 0 while it draws. */
  private drawnAt: number[];
  /** The thumbnails' zoom, 1 to MAX_THUMB_ZOOM. */
  private s = 1;
  private redrawTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private src: ExcerptSource) {
    const frames = this.frames = pack(src.state.score.cuts, src.aspects);
    const widths = this.widths = frames.map((f) => Math.max(MIN_THUMB_W, Math.round(THUMB_SHARE * window.innerHeight / f.aspect)));
    this.drawnAt = frames.map(() => 0);
    this.boxes = frames.map((f, i) => {
      const box = el('div', 'thumb-frame'), W = widths[i];
      Object.assign(box.style, { width: _u(W), height: _u(W * f.aspect) });
      this.el.append(box);
      return box;
    });
    this.setZoom(1);
    this.listen();

    // Draw the frames one after another, so the strip shows at once: first from the stand-ins at
    // hand, then each as it should be. A frame that can't be drawn from stand-ins waits for the second pass.
    // The strip is put on the page after it is made, so it is only checked for once a frame has drawn.
    void (async () => {
      for (const i of frames.keys()) {
        await this.draw(i, widths[i], true);
        if (!this.el.isConnected) return;
      }
      for (const i of frames.keys()) if (!(await this.draw(i, widths[i]))) return;
    })();
  }

  /** Each page's first yield, then stop drawing it. */
  private async standIn(page: number, w: number): Promise<HTMLCanvasElement> {
    const it = this.src.pages(page, w)[Symbol.asyncIterator]();
    try {
      const r = await it.next();
      if (r.done) throw new Error(`Nothing drawn for page ${page}`);
      return r.value;
    } finally {
      void it.return?.().catch(() => {});
    }
  }

  /** Each page's last yield: the page as it should be. */
  private async exact(page: number, w: number): Promise<HTMLCanvasElement> {
    let last: HTMLCanvasElement | undefined;
    for await (const c of this.src.pages(page, w)) last = c;
    if (!last) throw new Error(`Nothing drawn for page ${page}`);
    return last;
  }

  /**
   * Draw frame i's music and ink `w` CSS pixels wide, from the pages' stand-ins or (not `standIn`)
   * as they should be. False once the strip has gone, or drawing failed; a failure of the second
   * kind leaves what the first drew.
   */
  private async draw(i: number, w: number, standIn = false): Promise<boolean> {
    const { state, aspects } = this.src, f = this.frames[i];
    const pages = [...new Set(f.items.map((p) => p.cut.page))];
    let canvases: HTMLCanvasElement[];
    try {
      canvases = await Promise.all(pages.map((p) => standIn ? this.standIn(p, w) : this.exact(p, w)));
    } catch (e) {
      if (!standIn) console.error(e);
      return false;
    }
    if (!this.el.isConnected) return false;
    const scale = dpr(), W = Math.round(w * scale);
    const byPage = new Map(pages.map((p, k) => [p, canvases[k]]));
    const music = Object.assign(el('canvas'), { width: W, height: Math.round(w * f.aspect * scale) });
    const ink = Object.assign(el('canvas'), { width: W, height: music.height });
    drawFrame(music.getContext('2d', { alpha: false })!, f, W, (p) => byPage.get(p), aspects);
    drawFrameInk(ink.getContext('2d')!, f, state.ink, aspects, W);
    this.boxes[i].querySelectorAll('canvas').forEach((c) => c.remove());
    this.boxes[i].prepend(music, ink);
    if (!standIn) this.drawnAt[i] = w;
    return true;
  }

  private setZoom(s: number) {
    this.s = Math.min(MAX_THUMB_ZOOM, Math.max(1, s));
    this.el.style.setProperty('--u', this.s + 'px');
    this.el.classList.toggle('zoomed', this.s > 1.001);
  }

  /** Once the zoom settles, draw the frames in view sharply enough for it. */
  private redrawSoon() {
    clearTimeout(this.redrawTimer);
    this.redrawTimer = setTimeout(() => void this.redraw(), 200);
  }

  private async redraw() {
    // Widths go in steps, so small pinches don't redraw, and the pages drawn can be reused.
    const step = Math.min(MAX_THUMB_ZOOM, 2 ** Math.ceil(Math.log2(this.s - 0.001)));
    const view = this.el.getBoundingClientRect();
    for (const [i, box] of this.boxes.entries()) {
      const r = box.getBoundingClientRect(), w = this.widths[i] * step;
      if (r.right < view.left - r.width || r.left > view.right + r.width || this.drawnAt[i] >= w || !this.drawnAt[i]) continue;
      if (!this.el.isConnected || !(await this.draw(i, w))) return;
    }
  }

  /** Move along the thumbnails; what they can't scroll themselves scrolls the dialog, as when it fills the screen. */
  private drag(dx: number, dy: number) {
    const strip = this.el, top = strip.scrollTop;
    strip.scrollBy(dx, dy);
    const left = dy - (strip.scrollTop - top);
    if (Math.abs(left) >= 1) strip.closest('.dialog')?.scrollBy(0, left);
  }

  /**
   * One finger drags the strip along, two pinch it. Taps still reach what is over the thumbnails;
   * a drag or a pinch doesn't, so moving about never changes the excerpt.
   */
  private listen() {
    const strip = this.el;
    const at = new Map<number, Pt>();
    /** Where the one finger went down, until it moves far enough to be a drag. */
    let down: Pt | null = null;
    /** The gesture so far has dragged or pinched, so its click is not a tap. */
    let moved = false;
    let pinch: { s0: number; d0: number; c0: Pt; scroll0: Pt } | null = null;
    const local = (p: Pt): Pt => { const r = strip.getBoundingClientRect(); return { x: p.x - r.left, y: p.y - r.top }; };
    const two = () => {
      const [a, b] = [...at.values()];
      return { c: local({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
    };

    strip.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const p = { x: e.clientX, y: e.clientY };
      at.set(e.pointerId, p);
      if (at.size === 1) { moved = false; down = p; }
      if (at.size === 2) {
        moved = true;
        const { c, d } = two();
        pinch = { s0: this.s, d0: d, c0: c, scroll0: { x: strip.scrollLeft, y: strip.scrollTop } };
      }
    });
    strip.addEventListener('pointermove', (e) => {
      const was = at.get(e.pointerId);
      if (!was) return;
      const now = { x: e.clientX, y: e.clientY };
      at.set(e.pointerId, now);
      if (pinch && at.size === 2) {
        const { c, d } = two();
        this.setZoom(pinch.s0 * (d / pinch.d0));
        const to = scrollForPinch(pinch.s0, pinch.scroll0, pinch.c0, this.s, c);
        strip.scrollTo(to.x, to.y);
      } else if (at.size === 1) {
        if (down && Math.hypot(now.x - down.x, now.y - down.y) > SLOP) {
          // A drag: keep it even when the finger leaves the strip.
          moved = true;
          down = null;
          strip.setPointerCapture(e.pointerId);
        }
        if (moved) this.drag(was.x - now.x, was.y - now.y);
      }
    });
    const up = (e: PointerEvent) => {
      if (!at.delete(e.pointerId)) return;
      // The finger left after a pinch drags on from where it is.
      if (pinch && at.size < 2) { pinch = null; this.redrawSoon(); }
    };
    strip.addEventListener('pointerup', up);
    strip.addEventListener('pointercancel', up);
    strip.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); } }, true);
    strip.addEventListener('scroll', () => { if (this.s > 1.001) this.redrawSoon(); }, { passive: true });
    // Ctrl and the wheel, or a trackpad's pinch, zoom too.
    strip.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const c = local({ x: e.clientX, y: e.clientY }), s0 = this.s;
      this.setZoom(s0 * Math.exp(-e.deltaY / 200));
      const to = scrollForPinch(s0, { x: strip.scrollLeft, y: strip.scrollTop }, c, this.s, c);
      strip.scrollTo(to.x, to.y);
      this.redrawSoon();
    }, { passive: false });
  }
}
