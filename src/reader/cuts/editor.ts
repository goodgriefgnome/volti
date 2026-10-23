// Editing the played order on the frames: the tabs over each frame, dragging them, and long
// presses. Menus are in menus.ts and each dialog in its own file; the edits themselves are
// scores/edits.ts.

import { edgeRange, release, setEdge, setPad, tidy } from '../../scores/edits';
import { freeze, roomBefore, type Frame } from '../../scores/frames';
import type { Cut, State } from '../../scores/model';
import { el } from '../../ui/dom';
import { closeOverlay, overlayOpen } from '../../ui/overlay';
import type { Hatches } from '../../render/paint';
import type { FrameSlot } from '../spread';
import { openArchive } from './archive';
import { pageLabel, sayArchived, type Edge, type EditorHost } from './host';
import { openContext, tabMenu } from './menus';

type Drag =
  | { kind: 'edge'; pointer: number; id: string; edge: Edge; y0: number; orig: Cut; range: [number, number]; perUnit: number; before: State; frames: Frame[]; moved: boolean; current: State; tab: Element }
  | { kind: 'pad'; pointer: number; id: string; y0: number; orig: number; perUnit: number; before: State; frames: Frame[]; moved: boolean; current: State; tab: Element };

const LONG_PRESS_MS = 500;
const PRESS_SLOP = 6;
const DRAG_SLOP = 4;

/**
 * Editing the played order on the frames themselves: tabs that move a cut's edges, a tab for
 * white space at the top of a frame, shading for the room left on the frame before, and menus
 * on a right-click or a long press (menus.ts). Everything else on the frames (turning, writing,
 * zooming) works as usual.
 */
export class CutEditor {
  enabled = false;
  private drag: Drag | null = null;
  private press: { pointer: number; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null = null;

  constructor(private host: EditorHost) {}

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) { this.cancel(); this.dismiss(); }
  }

  /** Stop a drag or long press, as when a second finger lands. */
  cancel() {
    this.endPress();
    if (this.drag?.moved) this.host.preview(null, null);
    this.drag = null;
  }

  /** Close an open menu or dialog; true if there was one. */
  dismiss(): boolean {
    return closeOverlay();
  }

  /* ---------- the tabs and shading over each frame ---------- */

  decorate(slots: FrameSlot[], frames: Frame[], dragging = false) {
    for (const s of slots) { s.ui?.remove(); s.ui = undefined; }
    if (!this.enabled) return;
    const d = this.drag;
    const cuts = (d?.current ?? this.host.state()).score.cuts;
    const now = new Map(cuts.map((c) => [c.id, c]));
    const { aspects } = this.host;
    for (const slot of slots) {
      const f = frames[slot.index];
      if (!f?.items.length) continue;
      const w = slot.w, ui = el('div', 'cuts-ui');
      const at = (y: number) => y * w + 'px';

      // How much of this frame's music would fit on the frame before, when that one is fairly empty.
      const room = dragging ? null : roomBefore(frames, slot.index);
      if (room !== null) {
        const band = el('div', 'room');
        band.style.height = at(room);
        ui.append(band);
      }

      for (const p of f.items) {
        // While dragging, the cut is drawn with all the music it had or has; its tabs sit at its edges now.
        const c = now.get(p.cut.id) ?? p.cut, a = aspects[c.page];
        const y = (v: number) => p.top + (v - p.cut.y0) * a;
        ui.append(this.tab(c, 'top', at(y(c.y0))), this.tab(c, 'bottom', at(y(c.y1))));
      }

      const first = f.items[0], c = now.get(first.cut.id) ?? first.cut;
      if (first.top > 0.001) {
        const line = el('div', 'pad-line');
        line.style.top = at(first.top);
        ui.append(line);
      }
      ui.append(this.tab(c, 'pad', at(first.top)));
      slot.box.append(ui);
      slot.ui = ui;
    }
  }

  private tab(c: Cut, kind: Edge | 'pad', top: string): HTMLElement {
    const b = el('button', `tab ${kind}`);
    b.type = 'button';
    b.dataset.cut = c.id;
    b.dataset.edge = kind;
    b.style.top = top;
    b.setAttribute('aria-label', kind === 'pad' ? 'Space above the music' : `${kind === 'top' ? 'Top' : 'Bottom'} of this cut (${pageLabel(c)})`);
    const d = this.drag;
    if (d && d.moved && d.id === c.id && (d.kind === 'pad' ? 'pad' : d.edge) === kind) b.classList.add('dragging');
    // From the keyboard, a tab opens its menu.
    b.addEventListener('click', (e) => {
      if (e.detail !== 0) return;
      const r = b.getBoundingClientRect();
      tabMenu(this.host, c.id, kind, r.left, r.bottom);
    });
    return b;
  }

  /* ---------- pointers ---------- */

  onDown(e: PointerEvent): boolean {
    if (overlayOpen()) { this.dismiss(); return true; }
    if (!this.enabled) return false;
    const target = e.target as Element;
    const tab = target.closest<HTMLElement>('.tab');
    const slot = this.host.slots().find((s) => s.box.contains(target));
    if (tab && slot) {
      const id = tab.dataset.cut!, kind = tab.dataset.edge as Edge | 'pad';
      const s = this.host.state(), i = s.score.cuts.findIndex((c) => c.id === id);
      const c = s.score.cuts[i];
      const rect = slot.box.getBoundingClientRect();
      const base = { pointer: e.pointerId, id, y0: e.clientY, before: s, frames: this.host.frames(), moved: false, current: s, tab };
      this.drag = kind === 'pad'
        ? { ...base, kind: 'pad', orig: c.pad ?? 0, perUnit: rect.width }
        : { ...base, kind: 'edge', edge: kind, orig: c, range: edgeRange(s.score.cuts, i, kind), perUnit: rect.width * this.host.aspects[c.page] };
      this.startPress(e, () => {
        this.drag = null;
        const r = tab.getBoundingClientRect();
        tabMenu(this.host, id, kind, r.left, r.bottom);
      });
      return true;
    }
    if (!this.host.inking()) {
      this.startPress(e, () => {
        this.host.cancelGesture();
        openContext(this.host, e.clientX, e.clientY);
      });
    }
    return false;
  }

  onMove(e: PointerEvent): boolean {
    const p = this.press;
    if (p && p.pointer === e.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) > PRESS_SLOP) this.endPress();
    const d = this.drag;
    if (!d || d.pointer !== e.pointerId) return false;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.abs(dy) <= DRAG_SLOP) return true;
    d.moved = true;
    this.endPress();
    const { aspects } = this.host;
    if (d.kind === 'pad') {
      d.current = setPad(d.before, d.id, d.orig + dy / d.perUnit, aspects);
      this.host.preview(d.current, freeze(d.frames, d.current.score.cuts, aspects));
      return true;
    }
    const v = (d.edge === 'top' ? d.orig.y0 : d.orig.y1) + dy / d.perUnit;
    d.current = setEdge(d.before, d.id, d.edge, v, d.range);
    // Show the cut with all the music it had or has now: what is being cut away stays, hatched.
    const now = d.current.score.cuts.find((c) => c.id === d.id)!;
    const shown: Cut = { ...now, y0: Math.min(now.y0, d.orig.y0), y1: Math.max(now.y1, d.orig.y1) };
    const cuts = d.current.score.cuts.map((c) => (c.id === d.id ? shown : c));
    const hatches: Hatches = new Map([[d.id, [[d.orig.y0, now.y0], [now.y1, d.orig.y1]].filter(([a, b]) => b > a) as [number, number][]]]);
    this.host.preview(d.current, freeze(d.frames, cuts, aspects), hatches);
    return true;
  }

  onUp(e: PointerEvent, cancelled: boolean): boolean {
    if (this.press?.pointer === e.pointerId) this.endPress();
    const d = this.drag;
    if (!d || d.pointer !== e.pointerId) return false;
    this.drag = null;
    if (!d.moved) return true; // a tap on a tab does nothing
    if (cancelled) { this.host.preview(null, null); return true; }
    if (d.kind === 'pad') { this.host.commit(tidy(d.current), d.id); return true; }
    const after = release(d.current, d.before, d.id);
    this.host.commit(after, d.id);
    if (after.score.archived.length > d.before.score.archived.length) sayArchived(this.host);
    return true;
  }

  onContext(e: MouseEvent) {
    if (!this.enabled) return;
    e.preventDefault();
    this.endPress();
    if (this.drag?.moved) this.host.preview(null, null);
    this.drag = null;
    this.host.cancelGesture();
    // Android may send this after a long press has already opened the same menu.
    if (!overlayOpen()) openContext(this.host, e.clientX, e.clientY);
  }

  private startPress(e: PointerEvent, open: () => void) {
    this.endPress();
    this.press = { pointer: e.pointerId, x: e.clientX, y: e.clientY, timer: setTimeout(() => { this.press = null; open(); }, LONG_PRESS_MS) };
  }

  private endPress() {
    if (this.press) clearTimeout(this.press.timer);
    this.press = null;
  }

  /** Archived cuts, to delete for good. */
  openArchive() {
    openArchive(this.host);
  }
}
