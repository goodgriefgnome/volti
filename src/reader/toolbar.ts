import { PEN_COLORS, type InkTool } from '../ink/model';
import type { PagesPerScreen } from '../storage/prefs';
import { el } from '../ui/dom';

export type Tool = 'none' | InkTool | 'eraser';

const LAYOUT_LABEL: Record<string, string> = { auto: 'Auto', 1: '1 page', 2: '2 pages' };
const LAYOUT_NEXT: Record<string, PagesPerScreen> = { auto: 1, 1: 2, 2: 'auto' };

/** The layout the layout button switches to from `p`. */
export const nextLayout = (p: PagesPerScreen) => LAYOUT_NEXT[String(p)];

export interface ToolbarActions {
  close(): void;
  /** Tapping the active tool again puts it away. */
  tool(t: Tool): void;
  penColor(c: string): void;
  undo(): void;
  redo(): void;
  toggleEditing(): void;
  openArchive(): void;
  fit(): void;
  nextLayout(): void;
}

/** What the toolbar shows. */
export interface ToolbarView {
  tool: Tool;
  penColor: string;
  editing: boolean;
  archived: number;
  layout: PagesPerScreen;
  zoomed: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export class Toolbar {
  readonly el = el('div', 'bar');
  readonly info = el('span', 'page-info');
  private buttons: Record<string, HTMLButtonElement> = {};

  constructor(title: string, act: ToolbarActions) {
    const left = el('div', 'group');
    left.append(this.button('close', 'Library', act.close), el('span', 'title', title));

    const tools = el('div', 'group');
    tools.append(
      this.button('pen', 'Pen', () => act.tool('pen')),
      this.button('highlighter', 'Highlight', () => act.tool('highlighter')),
      this.button('eraser', 'Erase', () => act.tool('eraser')),
    );
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
    right.append(
      this.button('edit', 'Edit cuts', act.toggleEditing),
      this.button('archived', 'Archived', act.openArchive),
      this.button('fit', 'Fit page', act.fit),
      this.button('layout', '', act.nextLayout),
      this.info,
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

  sync(v: ToolbarView) {
    const pressed = (k: string, on: boolean) => this.buttons[k].setAttribute('aria-pressed', String(on));
    pressed('pen', v.tool === 'pen');
    pressed('highlighter', v.tool === 'highlighter');
    pressed('eraser', v.tool === 'eraser');
    pressed('edit', v.editing);
    for (const c of PEN_COLORS) pressed('color' + c, v.tool === 'pen' && v.penColor === c);
    this.buttons.archived.hidden = !v.editing || !v.archived;
    this.buttons.archived.textContent = `Archived (${v.archived})`;
    this.buttons.layout.textContent = LAYOUT_LABEL[String(v.layout)];
    this.buttons.fit.hidden = !v.zoomed;
    this.buttons.undo.disabled = !v.canUndo;
    this.buttons.redo.disabled = !v.canRedo;
  }
}
