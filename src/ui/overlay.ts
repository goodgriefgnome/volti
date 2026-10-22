// Menus and dialogs, one at a time over everything: a tap outside closes them, and nothing beneath
// takes the tap. Every menu and dialog in the app opens through here.

import { button, el } from './dom';

export interface MenuItem { label: string; run: () => void; checked?: boolean }

let open: HTMLElement[] = [];
let onClose: (() => void)[] = [];

/** Close the open menu or dialog; true if there was one. */
export function closeOverlay(): boolean {
  const had = open.length > 0;
  for (const e of open) e.remove();
  open = [];
  const run = onClose;
  onClose = [];
  for (const f of run) f();
  return had;
}

export const overlayOpen = () => open.length > 0;

/** Remove `e` when the menu or dialog open now closes, such as a mark showing what a menu item would do. */
export function closeWithOverlay(e: HTMLElement) {
  open.push(e);
}

/** Run `f` when the menu or dialog open now closes, however it is closed. */
export function whenOverlayCloses(f: () => void) {
  onClose.push(f);
}

/**
 * A menu below `at`, kept on the screen; or, when `at` is a point, at that point, kept inside
 * `bounds`. Falsy items are left out.
 */
export function showMenu(at: Element | { x: number; y: number }, title: string, items: (MenuItem | false | null | undefined)[], bounds?: DOMRect) {
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
  if (!menu.querySelector('button')) menu.append(el('div', 'label', 'Nothing to do here.'));
  document.body.append(catcher, menu);
  open = [catcher, menu];
  let left: number, top: number;
  if (at instanceof Element) {
    const a = at.getBoundingClientRect();
    left = Math.min(Math.max(8, a.left), innerWidth - menu.offsetWidth - 8);
    const below = a.bottom + 4;
    top = below + menu.offsetHeight > innerHeight - 8 ? Math.max(8, a.top - 4 - menu.offsetHeight) : below;
  } else {
    const b = bounds ?? new DOMRect(0, 0, innerWidth, innerHeight);
    left = Math.min(Math.max(at.x, b.left + 4), b.right - menu.offsetWidth - 4);
    top = Math.min(Math.max(at.y + 4, b.top + 4), b.bottom - menu.offsetHeight - 4);
  }
  Object.assign(menu.style, { left: left + 'px', top: top + 'px' });
  menu.querySelector('button')?.focus();
}

/** A dialog with a heading, over a scrim. The caller fills it; it is open while it is connected. */
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
