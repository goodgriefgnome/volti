// Choosing an excerpt of a score: the score's frames as thumbnails with a band over each cut, and
// the dialog around them. The reader and the library both use it; where the pages come from is
// the caller's business.

import { type Span, nameOf, sortedNames, spanFor, spanLabel, spanOf } from '../scores/excerpts';
import { placeLabel, places, type Place } from '../scores/frames';
import { type Score } from '../scores/model';
import { button, el } from '../ui/dom';
import { buttonRow, closeOverlay, showDialog } from '../ui/overlay';
import { ThumbStrip, _u, type ExcerptSource } from './thumb-strip';

/**
 * The score's frames as thumbnails, with each cut a band over them. Tap the first cut to play,
 * then the last, as when choosing pages to insert. Cuts outside the excerpt are shaded. Pinch to
 * zoom the thumbnails, and drag to move along them.
 */
export class _ExcerptStrip {
  readonly el: HTMLElement;
  /** Says what is chosen, and what a tap does next. */
  readonly hint = el('p', 'hint');
  private i0: number;
  private i1: number;
  private pending: number | null = null;
  private bands: HTMLButtonElement[] = [];
  private n: number;
  /** Each cut's page and letter, for naming it. */
  private places: Place[];

  /** Called whenever the span chosen changes, or a tap starts choosing a new one. */
  onChange: () => void = () => {};

  /** `verb` starts the hint: "Plays the whole score." */
  constructor(private src: ExcerptSource, span: Span, private verb = 'Plays') {
    const { state, aspects } = src, cuts = state.score.cuts;
    this.n = cuts.length;
    ({ i0: this.i0, i1: this.i1 } = spanOf(cuts, span));
    this.hint.setAttribute('aria-live', 'polite');

    const strip = new ThumbStrip(src);
    this.el = strip.el;
    this.places = places(cuts, aspects);
    strip.frames.forEach((f, i) => {
      const W = strip.widths[i];
      for (const p of f.items) {
        const b = el('button', 'band');
        b.type = 'button';
        const at = placeLabel(this.places[p.index]);
        b.dataset.n = at;
        Object.assign(b.style, { top: _u(p.top * W), height: _u(p.h * W) });
        b.setAttribute('aria-label', `Page ${at}, from original page ${p.cut.page + 1}`);
        b.addEventListener('click', () => this.tap(p.index));
        this.bands[p.index] = b;
        strip.boxes[i].append(b);
      }
    });
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

  /** Whether a tap has started a new span, which a second tap will finish. */
  get choosing() { return this.pending !== null; }

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
    const label = spanLabel(state.score.cuts, this.span, aspects), name = nameOf(state.score, this.span)?.name;
    const pages = label ? label[0].toLowerCase() + label.slice(1) : 'the whole score';
    const what = name ? `“${name}”, ${pages}` : pages;
    this.hint.textContent = pending === null
      ? `${this.verb} ${what}. Tap the first cut to play, then the last.`
      : `Starts at page ${placeLabel(this.places[pending])}. Now tap the last cut to play.`;
    this.onChange();
  }
}

/**
 * A dropdown of the score's named excerpts, with Whole score and Custom: choosing one selects its
 * cuts in the strip, and tapping cuts shows the name of the span they make, if it has one.
 */
export function _namedExcerptMenu(strip: _ExcerptStrip, score: Score): HTMLSelectElement {
  const names = sortedNames(score);
  const menu = el('select', 'excerpt-menu');
  menu.setAttribute('aria-label', 'Named excerpt');
  const option = (value: string, label: string) => Object.assign(el('option'), { value, textContent: label });
  menu.append(option('whole', 'Whole score'), ...names.map((n, i) => option(String(i), n.name)), option('custom', 'Custom'));
  const follow = () => {
    const n = nameOf(score, strip.span);
    menu.value = strip.choosing ? 'custom' : strip.whole ? 'whole' : n ? String(names.indexOf(n)) : 'custom';
  };
  menu.addEventListener('change', () => {
    if (menu.value === 'whole') strip.set({});
    else if (menu.value !== 'custom') { strip.set(names[+menu.value]); strip.reveal(); }
  });
  const before = strip.onChange;
  strip.onChange = () => { before(); follow(); };
  follow();
  return menu;
}

export interface _ExcerptPicker extends ExcerptSource {
  question: string;
  span: Span;
  /** Starts the hint, such as "This entry plays". */
  verb?: string;
  /** Ask for a name too, starting with this one. */
  name?: string;
  /** Offer the whole score and its named excerpts in a dropdown. */
  named?: boolean;
  /** Why the span (and name) can't be taken as they are, said in the dialog; null when they can. */
  problem?(span: Span, name: string): string | null;
  okLabel?: string;
  done(span: Span, name: string): void;
}

/** A dialog for choosing which of a score's cuts to play, and perhaps naming them. */
export function openExcerptPicker(h: _ExcerptPicker) {
  const d = showDialog(h.question, 'wide');
  const strip = new _ExcerptStrip(h, h.span, h.verb);
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
  const done = button(h.okLabel ?? 'Done', ok, 'primary');
  d.append(...(h.named ? [_namedExcerptMenu(strip, h.state.score)] : []), input, strip.el, strip.hint, error, buttonRow(button('Cancel', closeOverlay), done));
  strip.reveal();
  (input.hidden ? done : input).focus();
}
