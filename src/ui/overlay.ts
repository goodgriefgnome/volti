import { el } from '../viewer/dom';

// One menu or dialog at a time, over everything. A tap outside closes it.

export interface MenuItem { label: string; run: () => void; checked?: boolean }

let open: HTMLElement[] = [];

/** Close the open menu or dialog; true if there was one. */
export function closeOverlay(): boolean {
  const had = open.length > 0;
  for (const e of open) e.remove();
  open = [];
  return had;
}

export const overlayOpen = () => open.length > 0;

export function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/** A menu below `anchor`, kept on the screen. Falsy items are left out. */
export function showMenu(anchor: Element, title: string, items: (MenuItem | false | null | undefined)[]) {
  closeOverlay();
  const catcher = el('div', 'catcher');
  catcher.addEventListener('pointerdown', (e) => { e.preventDefault(); closeOverlay(); });
  const menu = el('div', 'menu');
  menu.setAttribute('role', 'menu');
  menu.append(el('div', 'label', title));
  for (const it of items) {
    if (!it) continue;
    const b = button(it.label, () => { closeOverlay(); it.run(); });
    b.setAttribute('role', it.checked === undefined ? 'menuitem' : 'menuitemradio');
    if (it.checked !== undefined) b.setAttribute('aria-checked', String(it.checked));
    menu.append(b);
  }
  document.body.append(catcher, menu);
  open = [catcher, menu];
  const a = anchor.getBoundingClientRect();
  const left = Math.min(Math.max(8, a.left), innerWidth - menu.offsetWidth - 8);
  const below = a.bottom + 4;
  const top = below + menu.offsetHeight > innerHeight - 8 ? Math.max(8, a.top - 4 - menu.offsetHeight) : below;
  Object.assign(menu.style, { left: left + 'px', top: top + 'px' });
  menu.querySelector('button')?.focus();
}

/** A dialog with a heading, over a scrim. The caller fills it. */
export function showDialog(title: string, cls = ''): HTMLElement {
  closeOverlay();
  const scrim = el('div', 'scrim');
  scrim.addEventListener('pointerdown', (e) => { e.preventDefault(); closeOverlay(); });
  const d = el('div', ('dialog ' + cls).trim());
  d.setAttribute('role', 'dialog');
  d.setAttribute('aria-modal', 'true');
  d.setAttribute('aria-label', title);
  d.append(el('h2', '', title));
  document.body.append(scrim, d);
  open = [scrim, d];
  return d;
}

export function buttonRow(...buttons: (HTMLElement | null)[]): HTMLElement {
  const row = el('div', 'buttons');
  row.append(...buttons.filter((b): b is HTMLElement => !!b));
  return row;
}

/** Ask for a setlist's name. */
export function askName(heading: string, value: string, okLabel: string, done: (name: string) => void) {
  const d = showDialog(heading);
  const input = el('input', 'name');
  input.type = 'text';
  input.value = value;
  input.placeholder = 'For example, Spring recital';
  input.setAttribute('aria-label', 'Setlist name');
  const ok = () => {
    const v = input.value.trim();
    if (!v) { input.focus(); return; }
    closeOverlay();
    done(v);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  d.append(input, buttonRow(button('Cancel', closeOverlay), button(okLabel, ok, 'primary')));
  input.focus();
  input.select();
}

/** A message at the bottom of the screen, with an optional action such as Undo. */
export class Toast {
  readonly el = el('div', 'toast');
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.el.setAttribute('role', 'status');
    this.el.hidden = true;
  }

  say(text: string, action?: [label: string, run: () => void]) {
    this.el.replaceChildren(el('span', '', text));
    this.el.classList.toggle('act', !!action);
    if (action) this.el.append(button(action[0], () => { this.hide(); action[1](); }));
    this.el.hidden = false;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.hide(), action ? 6000 : 3500);
  }

  hide() {
    clearTimeout(this.timer);
    this.el.hidden = true;
  }
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
