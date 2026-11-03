// The reader's toolbar: building its buttons and showing the reader's state on them. The buttons
// call back into the reader; what they do is not here.

import type { LibrarySymbol } from '../markings/library';
import { el } from '../ui/dom';
import { onLongPress } from '../ui/long-press';
import { symbolPicture } from './_symbol-picture';
import { SymbolRow, type BackgroundsView, type SymbolRowActions } from './_symbol-row';
import { TOOL_NAMES, TOOLS, type ToolName } from './tools/_tools';

/** The back arrow that leaves the reader for the library, on the toolbar and when it is hidden. */
export function backIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('back-icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M15 5 8 12l7 7');
  svg.append(path);
  return svg;
}

/** A tool's or button's icon, drawn in the button's colour from the path `d` in a 24 x 24 box. */
export function icon(d: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('tool-icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

/** Each tool's icon: a new tool needs one here. */
export const TOOL_ICONS: Record<ToolName, string> = {
  pen: 'M4 20l4-1 11-11-3-3L5 16z',
  highlighter: 'M5 20h7M7 16l9-9 3 3-9 9H7z',
  eraser: 'M8 20h12M5 15l8-8 5 5-6 6H9z',
  text: 'M5 6h14M12 6v13',
};

const SCISSORS = 'M6 3a3 3 0 1 0 .01 0M6 15a3 3 0 1 0 .01 0M8.5 7.5L20 19M8.5 16.5L20 5';
const UNDO = 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3';
const REDO = 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3';
const DOTS = 'M5 12h.01M12 12h.01M19 12h.01';

/** The chevron after the title, which opens the title menu. */
export function chevronIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('chevron-icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M7 10l5 5 5-5');
  svg.append(path);
  return svg;
}

/** The solid triangle in a page-turn band, pointing the way the band turns. */
export function turnIcon(dir: 'prev' | 'next'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', dir === 'prev' ? 'M16 5v14L6 12z' : 'M8 5v14l10-7z');
  svg.append(path);
  return svg;
}

/** The tool selected in the toolbar, if any. */
export type ToolChoice = 'none' | ToolName | 'symbol';

/** The tools that place markings whole: a symbol, or text. */
export const placesMarkings = (tool: ToolChoice) => tool === 'symbol' || tool === 'text';

export interface ToolbarActions extends SymbolRowActions {
  close(): void;
  /** The menu under the title: what can be read next to what is read. */
  titleMenu(): void;
  /** The menu of what is read, as its ⋯ menu in the library. */
  more(): void;
  /** Tapping the active tool again puts it away. */
  tool(t: ToolName): void;
  /** The Symbols tool: the last symbol picked becomes the tool, or the tool is put away. */
  symbols(): void;
  /** A long press on Pen or Highlight: its colours. */
  colors(tool: 'pen' | 'highlighter'): void;
  undo(): void;
  redo(): void;
  /** Show or hide the cut editor's tabs, room shading and space line. */
  toggleCuts(): void;
}

/** What the toolbar shows. */
export interface ToolbarView {
  /** The score is open; a score that can't be opened can't be written on or edited. */
  open: boolean;
  tool: ToolChoice;
  /** The symbol the Symbols button shows; undefined: a generic pp. */
  symbol?: LibrarySymbol;
  /** The second row's backgrounds; undefined hides them. */
  backgrounds?: BackgroundsView;
  /** The colours Pen and Highlight draw in, shown under their icons. */
  penInk: string;
  highlightInk: string;
  /** The cuts show. */
  cuts: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export class Toolbar {
  readonly el = el('div', 'bar');
  readonly title = el('span', 'title');
  /** The title as a button, with a chevron, to open the title menu. */
  readonly titleButton: HTMLButtonElement;
  readonly info = el('span', 'page-info');
  /** The second row, under the rest: the symbol groups. */
  readonly symbolRow: SymbolRow;
  private buttons: Record<string, HTMLButtonElement> = {};
  /** What the Symbols button shows now, to draw it again only when it changes. */
  private symbolShown = '';

  /** `reading` is what the reader reads, which decides the buttons on the right. */
  constructor(reading: 'score' | 'excerpt' | 'setlist', act: ToolbarActions) {
    const left = el('div', 'group left');
    const back = this.button('close', '', act.close);
    back.append(backIcon());
    back.setAttribute('aria-label', 'Library');
    back.title = 'Library';
    this.titleButton = this.button('title', '', act.titleMenu, 'title-button');
    this.titleButton.setAttribute('aria-haspopup', 'menu');
    this.titleButton.append(this.title, chevronIcon());
    const titleBlock = el('div', 'title-block');
    titleBlock.append(this.titleButton, this.info);
    left.append(back, titleBlock);

    // Drawing tools, the tools that place markings,
    // Cuts, and Undo and Redo, in groups between thin rules.
    const iconButton = (key: string, d: string, label: string, onClick: () => void, cls = '') => {
      const b = this.button(key, '', onClick, cls);
      b.append(icon(d));
      b.setAttribute('aria-label', label);
      b.title = label;
      return b;
    };
    const toolButton = (t: ToolName) => {
      const b = iconButton(t, TOOL_ICONS[t], TOOLS[t].label, () => act.tool(t));
      // Pen and Highlight show the colour they draw in under the icon; a long press offers the colours.
      if (t === 'pen' || t === 'highlighter') {
        b.append(el('span', 'ink'));
        onLongPress(b, () => act.colors(t));
      }
      return b;
    };
    const symbols = this.button('symbols', '', act.symbols, 'symbols-tool');
    symbols.setAttribute('aria-label', 'Symbols');
    symbols.title = 'Symbols';
    const cuts = this.button('cuts', '', act.toggleCuts, 'cuts-button');
    cuts.append(icon(SCISSORS), el('span', 'label', 'Cuts'));
    const rule = () => { const r = el('span', 'rule'); r.setAttribute('aria-hidden', 'true'); return r; };
    const tools = el('div', 'group tools');
    tools.append(
      ...TOOL_NAMES.filter((t) => !placesMarkings(t)).map(toolButton), rule(),
      ...TOOL_NAMES.filter(placesMarkings).map(toolButton), symbols, rule(),
      cuts, rule(),
      iconButton('undo', UNDO, 'Undo', act.undo), iconButton('redo', REDO, 'Redo', act.redo),
    );

    const more = iconButton('more', DOTS, reading === 'setlist' ? 'More for this setlist' : 'More', act.more, 'more');
    more.setAttribute('aria-haspopup', 'menu');
    const main = el('div', 'bar-main');
    main.append(left, tools, more);
    this.symbolRow = new SymbolRow(act);
    this.el.append(main, this.symbolRow.el);
  }

  private button(key: string, label: string, onClick: () => void, cls = ''): HTMLButtonElement {
    const b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    this.buttons[key] = b;
    return b;
  }

  /** A toolbar button, for a menu to open below it. */
  anchor(key: 'title' | 'more' | 'pen' | 'highlighter'): HTMLElement { return this.buttons[key]; }

  /** The Symbols button's picture: the symbol, drawn in the button's colour, or a generic pp. */
  private symbolButton(sym: LibrarySymbol | undefined, pressed: boolean) {
    const b = this.buttons.symbols, key = `${sym?.font}|${sym?.text}|${sym?.scale}|${pressed}`;
    if (key === this.symbolShown) return;
    this.symbolShown = key;
    if (!sym) { b.replaceChildren(el('span', 'pp', 'pp')); return; }
    b.replaceChildren(symbolPicture(sym, getComputedStyle(b).color, 28));
  }

  sync(v: ToolbarView) {
    const pressed = (k: string, on: boolean) => this.buttons[k].setAttribute('aria-pressed', String(on));
    for (const t of TOOL_NAMES) pressed(t, v.tool === t);
    pressed('cuts', v.cuts);
    pressed('symbols', v.tool === 'symbol');
    this.symbolRow.el.hidden = !placesMarkings(v.tool);
    this.symbolButton(v.symbol, v.tool === 'symbol');
    this.buttons.pen.querySelector<HTMLElement>('.ink')!.style.background = v.penInk;
    this.buttons.highlighter.querySelector<HTMLElement>('.ink')!.style.background = v.highlightInk;
    for (const k of [...TOOL_NAMES, 'symbols', 'cuts']) if (this.buttons[k]) this.buttons[k].disabled = !v.open;
    this.buttons.undo.disabled = !v.canUndo;
    this.buttons.redo.disabled = !v.canRedo;
  }
}
