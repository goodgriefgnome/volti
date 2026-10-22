import { cutAt, edgeKind, joinNext, remove, restoreEdge, setPad, tidy } from '../../pieces/edits';
import type { Placed } from '../../pieces/frames';
import type { Cut, State } from '../../pieces/model';
import { el } from '../../ui/dom';
import type { Action } from '../../ui/menu';
import type { FrameSlot } from '../spread';
import { pageLabel, sayArchived, type Edge, type Editing } from './host';
import { openPicker } from './insert-picker';

// The menus on a right-click or a long press: on a tab, on the music, or above or below it.

/** The menu for whatever is at (x, y) on the screen. */
export function openContext(ed: Editing, x: number, y: number) {
  const { host, popups } = ed;
  const tab = document.elementFromPoint(x, y)?.closest<HTMLElement>('.tab');
  if (tab) { tabMenu(ed, tab.dataset.cut!, tab.dataset.edge as Edge | 'pad', x, y); return; }
  const slot = host.slots().find((s) => {
    const r = s.box.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  });
  const f = slot && host.frames()[slot.index];
  if (!slot || !f?.items.length) return;
  const r = slot.box.getBoundingClientRect();
  const fy = (y - r.top) / r.width;
  const item = f.items.find((p) => fy >= p.top && fy < p.top + p.h);
  if (item) { cutMenu(ed, slot, item, fy, x, y); return; }
  const above = fy < f.items[0].top;
  const c = above ? f.items[0].cut : f.items.at(-1)!.cut;
  popups.showMenu(x, y, above ? 'Above the music' : 'Below the music', [
    ['Insert pages here…', () => openPicker(ed, { id: c.id, after: !above }, 'Insert pages here', c.page)],
  ]);
}

/** Apply an edit from a menu: tidy, and show the given cut. */
function apply({ host }: Editing, s: State, focus?: string) {
  const before = host.state();
  host.commit(tidy(s), focus);
  if (host.state().piece.archived.length > before.piece.archived.length) sayArchived(host);
}

function removeAction(ed: Editing, c: Cut): Action[] {
  const s = ed.host.state();
  if (s.piece.cuts.length <= 1) return [];
  return [['Remove this cut', () => apply(ed, remove(s, c.id), c.id)]];
}

export function tabMenu(ed: Editing, id: string, kind: Edge | 'pad', x: number, y: number) {
  const { host, popups } = ed;
  const s = host.state(), cuts = s.piece.cuts, i = cuts.findIndex((c) => c.id === id);
  const c = cuts[i];
  if (!c) return;
  if (kind === 'pad') {
    const acts: Action[] = (c.pad ?? 0) > 0.001 ? [['Remove the white space', () => apply(ed, setPad(s, id, 0, host.aspects), id)]] : [];
    popups.showMenu(x, y, 'Space above the music', acts);
    return;
  }
  const top = kind === 'top', acts: Action[] = [];
  const first = top ? cuts[i - 1] : c;
  switch (edgeKind(cuts, i, kind)) {
    case 'cutOut':
      acts.push([top ? 'Restore the music cut out above' : 'Restore the music cut out below', () => apply(ed, joinNext(s, first.id), first.id)]);
      break;
    case 'split':
      acts.push([top ? 'Join with the cut above' : 'Join with the cut below', () => apply(ed, joinNext(s, first.id), first.id)]);
      break;
    case 'trimmed':
      acts.push([top ? 'Restore the top of the page' : 'Restore the bottom of the page', () => apply(ed, restoreEdge(s, id, kind), id)]);
      break;
  }
  acts.push(...removeAction(ed, c));
  popups.showMenu(x, y, `${top ? 'Top' : 'Bottom'} of this cut (${pageLabel(c)})`, acts);
}

/** The menu on a cut's music, pressed `fy` frame widths from the top of the frame. */
function cutMenu(ed: Editing, slot: FrameSlot, p: Placed, fy: number, x: number, y: number) {
  const { host, popups } = ed;
  const c = p.cut, s = host.state();
  const at = c.y0 + (fy - p.top) / host.aspects[c.page];
  const cut = cutAt(s, c.id, at, host.aspects);
  popups.showMenu(x, y, `Cut from ${pageLabel(c)}`, [
    ...(cut ? [['Cut here', () => host.commit(cut, c.id)] as Action] : []),
    ['Insert pages before this cut…', () => openPicker(ed, { id: c.id, after: false }, `Insert pages before this cut (${pageLabel(c)})`, c.page)],
    ['Insert pages after this cut…', () => openPicker(ed, { id: c.id, after: true }, `Insert pages after this cut (${pageLabel(c)})`, c.page)],
    ...removeAction(ed, c),
  ]);
  // Show where "Cut here" would cut while the menu is open.
  if (cut && slot.ui) {
    const mark = el('div', 'cut-mark');
    mark.style.top = fy * slot.w + 'px';
    slot.ui.append(mark);
    popups.mark = mark;
  }
}
