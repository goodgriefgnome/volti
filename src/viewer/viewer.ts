import type { Score } from '../lib/library';
import { lastPage, savePrefs, type PagesPerScreen, type Prefs } from '../lib/prefs';
import { drawAll, drawPenSegment, wholePage, type InkTarget } from '../ink/draw';
import { compact, HIGHLIGHT_COLOR, HIGHLIGHT_SIZE, PEN_COLORS, PEN_SIZE, touches, type InkTool, type Point, type ScoreInk, type Stroke } from '../ink/model';
import { inkSaver, loadInk } from '../ink/store';
import { fitPages, pagesPerScreen, spread, turnTarget, type Size } from './layout';
import { openPdf, type PageCache } from './renderer';
import { gestureFor, gestureForKey, type Gesture } from './turns';
import { isZoomed, NO_ZOOM, pan, pinch, visiblePart, type Pt, type Zoom } from './zoom';

type Tool = 'none' | InkTool | 'eraser';

interface Slot {
  num: number;
  box: HTMLElement;
  /** Where the page sits in the unzoomed spread, in CSS pixels. */
  x: number; y: number; w: number; h: number;
  ink: InkTarget;
  /** A sharp close-up of the visible part of the page while zoomed in, with its own ink layer. */
  detail?: { page: HTMLCanvasElement; ink: InkTarget };
}

type Edit = { kind: 'add' | 'remove'; page: number; index: number; stroke: Stroke };

const GAP = 6;
const ERASER_RADIUS = 0.012;
/** After the pen lifts, finger touches are ignored this long, as they are probably the writing hand. */
const PALM_GUARD_MS = 600;
/** Wait this long after a pinch or pan settles before drawing the sharp close-up. */
const DETAIL_DELAY_MS = 150;
const LAYOUT_LABEL: Record<string, string> = { auto: 'Auto', 1: '1 page', 2: '2 pages' };
const LAYOUT_NEXT: Record<string, PagesPerScreen> = { auto: 1, 1: 2, 2: 'auto' };

const dpr = () => window.devicePixelRatio || 1;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export async function openViewer(score: Score, prefs: Prefs, onClose: () => void): Promise<void> {
  const file = await score.getFile();
  const [cache, ink, page] = await Promise.all([openPdf(file), loadInk(score.id), lastPage.get(score.id)]);
  new Viewer(score, cache, ink, prefs, Math.min(page, cache.numPages), onClose);
}

class Viewer {
  private root = el('div', 'viewer');
  private stage = el('div', 'stage');
  private spreadEl = el('div', 'spread');
  private bar = el('div', 'bar');
  private info = el('span', 'page-info');
  private buttons: Record<string, HTMLButtonElement> = {};

  private perScreen: 1 | 2 = 1;
  private seq = 0;
  private slots: Slot[] = [];
  private sizes = new Map<number, Size>();

  private zoom: Zoom = NO_ZOOM;
  private detailTimer: ReturnType<typeof setTimeout> | undefined;
  private detailSeq = 0;

  private tool: Tool = 'none';
  private penColor: string = PEN_COLORS[0];
  private undoStack: Edit[] = [];
  private redoStack: Edit[] = [];
  private saver;

  /** Fingers currently on the screen, by pointer id. */
  private fingers = new Map<number, Pt>();
  /** Pointers to disregard until they lift: palms, and the finger left over after a pinch. */
  private ignored = new Set<number>();
  private active: { id: number; type: string; slot: Slot; rect: DOMRect; stroke?: Stroke; erasing: boolean } | null = null;
  private gesture: { id: number; x: number; y: number; t: number } | null = null;
  private pinching: { ids: [number, number]; start: Zoom; c0: Pt; d0: number } | null = null;
  private panning: { id: number; start: Zoom; x0: number; y0: number } | null = null;
  private lastPen = 0;

  private wake: WakeLockSentinel | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;
  private observer = new ResizeObserver(() => {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => void this.show(), 150);
  });

  constructor(
    private score: Score,
    private cache: PageCache,
    private ink: ScoreInk,
    private prefs: Prefs,
    private page: number,
    private onClose: () => void,
  ) {
    this.saver = inkSaver(score.id, () => this.ink);
    this.buildBar();
    this.stage.append(this.spreadEl);
    this.root.append(this.stage, this.bar);
    document.body.append(this.root);
    document.body.classList.add('viewing');

    this.stage.addEventListener('pointerdown', this.onDown);
    this.stage.addEventListener('pointermove', this.onMove);
    this.stage.addEventListener('pointerup', (e) => this.onUp(e, false));
    this.stage.addEventListener('pointercancel', (e) => this.onUp(e, true));
    document.addEventListener('keydown', this.onKey);
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('popstate', this.onPop);
    history.pushState({ viewer: true }, '');

    void document.documentElement.requestFullscreen?.().catch(() => {});
    void this.requestWake();
    this.observer.observe(this.stage);
  }

  /* ---------- toolbar ---------- */

  private button(key: string, label: string, onClick: () => void, cls = ''): HTMLButtonElement {
    const b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    this.buttons[key] = b;
    return b;
  }

  private buildBar() {
    const title = el('span', 'title', this.score.title);
    const left = el('div', 'group');
    left.append(this.button('close', 'Library', () => history.back()), title);

    const tools = el('div', 'group');
    tools.append(
      this.button('pen', 'Pen', () => this.setTool('pen')),
      this.button('highlighter', 'Highlight', () => this.setTool('highlighter')),
      this.button('eraser', 'Erase', () => this.setTool('eraser')),
    );
    const swatches = el('div', 'group swatches');
    for (const c of PEN_COLORS) {
      const b = this.button('color' + c, '', () => { this.penColor = c; this.tool = 'pen'; this.syncBar(); }, 'swatch');
      b.style.setProperty('--swatch', c);
      b.setAttribute('aria-label', 'Pen colour');
      swatches.append(b);
    }
    tools.append(
      swatches,
      this.button('undo', 'Undo', () => this.undo()),
      this.button('redo', 'Redo', () => this.redo()),
    );

    const right = el('div', 'group');
    right.append(
      this.button('fit', 'Fit page', () => this.setZoom(NO_ZOOM)),
      this.button('layout', '', () => {
        this.prefs.pagesPerScreen = LAYOUT_NEXT[String(this.prefs.pagesPerScreen)];
        void savePrefs(this.prefs);
        this.syncBar();
        void this.show();
      }),
      this.info,
    );
    this.bar.append(left, tools, right);
    this.syncBar();
  }

  /** Tapping the active tool again puts it away. */
  private setTool(t: Tool) {
    this.tool = this.tool === t ? 'none' : t;
    this.syncBar();
  }

  private syncBar() {
    const pressed = (k: string, on: boolean) => this.buttons[k].setAttribute('aria-pressed', String(on));
    pressed('pen', this.tool === 'pen');
    pressed('highlighter', this.tool === 'highlighter');
    pressed('eraser', this.tool === 'eraser');
    for (const c of PEN_COLORS) pressed('color' + c, this.tool === 'pen' && this.penColor === c);
    this.buttons.layout.textContent = LAYOUT_LABEL[String(this.prefs.pagesPerScreen)];
    this.buttons.fit.hidden = !isZoomed(this.zoom);
    this.buttons.undo.disabled = !this.undoStack.length;
    this.buttons.redo.disabled = !this.redoStack.length;
    this.root.classList.toggle('writing', this.tool !== 'none');
  }

  /** The toolbar showing means annotation mode: zooming and writing are available. */
  private get annotating() { return !this.root.classList.contains('chrome-hidden'); }

  private showChrome(show: boolean) {
    this.root.classList.toggle('chrome-hidden', !show);
    if (!show) this.setZoom(NO_ZOOM);
  }

  /* ---------- pages ---------- */

  private async sizesFor(nums: number[], W: number, H: number): Promise<Size[]> {
    const aspects = await Promise.all(nums.map((n) => this.cache.aspect(n)));
    return fitPages(W, H, aspects, GAP);
  }

  private async show() {
    const seq = ++this.seq; // a newer show() (turn, resize, layout change) supersedes this one
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    if (!W || !H) return;
    const n = pagesPerScreen(this.prefs.pagesPerScreen, W, H);
    this.perScreen = n;
    const nums = spread(this.page, n, this.cache.numPages);
    const sizes = await this.sizesFor(nums, W, H);
    const scale = dpr();
    let canvases: HTMLCanvasElement[];
    try {
      canvases = await Promise.all(nums.map((num, i) => this.cache.render(num, sizes[i].w, sizes[i].h, scale)));
    } catch (e) {
      if (seq === this.seq) this.info.textContent = 'Could not draw this page';
      console.error(e);
      return;
    }
    if (seq !== this.seq) return;

    this.slots = [];
    // Place pages on whole screen pixels so they are shown exactly as drawn, without resampling.
    const devW = Math.round(W * scale), devH = Math.round(H * scale), devGap = Math.round(GAP * scale);
    const total = canvases.reduce((sum, c) => sum + c.width, 0) + devGap * (canvases.length - 1);
    let x = Math.floor((devW - total) / 2);
    const boxes = canvases.map((pageCanvas, i) => {
      const slot: Slot = {
        num: nums[i],
        box: el('div', 'page'),
        x: x / scale,
        y: Math.floor((devH - pageCanvas.height) / 2) / scale,
        w: pageCanvas.width / scale,
        h: pageCanvas.height / scale,
        ink: wholePage(Object.assign(el('canvas', 'ink'), { width: pageCanvas.width, height: pageCanvas.height })),
      };
      x += pageCanvas.width + devGap;
      Object.assign(slot.box.style, { left: slot.x + 'px', top: slot.y + 'px', width: slot.w + 'px', height: slot.h + 'px' });
      slot.box.append(pageCanvas, slot.ink.ctx.canvas);
      drawAll(slot.ink, this.ink[slot.num] ?? []);
      this.slots.push(slot);
      return slot.box;
    });
    this.spreadEl.replaceChildren(...boxes);
    this.setZoom(NO_ZOOM);
    this.info.textContent = nums.length > 1
      ? `${nums[0]}–${nums.at(-1)} of ${this.cache.numPages}`
      : `${nums[0]} of ${this.cache.numPages}`;
    void lastPage.set(this.score.id, this.page);
    void this.predraw(seq, W, H, scale, nums, sizes);
  }

  /** Draw the next and previous spreads in the background. */
  private async predraw(seq: number, W: number, H: number, scale: number, nums: number[], sizes: Size[]) {
    this.sizes = new Map(nums.map((n, i) => [n, sizes[i]]));
    const total = this.cache.numPages;
    const neighbours = [
      spread(turnTarget(this.page, this.perScreen, total, 1), this.perScreen, total),
      spread(turnTarget(this.page, this.perScreen, total, -1), this.perScreen, total),
    ].filter((s) => s[0] !== this.page);
    for (const s of neighbours) {
      const ss = await this.sizesFor(s, W, H);
      if (seq !== this.seq) return;
      s.forEach((n, i) => this.sizes.set(n, ss[i]));
    }
    this.cache.keepOnly([...this.sizes.keys()], (n) => this.sizes.get(n));
    for (const s of neighbours) for (const n of s) {
      if (seq !== this.seq) return;
      const sz = this.sizes.get(n)!;
      await this.cache.render(n, sz.w, sz.h, scale).catch(() => {});
    }
  }

  private turn(dir: 1 | -1) {
    const next = turnTarget(this.page, this.perScreen, this.cache.numPages, dir);
    if (next === this.page) return;
    this.page = next;
    // Put the tool away so taps turn pages again. The toolbar stays until you dismiss it.
    this.tool = 'none';
    void this.show();
  }

  private act(g: Gesture) {
    if (g === 'next') this.turn(1);
    else if (g === 'prev') this.turn(-1);
    else this.showChrome(!this.annotating);
  }

  /* ---------- zoom ---------- */

  private setZoom(z: Zoom) {
    this.zoom = z;
    this.spreadEl.style.transform = isZoomed(z) ? `translate(${z.x}px, ${z.y}px) scale(${z.s})` : '';
    this.syncBar();
    clearTimeout(this.detailTimer);
    if (!isZoomed(z)) { this.dropDetail(); return; }
    this.detailTimer = setTimeout(() => void this.drawDetail(), DETAIL_DELAY_MS);
  }

  private dropDetail() {
    this.detailSeq++;
    for (const s of this.slots) {
      s.detail?.page.remove();
      s.detail?.ink.ctx.canvas.remove();
      s.detail = undefined;
    }
  }

  /**
   * Zoomed in, the page drawings are stretched and soft. Draw the visible part of each page
   * again at the zoomed size, on top: the close-up hides the soft page and ink beneath it.
   */
  private async drawDetail() {
    const seq = ++this.detailSeq;
    const z = this.zoom;
    const W = this.stage.clientWidth, H = this.stage.clientHeight;
    const k = dpr() * z.s;
    for (const slot of this.slots) {
      const part = visiblePart(z, W, H, slot);
      if (!part) continue;
      const pageWidth = Math.round(slot.w * k);
      const x = Math.floor(part.x * k), y = Math.floor(part.y * k);
      const region = { x, y, w: Math.ceil((part.x + part.w) * k) - x, h: Math.ceil((part.y + part.h) * k) - y };
      let page: HTMLCanvasElement;
      try {
        page = await this.cache.renderRegion(slot.num, pageWidth, region);
      } catch (e) {
        console.error(e);
        continue;
      }
      if (seq !== this.detailSeq) return;
      const inkCanvas = Object.assign(el('canvas', 'ink'), { width: region.w, height: region.h });
      for (const c of [page, inkCanvas]) {
        c.className = 'detail';
        Object.assign(c.style, { left: x / k + 'px', top: y / k + 'px', width: region.w / k + 'px', height: region.h / k + 'px' });
      }
      const ink: InkTarget = { ctx: inkCanvas.getContext('2d')!, w: pageWidth, h: slot.h * k, ox: x, oy: y };
      drawAll(ink, this.ink[slot.num] ?? []);
      slot.detail?.page.remove();
      slot.detail?.ink.ctx.canvas.remove();
      slot.detail = { page, ink };
      slot.box.append(page, inkCanvas);
    }
  }

  /* ---------- ink on screen ---------- */

  private targets(slot: Slot): InkTarget[] {
    return slot.detail ? [slot.ink, slot.detail.ink] : [slot.ink];
  }

  private redraw(slot: Slot, extra?: Stroke) {
    for (const t of this.targets(slot)) drawAll(t, this.ink[slot.num] ?? [], extra);
  }

  private drawLive(slot: Slot, s: Stroke, a: Point, b: Point) {
    if (s.tool === 'pen') for (const t of this.targets(slot)) drawPenSegment(t, s, a, b);
    else this.redraw(slot, s);
  }

  /* ---------- input ---------- */

  private slotAt(x: number, y: number): { slot: Slot; rect: DOMRect } | null {
    for (const slot of this.slots) {
      const rect = slot.box.getBoundingClientRect(); // includes the zoom
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return { slot, rect };
    }
    return null;
  }

  private point(e: PointerEvent, rect: DOMRect): Point {
    return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height, e.pointerType === 'pen' ? e.pressure : 0.5];
  }

  private stagePoint(x: number, y: number): Pt {
    const r = this.stage.getBoundingClientRect();
    return { x: x - r.left, y: y - r.top };
  }

  /** A stroke made by a finger is dropped, not kept: a palm, or the start of a pinch. */
  private dropActive() {
    const a = this.active;
    if (!a) return;
    this.active = null;
    if (a.stroke) this.redraw(a.slot);
  }

  private startPinch() {
    const [a, b] = [...this.fingers.entries()];
    const c0 = this.stagePoint((a[1].x + b[1].x) / 2, (a[1].y + b[1].y) / 2);
    this.pinching = { ids: [a[0], b[0]], start: this.zoom, c0, d0: Math.max(1, Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y)) };
  }

  private onDown = (e: PointerEvent) => {
    const now = performance.now();
    if (e.pointerType === 'pen') {
      this.lastPen = now;
      // A palm often lands just before the pen tip; drop whatever it started.
      if (this.active?.type === 'touch') this.dropActive();
      const fingersBusy = this.pinching || (this.panning && this.fingers.has(this.panning.id));
      if (fingersBusy) {
        for (const id of this.fingers.keys()) this.ignored.add(id);
        this.pinching = this.panning = null;
      }
      this.gesture = null;
    }
    if (e.pointerType === 'touch') {
      this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.active?.type === 'pen' || now - this.lastPen < PALM_GUARD_MS) { this.ignored.add(e.pointerId); return; }
      if (this.fingers.size >= 2) {
        // A second finger: this is a pinch, not writing, turning or panning.
        this.dropActive();
        this.gesture = this.panning = null;
        if (this.fingers.size === 2 && this.annotating) this.startPinch();
        else this.ignored.add(e.pointerId);
        return;
      }
    }
    if (this.active || this.pinching) return;
    this.stage.setPointerCapture(e.pointerId);

    const eraserButton = e.pointerType === 'pen' && !!(e.buttons & 32); // the pen's eraser end or button
    if (this.tool !== 'none' || eraserButton) {
      const hit = this.slotAt(e.clientX, e.clientY);
      if (!hit) return;
      const erasing = this.tool === 'eraser' || eraserButton;
      const p = this.point(e, hit.rect);
      this.active = { id: e.pointerId, type: e.pointerType, ...hit, erasing };
      if (erasing) { this.eraseAt(hit.slot, p); return; }
      const hl = this.tool === 'highlighter';
      this.active.stroke = {
        tool: hl ? 'highlighter' : 'pen',
        color: hl ? HIGHLIGHT_COLOR : this.penColor,
        size: hl ? HIGHLIGHT_SIZE : PEN_SIZE,
        points: [p],
      };
      this.drawLive(hit.slot, this.active.stroke, p, p);
      return;
    }
    if (isZoomed(this.zoom)) {
      this.panning = { id: e.pointerId, start: this.zoom, x0: e.clientX, y0: e.clientY };
      return;
    }
    this.gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, t: now };
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerType === 'pen') this.lastPen = performance.now();
    if (e.pointerType === 'touch' && this.fingers.has(e.pointerId)) this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const W = this.stage.clientWidth, H = this.stage.clientHeight;

    const pz = this.pinching;
    if (pz && pz.ids.includes(e.pointerId)) {
      const a = this.fingers.get(pz.ids[0]), b = this.fingers.get(pz.ids[1]);
      if (!a || !b) return;
      const c = this.stagePoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      this.setZoom(pinch(pz.start, pz.c0, pz.d0, c, Math.hypot(a.x - b.x, a.y - b.y), W, H));
      return;
    }
    const pn = this.panning;
    if (pn && pn.id === e.pointerId) {
      this.setZoom(pan(pn.start, e.clientX - pn.x0, e.clientY - pn.y0, W, H));
      return;
    }

    const a = this.active;
    if (!a || e.pointerId !== a.id) return;
    const events = e.getCoalescedEvents?.() ?? [];
    for (const ce of events.length ? events : [e]) {
      const p = this.point(ce, a.rect);
      if (a.erasing) { this.eraseAt(a.slot, p); continue; }
      const prev = a.stroke!.points.at(-1)!;
      a.stroke!.points.push(p);
      if (a.stroke!.tool === 'pen') this.drawLive(a.slot, a.stroke!, prev, p);
    }
    if (a.stroke?.tool === 'highlighter') this.redraw(a.slot, a.stroke);
  };

  private onUp(e: PointerEvent, cancelled: boolean) {
    if (e.pointerType === 'pen') this.lastPen = performance.now();
    this.fingers.delete(e.pointerId);
    if (this.ignored.delete(e.pointerId)) return;

    if (this.pinching?.ids.includes(e.pointerId)) {
      // The other finger stays down; don't let it write or turn pages when it lifts.
      for (const id of this.pinching.ids) if (id !== e.pointerId && this.fingers.has(id)) this.ignored.add(id);
      this.pinching = null;
      return;
    }
    if (this.panning?.id === e.pointerId) { this.panning = null; return; }

    const g = this.gesture;
    if (g && e.pointerId === g.id) {
      this.gesture = null;
      if (cancelled) return;
      const action = gestureFor({ x0: g.x, y0: g.y, x1: e.clientX, y1: e.clientY, ms: performance.now() - g.t }, this.stage.clientWidth);
      if (action) this.act(action);
      return;
    }

    const a = this.active;
    if (!a || e.pointerId !== a.id) return;
    this.active = null;
    if (!a.stroke) return;
    if (cancelled) { this.redraw(a.slot); return; } // the system decided it was a palm
    const stroke = { ...a.stroke, points: compact(a.stroke.points) };
    const list = (this.ink[a.slot.num] ??= []);
    list.push(stroke);
    this.record({ kind: 'add', page: a.slot.num, index: list.length - 1, stroke });
  }

  private eraseAt(slot: Slot, p: Point) {
    const list = this.ink[slot.num] ?? [];
    const aspect = slot.h / slot.w;
    let changed = false;
    for (let i = list.length - 1; i >= 0; i--) {
      // The eraser stays the same size on screen however far you zoom in.
      if (!touches(list[i], p, aspect, ERASER_RADIUS / this.zoom.s)) continue;
      const [stroke] = list.splice(i, 1);
      this.record({ kind: 'remove', page: slot.num, index: i, stroke });
      changed = true;
    }
    if (changed) this.redraw(slot);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { history.back(); return; }
    const g = gestureForKey(e.key);
    if (!g) return;
    e.preventDefault();
    this.act(g);
  };

  /* ---------- undo ---------- */

  private record(edit: Edit) {
    this.undoStack.push(edit);
    this.redoStack = [];
    this.saver.soon();
    this.syncBar();
  }

  private apply(edit: Edit, reverse: boolean) {
    const list = (this.ink[edit.page] ??= []);
    const adding = (edit.kind === 'add') !== reverse;
    if (adding) list.splice(edit.index, 0, edit.stroke);
    else {
      const i = list.indexOf(edit.stroke);
      if (i >= 0) list.splice(i, 1);
    }
    for (const s of this.slots) if (s.num === edit.page) this.redraw(s);
    // Show the page that changed if it is not on screen.
    if (!this.slots.some((s) => s.num === edit.page)) { this.page = edit.page; void this.show(); }
    this.saver.soon();
  }

  private undo() {
    const e = this.undoStack.pop();
    if (!e) return;
    this.apply(e, true);
    this.redoStack.push(e);
    this.syncBar();
  }

  private redo() {
    const e = this.redoStack.pop();
    if (!e) return;
    this.apply(e, false);
    this.undoStack.push(e);
    this.syncBar();
  }

  /* ---------- lifecycle ---------- */

  private async requestWake() {
    try { this.wake = await navigator.wakeLock?.request('screen'); } catch { /* not allowed now; try again when visible */ }
  }

  private onVisible = () => {
    if (document.visibilityState === 'visible') void this.requestWake();
    else void this.saver.flush();
  };

  private onPop = () => void this.close();

  private async close() {
    window.removeEventListener('popstate', this.onPop);
    document.removeEventListener('keydown', this.onKey);
    document.removeEventListener('visibilitychange', this.onVisible);
    this.observer.disconnect();
    clearTimeout(this.detailTimer);
    this.seq++;
    this.detailSeq++;
    await this.saver.flush();
    void this.wake?.release().catch(() => {});
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    this.cache.destroy();
    this.root.remove();
    document.body.classList.remove('viewing');
    this.onClose();
  }
}
