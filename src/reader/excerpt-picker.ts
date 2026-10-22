// The dialog for choosing which of a piece's cuts a setlist entry plays.

import { pack } from '../pieces/frames';
import { frameHeight, type Aspects, type State } from '../pieces/model';
import { spanFor, spanOf, type Span } from '../setlists/model';
import { button, el } from '../ui/dom';
import { buttonRow, closeOverlay, showDialog } from '../ui/overlay';
import { drawFrame, drawFrameInk } from './frames';

const THUMB_W = 112;

export interface ExcerptHost {
  question: string;
  state: State;
  aspects: Aspects;
  span: Span;
  /** A page drawn `w` CSS pixels wide. */
  page(page: number, w: number): Promise<HTMLCanvasElement>;
  done(span: Span): void;
}

/**
 * The piece's frames as thumbnails, with each cut a band over them. Tap the first cut to play,
 * then the last, as when choosing pages to insert. Cuts outside the excerpt are shaded.
 */
export function openExcerptPicker(h: ExcerptHost) {
  const { state, aspects } = h, cuts = state.piece.cuts, n = cuts.length;
  let { i0, i1 } = spanOf(cuts, h.span);
  let pending: number | null = null;

  const d = showDialog(h.question, 'wide');
  const strip = el('div', 'thumbs excerpt');
  const bands: HTMLButtonElement[] = [];
  const hint = el('p', 'hint');
  hint.setAttribute('aria-live', 'polite');

  const pick = (k: number) => {
    if (pending === null) { pending = i0 = i1 = k; } else { i0 = Math.min(pending, k); i1 = Math.max(pending, k); pending = null; }
    sync();
  };

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
      b.addEventListener('click', () => pick(p.index));
      bands[p.index] = b;
      box.append(b);
    }
    strip.append(box);
    return box;
  });

  // Draw the frames one after another, so the dialog opens at once.
  void (async () => {
    for (const [i, f] of frames.entries()) {
      const pages = [...new Set(f.items.map((p) => p.cut.page))];
      let canvases: HTMLCanvasElement[];
      try {
        canvases = await Promise.all(pages.map((p) => h.page(p, THUMB_W)));
      } catch (e) {
        console.error(e);
        return;
      }
      if (!d.isConnected) return;
      const byPage = new Map(pages.map((p, k) => [p, canvases[k]]));
      const music = Object.assign(el('canvas'), { width: W, height: Math.round(fh * scale) });
      const ink = Object.assign(el('canvas'), { width: W, height: music.height });
      drawFrame(music.getContext('2d', { alpha: false })!, f, W, (p) => byPage.get(p), aspects);
      drawFrameInk(ink.getContext('2d')!, f, state.ink, aspects, W);
      boxes[i].prepend(music, ink);
    }
  })();

  const sync = () => {
    bands.forEach((b, k) => {
      b.classList.toggle('out', k < i0 || k > i1);
      b.classList.toggle('pending', k === pending);
      b.setAttribute('aria-pressed', String(k >= i0 && k <= i1));
    });
    const a = cuts[i0].page + 1, z = cuts[i1].page + 1;
    const what = i0 === 0 && i1 === n - 1 ? 'the whole piece' : `cuts ${i0 + 1}–${i1 + 1} of ${n}, from page ${a} to page ${z}`;
    hint.textContent = pending === null
      ? `Plays ${what}. Tap the first cut to play, then the last.`
      : `Starts at cut ${pending + 1}. Now tap the last cut to play.`;
  };
  sync();

  const whole = button('Whole piece', () => { i0 = 0; i1 = n - 1; pending = null; sync(); });
  const done = button('Done', () => { closeOverlay(); h.done(spanFor(cuts, i0, i1)); }, 'primary');
  d.append(strip, hint, buttonRow(whole, el('span', 'grow'), button('Cancel', closeOverlay), done));
  bands[i0]?.scrollIntoView({ inline: 'center', block: 'nearest' });
  done.focus();
}
