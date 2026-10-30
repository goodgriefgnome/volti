// The toolbar's second row: a button for each group of the library, showing the group's current
// symbol (a long press on one shows all its symbols), and the backgrounds.

import type { LibrarySymbol, SymbolLibrary } from '../markings/library';
import { markColors, type Background } from '../markings/placed';
import { button, el } from '../ui/dom';
import { closeOverlay, showMenu } from '../ui/overlay';
import { symbolPicture as picture } from './_symbol-picture';

export interface SymbolRowActions {
  /** The button of a group was pressed (-1 for the ad-hoc group). */
  pick(group: number): void;
  /** A symbol was chosen from a group's long-press menu. */
  choose(group: number, index: number): void;
  /** + was pressed: pick a symbol to place. */
  add(): void;
  /** Edit library… was pressed. */
  edit(): void;
  /** A background button was pressed. */
  background(b: BackgroundChoice): void;
  /** An ad-hoc symbol was chosen to go to a group, or to a new one. */
  moveToGroup(index: number, group: number | 'new'): void;
}

/** A marking's background: none, or the shape of one. */
export type BackgroundChoice = 'none' | Background['shape'];

export const BACKGROUNDS: [choice: BackgroundChoice, label: string][] = [
  ['none', 'No background'], ['box', 'Box'], ['tag-left', 'Tag pointing left'], ['tag-right', 'Tag pointing right'],
];

/** The outline of each shape in a 24 × 16 picture. */
const SHAPE_POINTS: Record<Background['shape'], string> = {
  box: '3,2 21,2 21,14 3,14',
  'tag-left': '3,2 21,2 21,14 3,14 0,8',
  'tag-right': '3,2 21,2 24,8 21,14 3,14',
};

/** A small picture of a background shape in the default background colour (none: an empty square crossed by a line). */
export function backgroundPicture(choice: BackgroundChoice): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 16');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  if (choice === 'none') {
    const rect = document.createElementNS(ns, 'rect');
    for (const [k, v] of Object.entries({ x: '3', y: '2', width: '18', height: '12', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' })) rect.setAttribute(k, v);
    const line = document.createElementNS(ns, 'line');
    for (const [k, v] of Object.entries({ x1: '3', y1: '14', x2: '21', y2: '2', stroke: 'currentColor', 'stroke-width': '1.5' })) line.setAttribute(k, v);
    svg.append(rect, line);
  } else {
    const shape = document.createElementNS(ns, 'polygon');
    shape.setAttribute('points', SHAPE_POINTS[choice]);
    shape.setAttribute('fill', markColors().background);
    svg.append(shape);
  }
  return svg;
}

/** What the background buttons show: which is pressed, and whether they can be pressed. */
export interface BackgroundsView { pressed?: BackgroundChoice; enabled: boolean }

/** How long a press is held to count as a long press. */
const LONG_PRESS_MS = 500;
export class SymbolRow {
  readonly el = el('div', 'symbol-row');
  private shown = '';
  private lib: SymbolLibrary | undefined;
  private backgrounds = el('div', 'symbol-backgrounds');

  constructor(private act: SymbolRowActions) {
    this.el.hidden = true;
    this.backgrounds.setAttribute('role', 'group');
    this.backgrounds.setAttribute('aria-label', 'Background');
  }

  /**
   * Show the groups' current symbols (an index into each; `adhocCurrent` into the ad-hoc group),
   * the `active` group's pressed (-1 for ad hoc), while `groups` says they show; and the
   * backgrounds, `undefined` to hide them.
   */
  show(
    lib: SymbolLibrary | undefined, current: readonly number[], adhocCurrent: number, active: number | undefined,
    groups: boolean, backgrounds: BackgroundsView | undefined,
  ) {
    const key = `${lib ? lib.groups.map((_, i) => current[i] ?? 0).join() : ''}|${adhocCurrent}|${active}|${groups}|${backgrounds && `${backgrounds.pressed}${backgrounds.enabled}`}`;
    if (lib === this.lib && key === this.shown) return;
    this.lib = lib;
    this.shown = key;
    const parts: Node[] = [];
    if (lib && groups) {
      // Groups with no symbols have no button; the ad-hoc group shows once it has some.
      parts.push(...lib.groups.flatMap((g, i) => (g.symbols.length ? [this.groupButton(g.symbols, i, current[i] ?? 0, active === i)] : [])));
      if (lib.adhoc.length) parts.push(this.groupButton(lib.adhoc, -1, adhocCurrent, active === -1));
      parts.push(button('+', () => this.act.add(), 'symbol-add'), button('Edit library…', () => this.act.edit()));
    }
    if (backgrounds) {
      this.backgrounds.replaceChildren(...BACKGROUNDS.map(([choice, label]) => {
        const b = el('button', 'symbol-background');
        b.type = 'button';
        b.setAttribute('aria-label', label);
        b.title = label;
        b.setAttribute('aria-pressed', String(backgrounds.pressed === choice));
        b.disabled = !backgrounds.enabled;
        b.append(backgroundPicture(choice));
        b.addEventListener('click', () => this.act.background(choice));
        return b;
      }));
      parts.push(this.backgrounds);
    }
    this.el.replaceChildren(...parts);
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
          // An ad-hoc symbol can also go into a group.
          if (group >= 0) return item;
          const row = el('div', 'symbol-choice-row');
          row.append(item, button('To group', () => this.groupMenu(b, j)));
          return row;
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

  /** The groups an ad-hoc symbol can go to, and a new one. */
  private groupMenu(at: Element, index: number) {
    const lib = this.lib;
    if (!lib) return;
    const items = lib.groups.map((g, i) => {
      const item = el('button', 'symbol-choice group-choice');
      item.type = 'button';
      if (g.symbols[0]) item.append(picture(g.symbols[0], '#14161b'));
      else item.textContent = `Group ${i + 1}`;
      item.addEventListener('click', () => { closeOverlay(); this.act.moveToGroup(index, i); });
      return item;
    });
    showMenu(at, 'Move to', [...items, { label: 'New group', run: () => this.act.moveToGroup(index, 'new') }]);
  }
}
