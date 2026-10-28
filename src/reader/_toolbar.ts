// The reader's toolbar: building its buttons and showing the reader's state on them. The buttons
// call back into the reader; what they do is not here.

import { PEN_COLORS } from '../markings/stroke';
import { el } from '../ui/dom';
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

/** A chevron, down to show the toolbar, up to hide it: on the toolbar, and when it is hidden. */
export function chromeIcon(dir: 'down' | 'up'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('back-icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', dir === 'down' ? 'M5 9l7 7 7-7' : 'M5 15l7-7 7 7');
  svg.append(path);
  return svg;
}

/** The tool selected in the toolbar, if any. */
export type ToolChoice = 'none' | ToolName;

export interface ToolbarActions {
  close(): void;
  /** Hide the toolbar. */
  hide(): void;
  /** In a setlist: the menu of its scores. */
  scores(): void;
  /** In a setlist: choosing the excerpt of this score; in a named excerpt: changing its cuts. */
  excerpt(): void;
  /** In a score's own reader: the list of its named excerpts. */
  excerpts(): void;
  /** The menu of what is read, as its ⋯ menu in the library. */
  more(): void;
  /** Tapping the active tool again puts it away. */
  tool(t: ToolName): void;
  penColor(c: string): void;
  undo(): void;
  redo(): void;
  toggleEditing(): void;
  openArchive(): void;
  fit(): void;
}

/** What the toolbar shows. */
export interface ToolbarView {
  /** The score is open; a score that can't be opened can't be written on or edited. */
  open: boolean;
  tool: ToolChoice;
  penColor: string;
  editing: boolean;
  archived: number;
  zoomed: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export class Toolbar {
  readonly el = el('div', 'bar');
  readonly title = el('span', 'title');
  readonly info = el('span', 'page-info');
  private buttons: Record<string, HTMLButtonElement> = {};

  /** `reading` is what the reader reads, which decides the buttons on the right. */
  constructor(reading: 'score' | 'excerpt' | 'setlist', act: ToolbarActions) {
    const left = el('div', 'group');
    const back = this.button('close', '', act.close);
    back.append(backIcon());
    back.setAttribute('aria-label', 'Library');
    back.title = 'Library';
    left.append(back, this.title);

    const tools = el('div', 'group');
    tools.append(...TOOL_NAMES.map((t) => this.button(t, TOOLS[t].label, () => act.tool(t))));
    const swatches = el('div', 'group swatches');
    for (const c of PEN_COLORS) {
      const b = this.button('color' + c, '', () => act.penColor(c), 'swatch');
      b.style.setProperty('--swatch', c);
      b.setAttribute('aria-label', 'Pen colour');
      swatches.append(b);
    }
    tools.append(
      swatches,
      this.button('undo', 'Undo', act.undo),
      this.button('redo', 'Redo', act.redo),
    );

    const right = el('div', 'group');
    if (reading === 'setlist') {
      right.append(this.button('scores', 'Scores', act.scores));
      this.buttons.scores.setAttribute('aria-haspopup', 'menu');
    }
    if (reading === 'score') right.append(this.button('excerpts', 'Excerpts', act.excerpts));
    else right.append(this.button('excerpt', 'Excerpt', act.excerpt));
    const more = this.button('more', '⋯', act.more, 'more');
    more.setAttribute('aria-label', reading === 'setlist' ? 'More for this setlist' : 'More');
    more.setAttribute('aria-haspopup', 'menu');
    const hide = this.button('hide', '', act.hide);
    hide.append(chromeIcon('up'));
    hide.setAttribute('aria-label', 'Hide the toolbar');
    hide.title = 'Hide the toolbar';
    right.append(
      this.button('edit', 'Edit cuts', act.toggleEditing),
      this.button('archived', 'Archived', act.openArchive),
      this.button('fit', 'Fit page', act.fit),
      more,
      this.info,
      hide,
    );
    this.el.append(left, tools, right);
  }

  private button(key: string, label: string, onClick: () => void, cls = ''): HTMLButtonElement {
    const b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    this.buttons[key] = b;
    return b;
  }

  /** A toolbar button, for a menu to open below it. */
  anchor(key: 'scores' | 'more'): HTMLElement { return this.buttons[key]; }

  sync(v: ToolbarView) {
    const pressed = (k: string, on: boolean) => this.buttons[k].setAttribute('aria-pressed', String(on));
    for (const t of TOOL_NAMES) pressed(t, v.tool === t);
    pressed('edit', v.editing);
    for (const c of PEN_COLORS) pressed('color' + c, v.tool === 'pen' && v.penColor === c);
    for (const k of [...TOOL_NAMES, 'edit', 'excerpt', 'excerpts']) if (this.buttons[k]) this.buttons[k].disabled = !v.open;
    this.buttons.archived.hidden = !v.editing || !v.archived;
    this.buttons.archived.textContent = `Archived (${v.archived})`;
    this.buttons.fit.hidden = !v.zoomed;
    this.buttons.undo.disabled = !v.canUndo;
    this.buttons.redo.disabled = !v.canRedo;
  }
}
