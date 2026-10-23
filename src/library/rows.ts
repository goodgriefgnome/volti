// A row of the library's lists that slides open to show more under it: a setlist's scores, a
// score's named excerpts.

import { button, el } from '../ui/dom';

let seq = 0;

export interface ExpandableRow {
  /** Classes of the row ("set", "score set"). */
  cls: string;
  /** What the row is, for remembering whether it is open. */
  id: string;
  /** The rows open now, by id; this one is added or taken out as its arrow is tapped. */
  open: Set<string>;
  /** Names what opens, for screen readers ("Scores in Spring recital"). */
  label: string;
  /** The rest of the row's head, after the arrow. */
  head: HTMLElement[];
  /** What opens; with none, the row has no arrow, only the room for one. */
  inner?: HTMLElement;
}

export function expandableRow(r: ExpandableRow): HTMLLIElement {
  const open = !!r.inner && r.open.has(r.id);
  const li = el('li', r.cls + (open ? ' open' : ''));
  const head = el('div', 'set-head');
  li.append(head);
  if (!r.inner) {
    head.append(el('span', 'expand'), ...r.head);
    return li;
  }
  const body = el('div', 'set-body');
  body.id = 'row-' + ++seq;
  body.inert = !open;
  const inner = el('div', 'set-inner');
  inner.append(r.inner);
  body.append(inner);
  const expand = button('', () => {
    const now = !r.open.has(r.id);
    if (now) r.open.add(r.id); else r.open.delete(r.id);
    li.classList.toggle('open', now);
    expand.setAttribute('aria-expanded', String(now));
    body.inert = !now;
  }, 'expand');
  expand.append(el('span', 'chev'));
  expand.setAttribute('aria-expanded', String(open));
  expand.setAttribute('aria-controls', body.id);
  expand.setAttribute('aria-label', r.label);
  head.append(expand, ...r.head);
  li.append(body);
  return li;
}

/** A ⋯ button opening a menu about `what`. */
export function moreButton(what: string, open: (anchor: HTMLElement) => void, label = `More for ${what}`): HTMLButtonElement {
  const more = button('⋯', () => open(more), 'quiet more');
  more.setAttribute('aria-label', label);
  more.setAttribute('aria-haspopup', 'menu');
  return more;
}
