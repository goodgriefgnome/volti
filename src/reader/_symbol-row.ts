// The toolbar's second row: a button for each group of the library, showing the group's current
// symbol (a long press on one shows all its symbols), the fonts of text, and the backgrounds.

import { cssFamily, type FontChoice } from '../fonts/fonts';
import type { LibrarySymbol, SymbolLibrary } from '../markings/library';
import { markColors } from '../markings/placed';
import type { BackgroundChoice } from '../markings/tool-settings';
import { PEN_COLORS } from '../markings/stroke';
import { button, el } from '../ui/dom';
import { onLongPress } from '../ui/long-press';
import { closeOverlay, showMenu } from '../ui/overlay';
import { symbolPicture as picture } from './_symbol-picture';
import { BACKGROUNDS, backgroundPicture } from './_swatches';

export interface SymbolRowActions {
  /** The button of a group was pressed (-1 for the ad-hoc group). */
  pick(group: number): void;
  /** A symbol was chosen from a group's long-press menu. */
  choose(group: number, index: number): void;
  /** + was pressed: pick a symbol to place. */
  add(): void;
  /** Edit library… was pressed. */
  edit(): void;
  /** A font button was pressed. */
  font(id: string): void;
  /** A colour button was pressed: a pen colour, or the default colour. */
  color(c: string | 'default'): void;
  /** A background button was pressed. */
  background(b: BackgroundChoice): void;
  /** An ad-hoc symbol was chosen to go to a group, or to a new one. */
  moveToGroup(index: number, group: number | 'new'): void;
}

/** What the background buttons show: which is pressed, and whether they can be pressed. */
export interface BackgroundsView { pressed?: BackgroundChoice; enabled: boolean }

/** What the colour buttons show: which is pressed (none selected: none), and whether they can be pressed. */
export interface ColorsView { pressed?: string | 'default'; enabled: boolean }

/** What the font buttons show: the text fonts, and which is pressed. */
export interface FontsView { choices: FontChoice[]; pressed: string }

export class SymbolRow {
  readonly el = el('div', 'symbol-row');
  private shown = '';
  private lib: SymbolLibrary | undefined;
  private fonts = el('div', 'symbol-fonts');
  private backgrounds = el('div', 'symbol-backgrounds');
  private colors = el('div', 'symbol-colors');

  constructor(private act: SymbolRowActions) {
    this.el.hidden = true;
    this.fonts.setAttribute('role', 'group');
    this.fonts.setAttribute('aria-label', 'Font');
    this.backgrounds.setAttribute('role', 'group');
    this.backgrounds.setAttribute('aria-label', 'Background');
    this.colors.setAttribute('role', 'group');
    this.colors.setAttribute('aria-label', 'Colour');
  }

  /**
   * Show the groups' current symbols (an index into each; `adhocCurrent` into the ad-hoc group),
   * the `active` group's pressed (-1 for ad hoc), while `groups` says they show; the fonts, and
   * the colours, and the backgrounds, `undefined` to hide them.
   */
  show(
    lib: SymbolLibrary | undefined, current: readonly number[], adhocCurrent: number, active: number | undefined,
    groups: boolean, fonts: FontsView | undefined, colors: ColorsView | undefined, backgrounds: BackgroundsView | undefined,
  ) {
    const key = `${lib ? lib.groups.map((_, i) => current[i] ?? 0).join() : ''}|${adhocCurrent}|${active}|${groups}|${fonts && `${fonts.pressed}${fonts.choices.map((c) => c.id)}`}|${colors && `${colors.pressed}${colors.enabled}${markColors().color}`}|${backgrounds && `${backgrounds.pressed}${backgrounds.enabled}`}`;
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
    if (fonts) {
      this.fonts.replaceChildren(el('span', 'symbol-label', 'Font'), ...fonts.choices.map((c) => {
        const b = el('button', 'symbol-font');
        b.type = 'button';
        b.textContent = c.name;
        b.setAttribute('aria-label', c.name);
        b.setAttribute('aria-pressed', String(fonts.pressed === c.id));
        // Keep the focus in the typing field, so a tap here doesn't finish the typing.
        b.addEventListener('pointerdown', (e) => e.preventDefault());
        b.addEventListener('click', () => this.act.font(c.id));
        // Its name in its own font once that has loaded.
        void cssFamily(c.id).then((family) => { b.style.fontFamily = `"${family}"`; }, () => {});
        return b;
      }));
      parts.push(this.fonts);
    }
    if (colors) {
      const choice = (c: string | 'default', label: string, cls: string, text = '') => {
        const b = el('button', cls, text);
        b.type = 'button';
        b.setAttribute('aria-label', label);
        b.title = label;
        b.setAttribute('aria-pressed', String(colors.pressed === c));
        b.disabled = !colors.enabled;
        b.addEventListener('click', () => this.act.color(c));
        return b;
      };
      this.colors.replaceChildren(
        el('span', 'symbol-label', 'Colour'),
        choice('default', 'Default colour', 'symbol-color-default', 'Default'),
        ...PEN_COLORS.map((c) => {
          const b = choice(c, 'Colour', 'swatch');
          b.style.setProperty('--swatch', c);
          return b;
        }),
      );
      parts.push(this.colors);
    }
    if (backgrounds) {
      this.backgrounds.replaceChildren(el('span', 'symbol-label', 'Background'), ...BACKGROUNDS.map(([choice, label]) => {
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
