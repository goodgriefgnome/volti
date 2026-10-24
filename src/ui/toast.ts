// Toasts: short messages at the bottom of the screen, some with an action such as Undo.

import { button, el } from './dom';

/** A message at the bottom of the screen, with an optional action such as Undo. */
export class Toast {
  readonly el = el('div', 'toast');
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.el.setAttribute('role', 'status');
    this.el.hidden = true;
  }

  /** Show `text`, for a few seconds, or (`stay`) until hidden or another is shown. */
  say(text: string, action?: [label: string, run: () => void], stay = false) {
    this.el.replaceChildren(el('span', '', text));
    this.el.classList.toggle('act', !!action);
    if (action) this.el.append(button(action[0], () => { this.hide(); action[1](); }));
    this.el.hidden = false;
    clearTimeout(this.timer);
    if (!stay) this.timer = setTimeout(() => this.hide(), action ? 6000 : 3500);
  }

  hide() {
    clearTimeout(this.timer);
    this.el.hidden = true;
  }
}
