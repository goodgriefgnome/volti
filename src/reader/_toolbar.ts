// The reader's toolbar: building its buttons and showing the reader's state on them. The buttons
// call back into the reader; what they do is not here.

import { BACK, CHEVRON, DOTS, el, icon } from '../ui/dom';
import { onLongPress } from '../ui/long-press';
import { TOOL_LABELS, type ButtonFace, type Tool, type ToolName } from './_tools/_tool';
import { TOOLBAR } from './_tools/_tools';
import { barRows } from './_bar-rows';

const SCISSORS = 'M6 3a3 3 0 1 0 .01 0M6 15a3 3 0 1 0 .01 0M8.5 7.5L20 19M8.5 16.5L20 5';
const UNDO = 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3';
const REDO = 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3';

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
  tool: ToolName;
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
    const back = this.button('close', '', act.close, 'bar-back');
    back.append(icon(BACK));
    back.setAttribute('aria-label', 'Library');
    back.title = 'Library';
    this.titleButton = this.button('title', '', act.titleMenu, 'title-button');
    this.titleButton.setAttribute('aria-haspopup', 'menu');
    this.titleButton.append(this.title, icon(CHEVRON, 'chevron down'));
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
    this.main = main;
    this.back = back;
    this.moreButton = more;
    this.tools = group;
    // Refit when the bar's width changes (its height does with the rows), when the screen's height does, and when a tool's face does.
    let width = 0;
    this.observer = new ResizeObserver(() => { if (this.el.clientWidth !== width) { width = this.el.clientWidth; this.fit(); } });
    this.observer.observe(this.el);
    window.addEventListener('resize', this.onResize);
  }

  private observer: ResizeObserver;
  private onResize = () => this.fit();

  /** Stop watching the bar and the window, for when the reader closes. */
  dispose() {
    this.observer.disconnect();
    window.removeEventListener('resize', this.onResize);
  }

  private main: HTMLElement;
  private back: HTMLElement;
  private moreButton: HTMLElement;
  private tools: HTMLElement;

  /** One row or two (`_bar-rows.ts`), by what is measured now: the `one-row` class says which. */
  fit() {
    const style = getComputedStyle(this.el);
    const width = this.el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    if (width <= 0) return;
    const px = (v: string) => parseFloat(v) || 0;
    const gap = px(getComputedStyle(this.main).columnGap);
    const toolGap = px(getComputedStyle(this.tools).columnGap);
    const kids = [...this.tools.children] as HTMLElement[];
    // The rules between groups have margins (the first and last tools' are auto, and not counted).
    const margins = (k: HTMLElement) => (k.classList.contains('rule') ? px(getComputedStyle(k).marginLeft) + px(getComputedStyle(k).marginRight) : 0);
    const tools = kids.reduce((sum, k) => sum + k.offsetWidth + margins(k), 0) + toolGap * Math.max(0, kids.length - 1);
    const fixed = this.back.offsetWidth + this.moreButton.offsetWidth + 3 * gap;
    this.el.classList.toggle('one-row', barRows({ width, fixed, tools, height: window.innerHeight }) === 1);
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
    this.fit();
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
