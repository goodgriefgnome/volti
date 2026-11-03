// The Symbols tool's long-press panel: the library, to pick and arrange symbols, beside the
// symbols' settings.

import { symbolsOf, type SymbolAt, type SymbolLibrary } from '../markings/library';
import { button, el, GRIP, icon } from '../ui/dom';
import { dragToReorder } from '../ui/drag-reorder';
import { closeOverlay, showMenu } from '../ui/overlay';
import { isTap } from './_gestures';
import { symbolPicture } from './_symbol-picture';
import { lookParts, type LookActions, type SymbolSettingsView } from './_tool-panels';

export interface SymbolPanelHost {
  library(): SymbolLibrary;
  /** The tool's symbol, lit. */
  tool(): SymbolAt | undefined;
  pick(at: SymbolAt): void;
  move(from: SymbolAt, to: SymbolAt | 'new'): void;
  /** The group at `from` goes to `to`, as `moveGroup` counts. */
  moveGroup(from: number, to: number): void;
  add(): void;
  edit(): void;
}

const INK = '#1d2026';
const SYMBOL_PX = 44;

/** Where the symbols can be dropped: each box's group (-1 for Recent) with its symbol buttons. */
interface Box { group: number; box: HTMLElement; buttons: HTMLElement[] }

/**
 * The place in `box` before which a point at (x, y) drops: the first symbol that is on a later
 * row, or in the same row and not left of the point's middle; the number of symbols when none.
 */
function slotIn(box: Box, x: number, y: number): number {
  for (let i = 0; i < box.buttons.length; i++) {
    const r = box.buttons[i].getBoundingClientRect();
    if (y < r.bottom && (y < r.top || x < r.left + r.width / 2)) return i;
  }
  return box.buttons.length;
}

const inside = (r: DOMRect, x: number, y: number) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

export function showSymbolPanel(at: HTMLElement, host: SymbolPanelHost, settings: SymbolSettingsView, act: LookActions): void {
  const panel = el('div', 'symbol-panel');
  const library = el('div', 'symbol-library');
  const side = el('div', 'symbol-settings');
  panel.append(library, side);
  panel.style.maxHeight = Math.max(240, innerHeight - at.getBoundingClientRect().bottom - 24) + 'px';

  const drawSettings = () => side.replaceChildren(...lookParts(settings, act, drawSettings));

  /** Draw the library again; a symbol's press is a tap that picks it, or a drag that moves it. */
  const drawLibrary = () => {
    const lib = host.library(), lit = host.tool();
    const boxes: Box[] = [];
    const groups = el('div', 'group-list');
    const newGroup = el('div', 'new-group', 'Drag here for a new group');
    newGroup.hidden = true;

    const makeBox = (group: number): Box => {
      const box = el('div', 'group-box');
      const buttons = symbolsOf(lib, group).map((sym, index) => {
        const b = el('button', 'symbol-choice');
        b.type = 'button';
        b.setAttribute('aria-pressed', String(!!lit && lit.group === group && lit.index === index));
        b.append(symbolPicture(sym, INK, SYMBOL_PX));
        b.addEventListener('pointerdown', (e) => begin(e, b, { group, index }));
        return b;
      });
      // Each group but Recent has a grip at its left edge, which moves the group.
      if (group >= 0) {
        const grip = el('div', 'group-grip');
        grip.append(icon(GRIP));
        grip.setAttribute('aria-label', 'Move group');
        grip.setAttribute('role', 'button');
        dragToReorder(grip, box, groups, group, (to) => { host.moveGroup(group, to); drawLibrary(); });
        box.append(grip);
      }
      box.append(...buttons);
      return { group, box, buttons };
    };
    lib.groups.forEach((_, g) => boxes.push(makeBox(g)));
    const recent = lib.adhoc.length ? makeBox(-1) : undefined;
    if (recent) boxes.push(recent);

    groups.append(...boxes.filter((b) => b.group >= 0).map((b) => b.box));
    library.replaceChildren(
      groups,
      newGroup,
      ...(recent ? [el('div', 'label', 'Recent'), recent.box] : []),
      el('div', 'symbol-actions'),
    );
    library.lastElementChild!.append(button('+', () => { closeOverlay(); host.add(); }, 'symbol-add'), button('Edit library…', () => { closeOverlay(); host.edit(); }));

    /** The drop under the pointer: a place in a box, or a new group. */
    const dropAt = (x: number, y: number, from: SymbolAt): { to: SymbolAt | 'new'; line: DOMRect | undefined } | undefined => {
      if (inside(newGroup.getBoundingClientRect(), x, y)) return { to: 'new', line: undefined };
      for (const box of boxes) {
        const r = box.box.getBoundingClientRect();
        if (!inside(r, x, y)) continue;
        const k = slotIn(box, x, y);
        // The place it lands at, with the symbol out of its list first.
        const index = box.group === from.group && from.index < k ? k - 1 : k;
        const before = box.buttons[k], after = box.buttons[k - 1];
        const line = before ? before.getBoundingClientRect() : after ? after.getBoundingClientRect() : r;
        return { to: { group: box.group, index }, line: before || !after ? new DOMRect(line.left, line.top, 0, line.height || SYMBOL_PX) : new DOMRect(line.right, line.top, 0, line.height) };
      }
      return undefined;
    };

    const begin = (e: PointerEvent, b: HTMLElement, from: SymbolAt) => {
      if (e.button > 0) return;
      const x0 = e.clientX, y0 = e.clientY;
      let ghost: HTMLElement | undefined, line: HTMLElement | undefined, target: ReturnType<typeof dropAt>;
      b.setPointerCapture(e.pointerId);
      const sym = symbolsOf(host.library(), from.group)[from.index];
      const stop = () => {
        b.removeEventListener('pointermove', move);
        b.removeEventListener('pointerup', up);
        b.removeEventListener('pointercancel', cancel);
        ghost?.remove();
        line?.remove();
        newGroup.hidden = true;
      };
      const move = (m: PointerEvent) => {
        if (!ghost) {
          if (isTap({ x0, y0, x1: m.clientX, y1: m.clientY, ms: 0 })) return;
          // The button follows the pointer; a dashed box offers a new group.
          ghost = el('div', 'drag-ghost');
          ghost.append(symbolPicture(sym, INK, SYMBOL_PX));
          line = el('div', 'drop-line');
          line.hidden = true;
          panel.append(ghost, line);
          newGroup.hidden = false;
          b.classList.add('dragging');
        }
        ghost.style.left = m.clientX - SYMBOL_PX / 2 + 'px';
        ghost.style.top = m.clientY - SYMBOL_PX / 2 + 'px';
        target = dropAt(m.clientX, m.clientY, from);
        newGroup.classList.toggle('over', target?.to === 'new');
        const l = target?.line;
        line!.hidden = !l;
        if (l) Object.assign(line!.style, { left: l.left - 1.5 + 'px', top: l.top + 'px', height: l.height + 'px' });
      };
      const up = (u: PointerEvent) => {
        const dragged = !!ghost, drop = dragged ? dropAt(u.clientX, u.clientY, from) : undefined;
        stop();
        if (!dragged) { host.pick(from); drawLibrary(); drawSettings(); return; }
        if (drop) { host.move(from, drop.to); drawLibrary(); }
        else b.classList.remove('dragging');
      };
      const cancel = () => { stop(); b.classList.remove('dragging'); };
      b.addEventListener('pointermove', move);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', cancel);
    };
  };

  drawLibrary();
  drawSettings();
  showMenu(at, 'Symbols', [panel]);
}
