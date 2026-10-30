// The toolbar's second row of symbols: a button for each group of the library, showing the group's
// current symbol; a long press on one shows all its symbols.

import { canvasDrawing } from '../markings/draw';
import type { LibrarySymbol, SymbolLibrary } from '../markings/library';
import { drawMarkings } from '../markings/model';
import { emExtent, type PlacedMark } from '../markings/placed';
import { dpr, el } from '../ui/dom';
import { closeOverlay, showMenu } from '../ui/overlay';

export interface SymbolRowActions {
  /** The button of a group was pressed. */
  pick(group: number): void;
  /** A symbol was chosen from a group's long-press menu. */
  choose(group: number, index: number): void;
}

/** How long a press is held to count as a long press. */
const LONG_PRESS_MS = 500;
/** The size of a symbol's picture, in CSS pixels. */
const PICTURE_PX = 28;

/** A canvas showing a symbol, centred and fitted to it, in `color`. */
function picture(sym: LibrarySymbol, color: string): HTMLCanvasElement {
  const side = PICTURE_PX, scale = dpr();
  const canvas = el('canvas');
  canvas.width = canvas.height = Math.round(side * scale);
  canvas.style.width = canvas.style.height = side + 'px';
  const mark: PlacedMark = { kind: 'symbol', text: sym.text, font: sym.font, glyphs: sym.glyphs, at: [0.5, 0.5], size: 1, color };
  const e = emExtent(mark);
  if (e) {
    mark.size = 0.8 / Math.max(e[2] - e[0], e[3] - e[1], 0.01);
    const ctx = canvas.getContext('2d');
    if (ctx) drawMarkings({ draw: canvasDrawing(ctx), w: canvas.width, h: canvas.height, ox: 0, oy: 0 }, [mark]);
  }
  return canvas;
}

export class SymbolRow {
  readonly el = el('div', 'symbol-row');
  private shown = '';
  private lib: SymbolLibrary | undefined;

  constructor(private act: SymbolRowActions) {
    this.el.hidden = true;
  }

  /** Show the groups' current symbols (an index into each), the `active` group's pressed. */
  show(lib: SymbolLibrary | undefined, current: readonly number[], active: number | undefined) {
    const key = lib ? `${lib.groups.map((_, i) => current[i] ?? 0).join()}|${active}` : '';
    if (lib === this.lib && key === this.shown) return;
    this.lib = lib;
    this.shown = key;
    if (!lib) { this.el.replaceChildren(); return; }
    this.el.replaceChildren(...lib.groups.map((g, i) => this.groupButton(g.symbols, i, current[i] ?? 0, active === i)));
  }

  private groupButton(symbols: readonly LibrarySymbol[], group: number, index: number, pressed: boolean): HTMLButtonElement {
    const b = el('button', 'symbol-group');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(pressed));
    const sym = symbols[index] ?? symbols[0];
    if (sym) b.append(picture(sym, pressed ? '#14161b' : '#ffffff'));
    let timer: ReturnType<typeof setTimeout> | undefined;
    let long = false;
    const stop = () => clearTimeout(timer);
    b.addEventListener('pointerdown', () => {
      long = false;
      timer = setTimeout(() => {
        long = true;
        showMenu(b, 'Symbols', symbols.map((s, j) => {
          const item = el('button', 'symbol-choice');
          item.type = 'button';
          item.append(picture(s, '#14161b'));
          item.addEventListener('click', () => { closeOverlay(); this.act.choose(group, j); });
          return item;
        }));
      }, LONG_PRESS_MS);
    });
    b.addEventListener('pointerup', stop);
    b.addEventListener('pointercancel', stop);
    b.addEventListener('pointerleave', stop);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('click', () => { if (!long) this.act.pick(group); long = false; });
    return b;
  }
}
