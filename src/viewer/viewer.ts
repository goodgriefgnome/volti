import type { Score } from '../lib/library';
import { lastPage, savePrefs, type PagesPerScreen, type Prefs } from '../lib/prefs';
import { drawAll, drawPenSegment } from '../ink/draw';
import { compact, HIGHLIGHT_COLOR, HIGHLIGHT_SIZE, PEN_COLORS, PEN_SIZE, touches, type InkTool, type Point, type ScoreInk, type Stroke } from '../ink/model';
import { inkSaver, loadInk } from '../ink/store';
import { fitPages, pagesPerScreen, spread, turnTarget, type Size } from './layout';
import { openPdf, type PageCache } from './renderer';
import { gestureFor, gestureForKey, type Gesture } from './turns';

type Tool = 'none' | InkTool | 'eraser';

interface Slot { num: number; box: HTMLElement; ink: HTMLCanvasElement; ctx: CanvasRenderingContext2D; aspect: number }

type Edit = { kind: 'add' | 'remove'; page: number; index: number; stroke: Stroke };

const GAP = 6;
const ERASER_RADIUS = 0.012;
/** After the pen lifts, finger touches are ignored this long, as they are probably the writing hand. */
const PALM_GUARD_MS = 600;
const LAYOUT_LABEL: Record<string, string> = { auto: 'Auto', 1: '1 page', 2: '2 pages' };
const LAYOUT_NEXT: Record<string, PagesPerScreen> = { auto: 1, 1: 2, 2: 'auto' };

const dpr = () => Math.min(window.devicePixelRatio || 1, 2.5);

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
  private bar = el('div', 'bar');
  private info = el('span', 'page-info');
  private buttons: Record<string, HTMLButtonElement> = {};

  private perScreen: 1 | 2 = 1;
  private seq = 0;
  private slots: Slot[] = [];
  private sizes = new Map<number, Size>();

  private tool: Tool = 'none';
  private penColor: string = PEN_COLORS[0];
  private undoStack: Edit[] = [];
  private redoStack: Edit[] = [];
  private saver;

  private active: { id: number; slot: Slot; rect: DOMRect; stroke?: Stroke; erasing: boolean } | null = null;
  private gesture: { id: number; x: number; y: number; t: number } | null = null;
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
      this.button('finger', 'Finger writes', () => {
        this.prefs.fingerDraws = !this.prefs.fingerDraws;
        void savePrefs(this.prefs);
        this.syncBar();
      }),
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
    pressed('finger', this.prefs.fingerDraws);
    for (const c of PEN_COLORS) pressed('color' + c, this.tool === 'pen' && this.penColor === c);
    this.buttons.layout.textContent = LAYOUT_LABEL[String(this.prefs.pagesPerScreen)];
    this.buttons.undo.disabled = !this.undoStack.length;
    this.buttons.redo.disabled = !this.redoStack.length;
    this.root.classList.toggle('writing', this.tool !== 'none');
  }

  private toggleChrome(show?: boolean) {
    this.root.classList.toggle('chrome-hidden', show === undefined ? undefined : !show);
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
    const boxes = canvases.map((pageCanvas, i) => {
      const { w, h } = sizes[i];
      const box = el('div', 'page');
      box.style.width = w + 'px';
      box.style.height = h + 'px';
      const ink = el('canvas', 'ink');
      ink.width = Math.round(w * scale);
      ink.height = Math.round(h * scale);
      box.append(pageCanvas, ink);
      const slot: Slot = { num: nums[i], box, ink, ctx: ink.getContext('2d')!, aspect: h / w };
      drawAll(slot.ctx, this.ink[slot.num] ?? []);
      this.slots.push(slot);
      return box;
    });
    this.stage.replaceChildren(...boxes);
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
    this.toggleChrome(false);
    void this.show();
  }

  private act(g: Gesture) {
    if (g === 'next') this.turn(1);
    else if (g === 'prev') this.turn(-1);
    else this.toggleChrome();
  }

  /* ---------- input ---------- */

  private slotAt(x: number, y: number): { slot: Slot; rect: DOMRect } | null {
    for (const slot of this.slots) {
      const rect = slot.box.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return { slot, rect };
    }
    return null;
  }

  private point(e: PointerEvent, rect: DOMRect): Point {
    return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height, e.pointerType === 'pen' ? e.pressure : 0.5];
  }

  private writes(e: PointerEvent): boolean {
    if (this.tool === 'none' && !(e.buttons & 32)) return false;
    return e.pointerType !== 'touch' || this.prefs.fingerDraws;
  }

  private onDown = (e: PointerEvent) => {
    if (e.pointerType === 'pen') this.lastPen = performance.now();
    if (this.writes(e)) {
      if (this.active) return;
      const hit = this.slotAt(e.clientX, e.clientY);
      if (!hit) return;
      this.stage.setPointerCapture(e.pointerId);
      const erasing = this.tool === 'eraser' || !!(e.buttons & 32); // 32: the pen's eraser end or button
      const p = this.point(e, hit.rect);
      this.active = { id: e.pointerId, ...hit, erasing };
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
    if (e.pointerType === 'touch' && (this.active || performance.now() - this.lastPen < PALM_GUARD_MS)) return;
    if (!this.gesture) this.gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerType === 'pen') this.lastPen = performance.now();
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
    if (a.stroke?.tool === 'highlighter') drawAll(a.slot.ctx, this.ink[a.slot.num] ?? [], a.stroke);
  };

  private onUp(e: PointerEvent, cancelled: boolean) {
    if (e.pointerType === 'pen') this.lastPen = performance.now();
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
    if (cancelled) { drawAll(a.slot.ctx, this.ink[a.slot.num] ?? []); return; } // the system decided it was a palm
    const stroke = { ...a.stroke, points: compact(a.stroke.points) };
    const list = (this.ink[a.slot.num] ??= []);
    list.push(stroke);
    this.record({ kind: 'add', page: a.slot.num, index: list.length - 1, stroke });
  }

  private drawLive(slot: Slot, s: Stroke, a: Point, b: Point) {
    if (s.tool === 'pen') drawPenSegment(slot.ctx, s, a, b);
    else drawAll(slot.ctx, this.ink[slot.num] ?? [], s);
  }

  private eraseAt(slot: Slot, p: Point) {
    const list = this.ink[slot.num] ?? [];
    let changed = false;
    for (let i = list.length - 1; i >= 0; i--) {
      if (!touches(list[i], p, slot.aspect, ERASER_RADIUS)) continue;
      const [stroke] = list.splice(i, 1);
      this.record({ kind: 'remove', page: slot.num, index: i, stroke });
      changed = true;
    }
    if (changed) drawAll(slot.ctx, list);
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
    for (const s of this.slots) if (s.num === edit.page) drawAll(s.ctx, list);
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
    this.seq++;
    await this.saver.flush();
    void this.wake?.release().catch(() => {});
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    this.cache.destroy();
    this.root.remove();
    document.body.classList.remove('viewing');
    this.onClose();
  }
}
