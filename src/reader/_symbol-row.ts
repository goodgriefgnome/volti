// The toolbar's second row: a button for each group of the library, showing the group's current
// symbol (a long press on one shows all its symbols).

import type { LibrarySymbol, SymbolLibrary } from '../markings/library';
import { button, el } from '../ui/dom';
import { onLongPress } from '../ui/long-press';
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
  /** An ad-hoc symbol was chosen to go to a group, or to a new one. */
  moveToGroup(index: number, group: number | 'new'): void;
}

export class SymbolRow {
  readonly el = el('div', 'symbol-row');
  private shown = '';
  private lib: SymbolLibrary | undefined;

  constructor(private act: SymbolRowActions) {
    this.el.hidden = true;
  }

  /**
   * Show the groups' current symbols (an index into each; `adhocCurrent` into the ad-hoc group),
   * the `active` group's pressed (-1 for ad hoc), while `groups` says they show.
   */
  show(lib: SymbolLibrary | undefined, current: readonly number[], adhocCurrent: number, active: number | undefined, groups: boolean) {
    const key = `${lib ? lib.groups.map((_, i) => current[i] ?? 0).join() : ''}|${adhocCurrent}|${active}|${groups}`;
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
    this.el.replaceChildren(...parts);
  }

  private groupButton(symbols: readonly LibrarySymbol[], group: number, index: number, pressed: boolean): HTMLButtonElement {
    const b = el('button', 'symbol-group');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(pressed));
    const sym = symbols[index] ?? symbols[0];
    if (sym) b.append(picture(sym, '#1d2026'));
    onLongPress(b, () => {
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
    });
    b.addEventListener('click', () => this.act.pick(group));
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
