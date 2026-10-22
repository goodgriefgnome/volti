import {
  deleteArchived, edgeKind, edgeRange, freeze, insertArchived, insertPages, joinNext, pullUp, release, remove,
  restoreEdge, setEdge, setPad, splitCue, tidy, type Aspects, type Cut, type Frame, type InsertAt, type State,
} from '../pieces/model';
import { snapSplit } from '../pieces/snap';
import { el } from './dom';
import type { Hatches } from './frames';

/** A frame on the screen. Sizes are CSS pixels in the unzoomed spread. */
export interface FrameSlot {
  index: number;
  frame: Frame;
  box: HTMLElement;
  x: number; y: number; w: number; h: number;
  canvas: HTMLCanvasElement;
  ink: HTMLCanvasElement;
  /** A sharp close-up of the visible part while zoomed in: drawn as if the frame were W device pixels wide, from (x, y). */
  detail?: { canvas: HTMLCanvasElement; ink: HTMLCanvasElement; W: number; x: number; y: number };
  /** The editing tabs and cues over the frame. */
  ui?: HTMLElement;
}

export interface EditorHost {
  root: HTMLElement;
  stage: HTMLElement;
  aspects: Aspects;
  state(): State;
  frames(): Frame[];
  slots(): FrameSlot[];
  /** Take the result of an edit: undo, save, reflow, and show the frame holding `focus`. */
  commit(s: State, focus?: string): void;
  /** Show a drag in progress with the layout frozen, or (null) go back to the real layout. */
  preview(s: State | null, frames: Frame[] | null, hatches?: Hatches): void;
  /** The row ink profile of a page, for snapping a split. */
  rows(page: number): Promise<Float32Array>;
  thumb(page: number, width: number): Promise<HTMLCanvasElement>;
  /** An ink tool is selected, so a long press on the music draws instead of opening a menu. */
  inking(): boolean;
  /** Forget the tap or swipe that started with this pointer. */
  cancelGesture(): void;
  say(text: string): void;
  /** Something the toolbar shows may have changed. */
  changed(): void;
}

type Edge = 'top' | 'bottom';

type Drag =
  | { kind: 'edge'; pointer: number; id: string; edge: Edge; y0: number; orig: Cut; range: [number, number]; perUnit: number; before: State; frames: Frame[]; moved: boolean; current: State; tab: Element }
  | { kind: 'pad'; pointer: number; id: string; y0: number; orig: number; perUnit: number; before: State; frames: Frame[]; moved: boolean; current: State; tab: Element }
  | { kind: 'cue'; pointer: number; frame: number };

type Action = [label: string, run: () => void];

const LONG_PRESS_MS = 500;
const PRESS_SLOP = 6;
const DRAG_SLOP = 4;
const THUMB_W = 84;

const pageLabel = (c: Cut) => `page ${c.page + 1}`;

/**
 * Editing the played order on the frames themselves: tabs that move a cut's edges, a tab for
 * white space at the top of a frame, the "split page here" cue, and menus on a right-click or a
 * long press. Everything else on the frames (turning, writing, zooming) works as usual.
 */
export class CutEditor {
  enabled = false;
  private drag: Drag | null = null;
  private press: { pointer: number; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null = null;
  private menu: HTMLElement | null = null;
  private dialog: HTMLElement | null = null;

  constructor(private host: EditorHost) {
    // A tap anywhere else closes a menu; taps on the frames are handled in onDown.
    host.root.addEventListener('pointerdown', (e) => {
      const t = e.target as Node;
      if (this.menu && !this.menu.contains(t) && !host.stage.contains(t)) this.dismiss();
    });
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) { this.cancel(); this.dismiss(); }
  }

  /** Stop a drag or long press, as when a second finger lands. */
  cancel() {
    this.endPress();
    if (this.drag && this.drag.kind !== 'cue' && this.drag.moved) this.host.preview(null, null);
    this.drag = null;
  }

  /** Close an open menu or dialog; true if there was one. */
  dismiss(): boolean {
    const had = !!(this.menu || this.dialog);
    this.menu?.remove();
    this.dialog?.remove();
    this.menu = this.dialog = null;
    return had;
  }

  /* ---------- the tabs and cues over each frame ---------- */

  decorate(slots: FrameSlot[], frames: Frame[], dragging = false) {
    for (const s of slots) { s.ui?.remove(); s.ui = undefined; }
    if (!this.enabled) return;
    const d = this.drag && this.drag.kind !== 'cue' ? this.drag : null;
    const cuts = (d?.current ?? this.host.state()).piece.cuts;
    const now = new Map(cuts.map((c) => [c.id, c]));
    const { aspects } = this.host;
    for (const slot of slots) {
      const f = frames[slot.index];
      if (!f?.items.length) continue;
      const w = slot.w, ui = el('div', 'cuts-ui');
      const at = (y: number) => y * w + 'px';

      const room = dragging ? null : splitCue(frames, slot.index, aspects);
      if (room !== null) {
        const band = el('div', 'cue-band');
        band.style.height = at(room);
        const line = el('button', 'cue-line');
        line.type = 'button';
        line.style.top = `calc(${at(room)} - 16px)`;
        line.append(el('span', 'pill', '✂ split page here'));
        line.addEventListener('click', (e) => { if (e.detail === 0) void this.split(slot.index); });
        ui.append(band, line);
      }

      f.items.forEach((p, n) => {
        // While dragging, the cut is drawn with all the music it had or has; its tabs sit at its edges now.
        const c = now.get(p.cut.id) ?? p.cut, a = aspects[c.page];
        const y = (v: number) => p.top + (v - p.cut.y0) * a;
        ui.append(this.tab(c, 'top', at(y(c.y0))), this.tab(c, 'bottom', at(y(c.y1))));
        if (n < f.items.length - 1 && edgeKind(cuts, p.index, 'bottom') === 'cutOut') {
          const seam = el('div', 'seam');
          seam.style.top = at(p.top + p.h);
          seam.append(el('span', 'pill', '✂ cut'));
          ui.append(seam);
        }
      });

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
    if (d && d.kind !== 'cue' && d.moved && d.id === c.id && (d.kind === 'pad' ? 'pad' : d.edge) === kind) b.classList.add('dragging');
    // From the keyboard, a tab opens its menu.
    b.addEventListener('click', (e) => {
      if (e.detail !== 0) return;
      const r = b.getBoundingClientRect();
      this.tabMenu(c.id, kind, r.left, r.bottom);
    });
    return b;
  }

  /* ---------- pointers ---------- */

  onDown(e: PointerEvent): boolean {
    if (this.menu) { this.dismiss(); return true; }
    if (!this.enabled) return false;
    const target = e.target as Element;
    const tab = target.closest<HTMLElement>('.tab');
    const slot = this.host.slots().find((s) => s.box.contains(target));
    if (tab && slot) {
      const id = tab.dataset.cut!, kind = tab.dataset.edge as Edge | 'pad';
      const s = this.host.state(), i = s.piece.cuts.findIndex((c) => c.id === id);
      const c = s.piece.cuts[i];
      const rect = slot.box.getBoundingClientRect();
      const base = { pointer: e.pointerId, id, y0: e.clientY, before: s, frames: this.host.frames(), moved: false, current: s, tab };
      this.drag = kind === 'pad'
        ? { ...base, kind: 'pad', orig: c.pad ?? 0, perUnit: rect.width }
        : { ...base, kind: 'edge', edge: kind, orig: c, range: edgeRange(s.piece.cuts, i, kind), perUnit: rect.width * this.host.aspects[c.page] };
      this.startPress(e, () => {
        this.drag = null;
        const r = tab.getBoundingClientRect();
        this.tabMenu(id, kind, r.left, r.bottom);
      });
      return true;
    }
    if (target.closest('.cue-line') && slot) {
      this.drag = { kind: 'cue', pointer: e.pointerId, frame: slot.index };
      return true;
    }
    if (!this.host.inking()) {
      this.startPress(e, () => {
        this.host.cancelGesture();
        this.openContext(e.clientX, e.clientY);
      });
    }
    return false;
  }

  onMove(e: PointerEvent): boolean {
    const p = this.press;
    if (p && p.pointer === e.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) > PRESS_SLOP) this.endPress();
    const d = this.drag;
    if (!d || d.pointer !== e.pointerId) return false;
    if (d.kind === 'cue') return true;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.abs(dy) <= DRAG_SLOP) return true;
    d.moved = true;
    this.endPress();
    const { aspects } = this.host;
    if (d.kind === 'pad') {
      d.current = setPad(d.before, d.id, d.orig + dy / d.perUnit, aspects);
      this.host.preview(d.current, freeze(d.frames, d.current.piece.cuts, aspects));
      return true;
    }
    const v = (d.edge === 'top' ? d.orig.y0 : d.orig.y1) + dy / d.perUnit;
    d.current = setEdge(d.before, d.id, d.edge, v, d.range);
    // Show the cut with all the music it had or has now: what is being cut away stays, hatched.
    const now = d.current.piece.cuts.find((c) => c.id === d.id)!;
    const shown: Cut = { ...now, y0: Math.min(now.y0, d.orig.y0), y1: Math.max(now.y1, d.orig.y1) };
    const cuts = d.current.piece.cuts.map((c) => (c.id === d.id ? shown : c));
    const hatches: Hatches = new Map([[d.id, [[d.orig.y0, now.y0], [now.y1, d.orig.y1]].filter(([a, b]) => b > a) as [number, number][]]]);
    this.host.preview(d.current, freeze(d.frames, cuts, aspects), hatches);
    return true;
  }

  onUp(e: PointerEvent, cancelled: boolean): boolean {
    if (this.press?.pointer === e.pointerId) this.endPress();
    const d = this.drag;
    if (!d || d.pointer !== e.pointerId) return false;
    this.drag = null;
    if (d.kind === 'cue') {
      if (!cancelled) void this.split(d.frame);
      return true;
    }
    if (!d.moved) return true; // a tap on a tab does nothing
    if (cancelled) { this.host.preview(null, null); return true; }
    const { aspects } = this.host;
    if (d.kind === 'pad') { this.host.commit(tidy(d.current, aspects), d.id); return true; }
    const after = release(d.current, d.before, d.id, aspects);
    this.host.commit(after, d.id);
    if (after.piece.archived.length > d.before.piece.archived.length) this.sayArchived();
    return true;
  }

  onContext(e: MouseEvent) {
    if (!this.enabled) return;
    e.preventDefault();
    this.endPress();
    if (this.drag && this.drag.kind !== 'cue' && this.drag.moved) this.host.preview(null, null);
    this.drag = null;
    this.host.cancelGesture();
    // Android may send this after a long press has already opened the same menu.
    if (!this.menu) this.openContext(e.clientX, e.clientY);
  }

  private startPress(e: PointerEvent, open: () => void) {
    this.endPress();
    this.press = { pointer: e.pointerId, x: e.clientX, y: e.clientY, timer: setTimeout(() => { this.press = null; open(); }, LONG_PRESS_MS) };
  }

  private endPress() {
    if (this.press) clearTimeout(this.press.timer);
    this.press = null;
  }

  private sayArchived() {
    this.host.say('The cut had markings, so it was archived. Insert it again from "Insert pages…".');
  }

  /** Tap on the cue: split the frame's first cut at a gap between systems, and show the frame before. */
  private async split(frame: number) {
    const first = this.host.frames()[frame]?.items[0];
    if (!first) return;
    const rows = await this.host.rows(first.cut.page).catch(() => undefined);
    const s = this.host.state();
    const r = pullUp(s, frame, this.host.aspects, (_page, y, lo) => (rows ? snapSplit(rows, y, lo) : y));
    if (!r) { this.host.say('There is no gap between systems to split at.'); return; }
    this.host.commit(r.state, r.keep);
  }

  /* ---------- menus ---------- */

  private openContext(x: number, y: number) {
    const tab = document.elementFromPoint(x, y)?.closest<HTMLElement>('.tab');
    if (tab) { this.tabMenu(tab.dataset.cut!, tab.dataset.edge as Edge | 'pad', x, y); return; }
    const slot = this.host.slots().find((s) => {
      const r = s.box.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
    const f = slot && this.host.frames()[slot.index];
    if (!slot || !f?.items.length) return;
    const r = slot.box.getBoundingClientRect();
    const fy = (y - r.top) / r.width;
    const item = f.items.find((p) => fy >= p.top && fy < p.top + p.h);
    if (item) { this.cutMenu(item.cut, x, y); return; }
    const above = fy < f.items[0].top;
    const c = above ? f.items[0].cut : f.items.at(-1)!.cut;
    this.showMenu(x, y, above ? 'Above the music' : 'Below the music', [
      ['Insert pages here…', () => this.openPicker({ id: c.id, after: !above }, 'Insert pages here', c.page)],
    ]);
  }

  /** Apply an edit from a menu: tidy, and show the given cut. */
  private apply(s: State, focus?: string) {
    const before = this.host.state();
    this.host.commit(tidy(s, this.host.aspects), focus);
    if (this.host.state().piece.archived.length > before.piece.archived.length) this.sayArchived();
  }

  private removeAction(c: Cut): Action[] {
    const s = this.host.state();
    if (s.piece.cuts.length <= 1) return [];
    return [['Remove this cut', () => this.apply(remove(s, c.id), c.id)]];
  }

  private tabMenu(id: string, kind: Edge | 'pad', x: number, y: number) {
    const s = this.host.state(), cuts = s.piece.cuts, i = cuts.findIndex((c) => c.id === id);
    const c = cuts[i];
    if (!c) return;
    if (kind === 'pad') {
      const acts: Action[] = (c.pad ?? 0) > 0.001 ? [['Remove the white space', () => this.apply(setPad(s, id, 0, this.host.aspects), id)]] : [];
      this.showMenu(x, y, 'Space above the music', acts);
      return;
    }
    const top = kind === 'top', acts: Action[] = [];
    const first = top ? cuts[i - 1] : c;
    switch (edgeKind(cuts, i, kind)) {
      case 'cutOut':
        acts.push([top ? 'Restore the music cut out above' : 'Restore the music cut out below', () => this.apply(joinNext(s, first.id), first.id)]);
        break;
      case 'split':
        acts.push([top ? 'Join with the cut above' : 'Join with the cut below', () => this.apply(joinNext(s, first.id), first.id)]);
        break;
      case 'trimmed':
        acts.push([top ? 'Restore the top of the page' : 'Restore the bottom of the page', () => this.apply(restoreEdge(s, id, kind), id)]);
        break;
    }
    acts.push(...this.removeAction(c));
    this.showMenu(x, y, `${top ? 'Top' : 'Bottom'} of this cut (${pageLabel(c)})`, acts);
  }

  private cutMenu(c: Cut, x: number, y: number) {
    this.showMenu(x, y, `Cut from ${pageLabel(c)}`, [
      ['Insert pages before this cut…', () => this.openPicker({ id: c.id, after: false }, `Insert pages before this cut (${pageLabel(c)})`, c.page)],
      ['Insert pages after this cut…', () => this.openPicker({ id: c.id, after: true }, `Insert pages after this cut (${pageLabel(c)})`, c.page)],
      ...this.removeAction(c),
    ]);
  }

  /** A small menu at (x, y) on the screen, kept inside the stage. */
  private showMenu(x: number, y: number, title: string, acts: Action[]) {
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
    this.host.root.append(menu);
    const st = this.host.stage.getBoundingClientRect();
    const left = Math.min(Math.max(x, st.left + 4), st.right - menu.offsetWidth - 4);
    const top = Math.min(Math.max(y + 4, st.top + 4), st.bottom - menu.offsetHeight - 4);
    Object.assign(menu.style, { left: left + 'px', top: top + 'px' });
    menu.querySelector('button')?.focus();
    this.menu = menu;
  }

  /* ---------- inserting pages ---------- */

  private openDialog(title: string): HTMLElement {
    this.dismiss();
    const d = el('div', 'dialog');
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-modal', 'true');
    d.setAttribute('aria-label', title);
    d.append(el('h2', '', title));
    this.host.root.append(d);
    this.dialog = d;
    return d;
  }

  /** A copy of a page thumbnail, or of the band y0..y1 of it, drawn into a new canvas once it is ready. */
  private thumbCanvas(page: number, y0 = 0, y1 = 1): HTMLCanvasElement {
    const c = el('canvas');
    const a = this.host.aspects[page], scale = window.devicePixelRatio || 1;
    c.width = Math.round(THUMB_W * scale);
    c.height = Math.max(1, Math.round(THUMB_W * a * (y1 - y0) * scale));
    c.style.width = THUMB_W + 'px';
    const dialog = this.dialog;
    void this.host.thumb(page, THUMB_W).then((src) => {
      if (this.dialog !== dialog) return;
      c.getContext('2d')!.drawImage(src, 0, y0 * src.height, src.width, (y1 - y0) * src.height, 0, 0, c.width, c.height);
    }).catch(() => {});
    return c;
  }

  private openPicker(at: InsertAt, title: string, page: number) {
    const s = this.host.state();
    const d = this.openDialog(title);
    const n = this.host.aspects.length;
    const pick: { a: number; b: number; next: 'a' | 'b'; archived?: string } = { a: page, b: page, next: 'a' };

    const strip = el('div', 'thumbs');
    const pageButtons: HTMLButtonElement[] = [];
    // Draw thumbnails one after another, nearest the selection first, so the ones you see come first.
    const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => Math.abs(x - page) - Math.abs(y - page));
    for (let p = 0; p < n; p++) {
      const b = el('button', 'thumb');
      b.type = 'button';
      b.setAttribute('aria-label', `Page ${p + 1}`);
      const ph = el('div', 'thumb-space');
      ph.style.height = THUMB_W * this.host.aspects[p] + 'px';
      b.append(ph, el('span', '', String(p + 1)));
      b.addEventListener('click', () => {
        pick.archived = undefined;
        if (pick.next === 'a') { pick.a = pick.b = p; pick.next = 'b'; } else { pick.b = p; pick.next = 'a'; }
        sync();
      });
      pageButtons.push(b);
      strip.append(b);
    }
    void (async () => {
      for (const p of order) {
        if (this.dialog !== d) return;
        const c = this.thumbCanvas(p);
        pageButtons[p].firstChild!.replaceWith(c);
        await this.host.thumb(p, THUMB_W).catch(() => {});
      }
    })();
    d.append(strip);

    const archivedButtons: [string, HTMLButtonElement][] = [];
    if (s.piece.archived.length) {
      d.append(el('h3', '', 'Archived cuts'));
      const row = el('div', 'thumbs');
      for (const c of s.piece.archived) {
        const b = el('button', 'thumb');
        b.type = 'button';
        b.setAttribute('aria-label', `Archived cut from page ${c.page + 1}`);
        b.append(this.thumbCanvas(c.page, c.y0, c.y1), el('span', '', `p. ${c.page + 1}`));
        b.addEventListener('click', () => { pick.archived = c.id; sync(); });
        archivedButtons.push([c.id, b]);
        row.append(b);
      }
      d.append(row);
    }

    const copyLabel = el('label', 'check');
    const copy = el('input');
    copy.type = 'checkbox';
    copy.checked = true;
    copyLabel.append(copy, ' Copy markings');
    const hint = el('p', 'hint');
    const cancel = el('button', '', 'Cancel');
    const ok = el('button', 'primary', 'Insert');
    cancel.type = ok.type = 'button';
    cancel.addEventListener('click', () => this.dismiss());
    ok.addEventListener('click', () => {
      this.dismiss();
      const now = this.host.state();
      if (pick.archived) {
        this.host.commit(insertArchived(now, at, pick.archived, this.host.aspects), pick.archived);
        this.host.say('Brought back the archived cut.');
        return;
      }
      const r = insertPages(now, at, pick.a, pick.b, copy.checked, this.host.aspects);
      this.host.commit(r.state, r.first);
      this.host.say(pick.a === pick.b ? `Inserted page ${pick.a + 1}.` : `Inserted pages ${pick.a + 1}–${pick.b + 1}.`);
    });
    const buttons = el('div', 'buttons');
    if (s.piece.archived.length) {
      const manage = el('button', 'quiet', 'Delete archived cuts…');
      manage.type = 'button';
      manage.addEventListener('click', () => this.openArchive());
      buttons.append(manage);
    }
    buttons.append(cancel, ok);
    d.append(copyLabel, hint, buttons);

    const sync = () => {
      const lo = Math.min(pick.a, pick.b), hi = Math.max(pick.a, pick.b);
      pageButtons.forEach((b, p) => b.setAttribute('aria-pressed', String(!pick.archived && p >= lo && p <= hi)));
      for (const [id, b] of archivedButtons) b.setAttribute('aria-pressed', String(pick.archived === id));
      copyLabel.hidden = !!pick.archived;
      hint.textContent = pick.archived
        ? 'The archived cut comes back with its markings.'
        : (lo === hi ? `Page ${lo + 1}` : `Pages ${pick.a + 1}–${pick.b + 1}`)
          + (pick.next === 'b' ? '. Tap another page to insert a range.' : '. Tap a page to start again.');
    };
    sync();
    pageButtons[page]?.scrollIntoView({ inline: 'center', block: 'nearest' });
    ok.focus();
  }

  /** Archived cuts, to delete for good. */
  openArchive() {
    const d = this.openDialog('Archived cuts');
    const list = el('ul', 'archive');
    const fill = () => {
      const s = this.host.state();
      list.replaceChildren();
      if (!s.piece.archived.length) list.append(el('li', 'empty', 'No archived cuts.'));
      for (const c of s.piece.archived) {
        const li = el('li');
        const n = s.ink[c.id]?.length ?? 0;
        const del = el('button', '', 'Delete for good');
        del.type = 'button';
        del.addEventListener('click', () => {
          this.host.commit(deleteArchived(this.host.state(), c.id));
          this.host.changed();
          fill();
        });
        li.append(this.thumbCanvas(c.page, c.y0, c.y1), el('span', '', `Page ${c.page + 1}, ${n} marking${n === 1 ? '' : 's'}`), del);
        list.append(li);
      }
    };
    fill();
    const close = el('button', 'primary', 'Done');
    close.type = 'button';
    close.addEventListener('click', () => this.dismiss());
    const buttons = el('div', 'buttons');
    buttons.append(close);
    d.append(el('p', 'hint', 'Cuts removed with markings on them are kept here. Insert one again from "Insert pages…", or delete it and its markings for good.'), list, buttons);
    close.focus();
  }
}
