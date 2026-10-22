// Choosing an excerpt of a score: the score's frames as thumbnails with a band over each cut, and
// the dialog around them. The reader and the library both use it; where the pages come from is
// the caller's business.

import { drawFrame, drawFrameInk } from '../reader/frames';
import { pack } from '../scores/frames';
import { frameHeight, type Aspects, type State } from '../scores/model';
import { spanFor, spanOf, type Span } from '../setlists/model';
import { button, el } from './dom';
import { buttonRow, closeOverlay, showDialog } from './overlay';

const THUMB_W = 112;

/** A score to choose from, with its pages. */
export interface ExcerptSource {
  state: State;
  aspects: Aspects;
  /** A page drawn `w` CSS pixels wide. */
  page(page: number, w: number): Promise<HTMLCanvasElement>;
}

/**
 * The score's frames as thumbnails, with each cut a band over them. Tap the first cut to play,
 * then the last, as when choosing pages to insert. Cuts outside the excerpt are shaded.
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

  constructor(private src: ExcerptSource, span: Span, private onChange: () => void = () => {}) {
    const { state, aspects } = src, cuts = state.score.cuts;
    this.n = cuts.length;
    ({ i0: this.i0, i1: this.i1 } = spanOf(cuts, span));
    this.hint.setAttribute('aria-live', 'polite');

    const frames = pack(cuts, aspects);
    const fh = THUMB_W * frameHeight(aspects), scale = window.devicePixelRatio || 1;
    const W = Math.round(THUMB_W * scale);
    const boxes = frames.map((f) => {
      const box = el('div', 'thumb-frame');
      Object.assign(box.style, { width: THUMB_W + 'px', height: fh + 'px' });
      for (const p of f.items) {
        const b = el('button', 'band');
        b.type = 'button';
        b.dataset.n = String(p.index + 1);
        Object.assign(b.style, { top: p.top * THUMB_W + 'px', height: p.h * THUMB_W + 'px' });
        b.setAttribute('aria-label', `Cut ${p.index + 1}, from page ${p.cut.page + 1}`);
        b.addEventListener('click', () => this.tap(p.index));
        this.bands[p.index] = b;
        box.append(b);
      }
      this.el.append(box);
      return box;
    });

    // Draw the frames one after another, so the strip shows at once.
    void (async () => {
      for (const [i, f] of frames.entries()) {
        const pages = [...new Set(f.items.map((p) => p.cut.page))];
        let canvases: HTMLCanvasElement[];
        try {
          canvases = await Promise.all(pages.map((p) => src.page(p, THUMB_W)));
        } catch (e) {
          console.error(e);
          return;
        }
        if (!this.el.isConnected) return;
        const byPage = new Map(pages.map((p, k) => [p, canvases[k]]));
        const music = Object.assign(el('canvas'), { width: W, height: Math.round(fh * scale) });
        const ink = Object.assign(el('canvas'), { width: W, height: music.height });
        drawFrame(music.getContext('2d', { alpha: false })!, f, W, (p) => byPage.get(p), aspects);
        drawFrameInk(ink.getContext('2d')!, f, state.ink, aspects, W);
        boxes[i].prepend(music, ink);
      }
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
    const { i0, i1, pending, n } = this, cuts = this.src.state.score.cuts;
    this.bands.forEach((b, k) => {
      b.classList.toggle('out', k < i0 || k > i1);
      b.classList.toggle('pending', k === pending);
      b.setAttribute('aria-pressed', String(k >= i0 && k <= i1));
    });
    const a = cuts[i0].page + 1, z = cuts[i1].page + 1;
    const what = this.whole ? 'the whole score' : `cuts ${i0 + 1}–${i1 + 1} of ${n}, from page ${a} to page ${z}`;
    this.hint.textContent = pending === null
      ? `Plays ${what}. Tap the first cut to play, then the last.`
      : `Starts at cut ${pending + 1}. Now tap the last cut to play.`;
    this.onChange();
  }
}

export interface ExcerptPicker extends ExcerptSource {
  question: string;
  span: Span;
  done(span: Span): void;
}

/** A dialog for choosing which of a score's cuts to play. */
export function openExcerptPicker(h: ExcerptPicker) {
  const d = showDialog(h.question, 'wide');
  const strip = new ExcerptStrip(h, h.span);
  const whole = button('Whole score', () => strip.set({}));
  const done = button('Done', () => { closeOverlay(); h.done(strip.span); }, 'primary');
  d.append(strip.el, strip.hint, buttonRow(whole, el('span', 'grow'), button('Cancel', closeOverlay), done));
  strip.reveal();
  done.focus();
}
