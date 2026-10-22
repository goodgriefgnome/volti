// Choosing an excerpt of a score: the score's frames as thumbnails with a band over each cut, and
// the dialog around them. The reader and the library both use it; where the pages come from is
// the caller's business.

import { drawFrame, drawFrameInk } from '../reader/frames';
import { scrollForPinch, type Pt } from '../reader/zoom';
import { pack, placeLabel, places, type Frame, type Place } from '../scores/frames';
import { frameHeight, type Aspects, type State } from '../scores/model';
import { spanFor, spanLabel, spanOf, type Span } from '../setlists/model';
import { button, el } from './dom';
import { buttonRow, closeOverlay, showDialog } from './overlay';

const THUMB_W = 112;
/** How far the thumbnails zoom in. */
const MAX_THUMB_ZOOM = 4;
/** A finger that moves this far (CSS pixels) is panning, not tapping. */
const SLOP = 8;

/** A score to choose from, with its pages. */
export interface ExcerptSource {
  state: State;
  aspects: Aspects;
  /** A page drawn `w` CSS pixels wide. */
  page(page: number, w: number): Promise<HTMLCanvasElement>;
}

/**
 * The score's frames as thumbnails, with each cut a band over them. Tap the first cut to play,
 * then the last, as when choosing pages to insert. Cuts outside the excerpt are shaded. Pinch to
 * zoom the thumbnails, and drag to move along them.
 */
export class ExcerptStrip {
  readonly el = el('div', 'thumbs excerpt');
  /** Says what is chosen, and what a tap does next. */
  readonly hint = el('p', 'hint');
  private i0: number;
  private i1: number;
  private pending: number | null = null;
  private bands: HTMLButtonElement[] = [];
  private n: number;
  private frames: Frame[];
  /** Each cut's page and letter, for naming it. */
  private places: Place[];
  private boxes: HTMLElement[];
  /** The width each frame's thumbnail was last drawn at, in CSS pixels; 0 while it draws. */
  private drawnAt: number[];
  /** The thumbnails' zoom, 1 to MAX_THUMB_ZOOM. */
  private s = 1;
  private redrawTimer: ReturnType<typeof setTimeout> | undefined;

  /** `verb` starts the hint: "Plays the whole score." */
  constructor(private src: ExcerptSource, span: Span, private verb = 'Plays', private onChange: () => void = () => {}) {
    const { state, aspects } = src, cuts = state.score.cuts;
    this.n = cuts.length;
    ({ i0: this.i0, i1: this.i1 } = spanOf(cuts, span));
    this.hint.setAttribute('aria-live', 'polite');

    // Sizes are in --u, a CSS pixel times the zoom, so zooming changes one property.
    const fh = THUMB_W * frameHeight(aspects);
    const u = (n: number) => `calc(var(--u) * ${n})`;
    const frames = this.frames = pack(cuts, aspects);
    this.places = places(cuts, aspects);
    this.drawnAt = frames.map(() => 0);
    this.boxes = frames.map((f) => {
      const box = el('div', 'thumb-frame');
      Object.assign(box.style, { width: u(THUMB_W), height: u(fh) });
      for (const p of f.items) {
        const b = el('button', 'band');
        b.type = 'button';
        const at = placeLabel(this.places[p.index]);
        b.dataset.n = at;
        Object.assign(b.style, { top: u(p.top * THUMB_W), height: u(p.h * THUMB_W) });
        b.setAttribute('aria-label', `Page ${at}, from original page ${p.cut.page + 1}`);
        b.addEventListener('click', () => this.tap(p.index));
        this.bands[p.index] = b;
        box.append(b);
      }
      this.el.append(box);
      return box;
    });
    this.setZoom(1);
    this.listen();

    // Draw the frames one after another, so the strip shows at once.
    void (async () => {
      for (const i of frames.keys()) if (!(await this.draw(i, THUMB_W))) return;
    })();
    this.sync();
  }

  /** The span chosen. */
  get span(): Span { return spanFor(this.src.state.score.cuts, this.i0, this.i1); }

  get whole() { return this.i0 === 0 && this.i1 === this.n - 1; }

  /** Choose a span, as if its first and last cut had been tapped. */
  set(span: Span) {
    ({ i0: this.i0, i1: this.i1 } = spanOf(this.src.state.score.cuts, span));
    this.pending = null;
    this.sync();
  }

  /** Bring the chosen cuts into view, once the strip is on the screen. */
  reveal() {
    this.bands[this.i0]?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  private tap(k: number) {
    if (this.pending === null) { this.pending = this.i0 = this.i1 = k; } else { this.i0 = Math.min(this.pending, k); this.i1 = Math.max(this.pending, k); this.pending = null; }
    this.sync();
  }

  private sync() {
    const { i0, i1, pending } = this, { state, aspects } = this.src;
    this.bands.forEach((b, k) => {
      b.classList.toggle('out', k < i0 || k > i1);
      b.classList.toggle('pending', k === pending);
      b.setAttribute('aria-pressed', String(k >= i0 && k <= i1));
    });
    const label = spanLabel(state.score.cuts, this.span, aspects);
    const what = label ? label[0].toLowerCase() + label.slice(1) : 'the whole score';
    this.hint.textContent = pending === null
      ? `${this.verb} ${what}. Tap the first cut to play, then the last.`
      : `Starts at page ${placeLabel(this.places[pending])}. Now tap the last cut to play.`;
    this.onChange();
  }

  /** Draw frame i's music and ink `w` CSS pixels wide. False once the strip has gone, or drawing failed. */
  private async draw(i: number, w: number): Promise<boolean> {
    const { state, aspects } = this.src, f = this.frames[i];
    const pages = [...new Set(f.items.map((p) => p.cut.page))];
    let canvases: HTMLCanvasElement[];
    try {
      canvases = await Promise.all(pages.map((p) => this.src.page(p, w)));
    } catch (e) {
      console.error(e);
      return false;
    }
    if (!this.el.isConnected) return false;
    const scale = window.devicePixelRatio || 1, W = Math.round(w * scale);
    const byPage = new Map(pages.map((p, k) => [p, canvases[k]]));
    const music = Object.assign(el('canvas'), { width: W, height: Math.round(w * frameHeight(aspects) * scale) });
    const ink = Object.assign(el('canvas'), { width: W, height: music.height });
    drawFrame(music.getContext('2d', { alpha: false })!, f, W, (p) => byPage.get(p), aspects);
    drawFrameInk(ink.getContext('2d')!, f, state.ink, aspects, W);
    this.boxes[i].querySelectorAll('canvas').forEach((c) => c.remove());
    this.boxes[i].prepend(music, ink);
    this.drawnAt[i] = w;
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
    const w = THUMB_W * Math.min(MAX_THUMB_ZOOM, 2 ** Math.ceil(Math.log2(this.s - 0.001)));
    const view = this.el.getBoundingClientRect();
    for (const [i, box] of this.boxes.entries()) {
      const r = box.getBoundingClientRect();
      if (r.right < view.left - r.width || r.left > view.right + r.width || this.drawnAt[i] >= w || !this.drawnAt[i]) continue;
      if (!this.el.isConnected || !(await this.draw(i, w))) return;
    }
  }

  /**
   * One finger drags the strip along, two pinch it. Taps still reach the bands; a drag or a
   * pinch doesn't, so moving about never changes the excerpt.
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
        if (moved) strip.scrollBy(was.x - now.x, was.y - now.y);
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

export interface ExcerptPicker extends ExcerptSource {
  question: string;
  span: Span;
  /** Starts the hint, such as "This entry plays". */
  verb?: string;
  /** Ask for a name too, starting with this one. */
  name?: string;
  /** Why the span (and name) can't be taken as they are, said in the dialog; null when they can. */
  problem?(span: Span, name: string): string | null;
  okLabel?: string;
  done(span: Span, name: string): void;
}

/** A dialog for choosing which of a score's cuts to play, and perhaps naming them. */
export function openExcerptPicker(h: ExcerptPicker) {
  const d = showDialog(h.question, 'wide');
  const strip = new ExcerptStrip(h, h.span, h.verb);
  const input = el('input', 'name');
  input.type = 'text';
  input.value = h.name ?? '';
  input.placeholder = 'For example, Kyrie';
  input.setAttribute('aria-label', 'Excerpt name');
  input.hidden = h.name === undefined;
  const error = el('p', 'hint error');
  error.setAttribute('aria-live', 'polite');
  const ok = () => {
    const why = h.problem?.(strip.span, input.value) ?? null;
    error.textContent = why ?? '';
    if (why) return;
    closeOverlay();
    h.done(strip.span, input.value.trim());
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  const whole = button('Whole score', () => strip.set({}));
  const done = button(h.okLabel ?? 'Done', ok, 'primary');
  d.append(input, strip.el, strip.hint, error, buttonRow(whole, el('span', 'grow'), button('Cancel', closeOverlay), done));
  strip.reveal();
  (input.hidden ? done : input).focus();
}
