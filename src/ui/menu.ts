import { el } from './dom';

export type Action = [label: string, run: () => void];

/** The one menu or dialog open over a screen. Opening another closes it. */
export class Popups {
  menu: HTMLElement | null = null;
  dialog: HTMLElement | null = null;
  /** Shown with the menu and removed with it, such as where "Cut here" would cut. */
  mark: HTMLElement | null = null;

  /** Popups are added to `root` and kept inside `stage`. */
  constructor(private root: HTMLElement, private stage: HTMLElement) {}

  /** Close an open menu or dialog; true if there was one. */
  dismiss(): boolean {
    const had = !!(this.menu || this.dialog);
    this.menu?.remove();
    this.dialog?.remove();
    this.mark?.remove();
    this.menu = this.dialog = this.mark = null;
    return had;
  }

  /** A small menu at (x, y) on the screen, kept inside the stage. */
  showMenu(x: number, y: number, title: string, acts: Action[]) {
    this.dismiss();
    const menu = el('div', 'menu');
    menu.setAttribute('role', 'menu');
    menu.append(el('div', 'label', title));
    for (const [label, run] of acts) {
      const b = el('button', '', label);
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.addEventListener('click', () => { this.dismiss(); run(); });
      menu.append(b);
    }
    if (!acts.length) menu.append(el('div', 'label', 'Nothing to do here.'));
    this.root.append(menu);
    const st = this.stage.getBoundingClientRect();
    const left = Math.min(Math.max(x, st.left + 4), st.right - menu.offsetWidth - 4);
    const top = Math.min(Math.max(y + 4, st.top + 4), st.bottom - menu.offsetHeight - 4);
    Object.assign(menu.style, { left: left + 'px', top: top + 'px' });
    menu.querySelector('button')?.focus();
    this.menu = menu;
  }

  openDialog(title: string): HTMLElement {
    this.dismiss();
    const d = el('div', 'dialog');
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-modal', 'true');
    d.setAttribute('aria-label', title);
    d.append(el('h2', '', title));
    this.root.append(d);
    this.dialog = d;
    return d;
  }
}
