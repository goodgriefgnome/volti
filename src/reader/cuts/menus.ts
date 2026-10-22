// The cut editor's menus, on a right-click or a long press: on a tab, on the music, or above or
// below it.

import { cutAt, edgeKind, joinNext, remove, restoreEdge, setPad, tidy } from '../../scores/edits';
import type { Placed } from '../../scores/frames';
import type { Cut, State } from '../../scores/model';
import { el } from '../../ui/dom';
import { closeWithOverlay, showMenu, type MenuItem } from '../../ui/overlay';
import type { FrameSlot } from '../spread';
import { pageLabel, sayArchived, type Edge, type EditorHost } from './host';
import { openPicker } from './insert-picker';

/** A menu at (x, y) on the screen, kept inside the stage. */
const menuAt = (host: EditorHost, x: number, y: number, title: string, items: MenuItem[]) =>
  showMenu({ x, y }, title, items, host.stage.getBoundingClientRect());

/** The menu for whatever is at (x, y) on the screen. */
export function openContext(host: EditorHost, x: number, y: number) {
  const tab = document.elementFromPoint(x, y)?.closest<HTMLElement>('.tab');
  if (tab) { tabMenu(host, tab.dataset.cut!, tab.dataset.edge as Edge | 'pad', x, y); return; }
  const slot = host.slots().find((s) => {
    const r = s.box.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  });
  const f = slot && host.frames()[slot.index];
  if (!slot || !f?.items.length) return;
  const r = slot.box.getBoundingClientRect();
  const fy = (y - r.top) / r.width;
  const item = f.items.find((p) => fy >= p.top && fy < p.top + p.h);
  if (item) { cutMenu(host, slot, item, fy, x, y); return; }
  const above = fy < f.items[0].top;
  const c = above ? f.items[0].cut : f.items.at(-1)!.cut;
  menuAt(host, x, y, above ? 'Above the music' : 'Below the music', [
    { label: 'Insert pages here…', run: () => openPicker(host, { id: c.id, after: !above }, 'Insert pages here', c.page) },
  ]);
}

/** Apply an edit from a menu: tidy, and show the given cut. */
function apply(host: EditorHost, s: State, focus?: string) {
  const before = host.state();
  host.commit(tidy(s), focus);
  if (host.state().score.archived.length > before.score.archived.length) sayArchived(host);
}

function removeItem(host: EditorHost, c: Cut): MenuItem[] {
  const s = host.state();
  if (s.score.cuts.length <= 1) return [];
  return [{ label: 'Remove this cut', run: () => apply(host, remove(s, c.id), c.id) }];
}

export function tabMenu(host: EditorHost, id: string, kind: Edge | 'pad', x: number, y: number) {
  const s = host.state(), cuts = s.score.cuts, i = cuts.findIndex((c) => c.id === id);
  const c = cuts[i];
  if (!c) return;
  if (kind === 'pad') {
    const items: MenuItem[] = (c.pad ?? 0) > 0.001 ? [{ label: 'Remove the white space', run: () => apply(host, setPad(s, id, 0, host.aspects), id) }] : [];
    menuAt(host, x, y, 'Space above the music', items);
    return;
  }
  const top = kind === 'top', items: MenuItem[] = [];
  const first = top ? cuts[i - 1] : c;
  switch (edgeKind(cuts, i, kind)) {
    case 'cutOut':
      items.push({ label: top ? 'Restore the music cut out above' : 'Restore the music cut out below', run: () => apply(host, joinNext(s, first.id), first.id) });
      break;
    case 'split':
      items.push({ label: top ? 'Join with the cut above' : 'Join with the cut below', run: () => apply(host, joinNext(s, first.id), first.id) });
      break;
    case 'trimmed':
      items.push({ label: top ? 'Restore the top of the page' : 'Restore the bottom of the page', run: () => apply(host, restoreEdge(s, id, kind), id) });
      break;
  }
  items.push(...removeItem(host, c));
  menuAt(host, x, y, `${top ? 'Top' : 'Bottom'} of this cut (${pageLabel(c)})`, items);
}

/** The menu on a cut's music, pressed `fy` frame widths from the top of the frame. */
function cutMenu(host: EditorHost, slot: FrameSlot, p: Placed, fy: number, x: number, y: number) {
  const c = p.cut, s = host.state();
  const at = c.y0 + (fy - p.top) / host.aspects[c.page];
  const cut = cutAt(s, c.id, at, host.aspects);
  menuAt(host, x, y, `Cut from ${pageLabel(c)}`, [
    ...(cut ? [{ label: 'Cut here', run: () => host.commit(cut, c.id) }] : []),
    { label: 'Insert pages before this cut…', run: () => openPicker(host, { id: c.id, after: false }, `Insert pages before this cut (${pageLabel(c)})`, c.page) },
    { label: 'Insert pages after this cut…', run: () => openPicker(host, { id: c.id, after: true }, `Insert pages after this cut (${pageLabel(c)})`, c.page) },
    ...removeItem(host, c),
  ]);
  // Show where "Cut here" would cut while the menu is open.
  if (cut && slot.ui) {
    const mark = el('div', 'cut-mark');
    mark.style.top = fy * slot.w + 'px';
    slot.ui.append(mark);
    closeWithOverlay(mark);
  }
}
