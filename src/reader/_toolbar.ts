// The reader's toolbar: building its buttons and showing the reader's state on them. The buttons
// call back into the reader; what they do is not here.

import { el } from '../ui/dom';
import { onLongPress } from '../ui/long-press';
import { icon } from './tools/_faces';
import { TOOL_LABELS, type ButtonFace, type Tool, type ToolName } from './tools/_tool';
import { TOOLBAR } from './tools/_tools';

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
export type ToolChoice = ToolName;

/** The tools that place markings whole: a symbol, or text. */
export const placesMarkings = (tool: ToolChoice) => tool === 'symbol' || tool === 'text';

export interface ToolbarActions {
  close(): void;
  /** The menu under the title: what can be read next to what is read. */
  titleMenu(): void;
  /** The menu of what is read, as its ⋯ menu in the library. */
  more(): void;
  /** Tapping the active tool again puts it away. */
  tool(t: Exclude<ToolName, 'hand'>): void;
  /** A long press on a tool's button: its panel. */
  panel(t: Exclude<ToolName, 'hand'>): void;
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
  private buttons: Record<string, HTMLButtonElement> = {};
  /** The key of what each tool's button shows now, to draw it again only when it changes. */
  private faces = new Map<ToolName, string>();

  /** `reading` is what the reader reads, which decides the buttons on the right. */
  constructor(reading: 'score' | 'excerpt' | 'setlist', act: ToolbarActions, tools: Record<ToolName, Tool>) {
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

    // The tools in their groups, Cuts, and Undo and Redo, in groups between thin rules.
    const iconButton = (key: string, d: string, label: string, onClick: () => void, cls = '') => {
      const b = this.button(key, '', onClick, cls);
      b.append(icon(d));
      b.setAttribute('aria-label', label);
      b.title = label;
      return b;
    };
    // A tool's button shows the face its tool sets; a long press shows its panel, when it has one.
    const toolButton = (t: Exclude<ToolName, 'hand'>) => {
      const b = this.button(t, '', () => act.tool(t), `tool-${t}`);
      b.setAttribute('aria-label', TOOL_LABELS[t]);
      b.title = TOOL_LABELS[t];
      if (tools[t].showPanel) onLongPress(b, () => act.panel(t));
      return b;
    };
    const cuts = this.button('cuts', '', act.toggleCuts, 'cuts-button');
    cuts.append(icon(SCISSORS), el('span', 'label', 'Cuts'));
    const rule = () => { const r = el('span', 'rule'); r.setAttribute('aria-hidden', 'true'); return r; };
    const group = el('div', 'group tools');
    group.append(
      ...TOOLBAR.flatMap((g, i) => [...(i ? [rule()] : []), ...g.map(toolButton)]), rule(),
      cuts, rule(),
      iconButton('undo', UNDO, 'Undo', act.undo), iconButton('redo', REDO, 'Redo', act.redo),
    );

    const more = iconButton('more', DOTS, reading === 'setlist' ? 'More for this setlist' : 'More', act.more, 'more');
    more.setAttribute('aria-haspopup', 'menu');
    const main = el('div', 'bar-main');
    main.append(left, group, more);
    this.el.append(main);
  }

  private button(key: string, label: string, onClick: () => void, cls = ''): HTMLButtonElement {
    const b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    this.buttons[key] = b;
    return b;
  }

  /** A toolbar button, for a menu to open below it. */
  anchor(key: 'title' | 'more' | Exclude<ToolName, 'hand'>): HTMLElement { return this.buttons[key]; }

  /** A tool's button shows `face` from now on; drawn again only when its key has changed. */
  setFace(tool: ToolName, face: ButtonFace) {
    const b = this.buttons[tool];
    if (!b || this.faces.get(tool) === face.key) return;
    this.faces.set(tool, face.key);
    b.replaceChildren(face.draw());
  }

  sync(v: ToolbarView) {
    const pressed = (k: string, on: boolean) => this.buttons[k].setAttribute('aria-pressed', String(on));
    const toolKeys = TOOLBAR.flat();
    for (const t of toolKeys) pressed(t, v.tool === t);
    pressed('cuts', v.cuts);
    for (const k of [...toolKeys, 'cuts']) if (this.buttons[k]) this.buttons[k].disabled = !v.open;
    this.buttons.undo.disabled = !v.canUndo;
    this.buttons.redo.disabled = !v.canRedo;
  }
}
