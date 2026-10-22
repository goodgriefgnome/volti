import type { Score } from '../lib/library';
import { savePrefs, type PagesPerScreen, type Prefs } from '../lib/prefs';
import { drawPenSegment } from '../ink/draw';
import { compact, HIGHLIGHT_COLOR, HIGHLIGHT_SIZE, PEN_COLORS, PEN_SIZE, touches, type InkTool, type Point, type Stroke } from '../ink/model';
import { claimStroke, visible } from '../pieces/ink';
import { frameHeight, frameOf, pack, setInk, type Aspects, type Cut, type Frame, type State } from '../pieces/model';
import { rowInk } from '../pieces/snap';
import { loadPiece, pieceSaver, savePosition } from '../pieces/store';
import { el } from './dom';
import { CutEditor, type FrameSlot } from './edit';
import { drawFrame, drawFrameInk, frameTarget, regionBands, type Hatches } from './frames';
import { fitPages, pagesPerScreen } from './layout';
import { openPdf, type PageCache } from './renderer';
import { gestureFor, gestureForKey, type Gesture } from './turns';
import { isZoomed, NO_ZOOM, pan, pinch, visiblePart, type Pt, type Zoom } from './zoom';

type Tool = 'none' | InkTool | 'eraser';

/** Undo keeps whole states: each entry is the state before an edit, and the cut to show. */
interface Undo { state: State; focus?: string }

const GAP = 6;
const ERASER_RADIUS = 0.012;
const PROFILE_WIDTH = 1600;
/** After the pen lifts, finger touches are ignored this long, as they are probably the writing hand. */
const PALM_GUARD_MS = 600;
/** Wait this long after a pinch or pan settles before drawing the sharp close-up. */
const DETAIL_DELAY_MS = 150;
const LAYOUT_LABEL: Record<string, string> = { auto: 'Auto', 1: '1 page', 2: '2 pages' };
const LAYOUT_NEXT: Record<string, PagesPerScreen> = { auto: 1, 1: 2, 2: 'auto' };

const dpr = () => window.devicePixelRatio || 1;

/** Whether two played orders put the same music in the same places. */
const sameLayout = (a: readonly Cut[], b: readonly Cut[]) =>
  a.length === b.length && a.every((c, i) => c.id === b[i].id && c.page === b[i].page && c.y0 === b[i].y0 && c.y1 === b[i].y1 && c.pad === b[i].pad);

export async function openViewer(score: Score, prefs: Prefs, onClose: () => void): Promise<void> {
  const cache = await openPdf(await score.getFile());
  const aspects = await cache.allAspects();
  const { state, position } = await loadPiece(score.id, score.title, aspects);
  new Viewer(score, cache, aspects, state, position, prefs, onClose);
}

class Viewer {
  private root = el('div', 'viewer');
  private stage = el('div', 'stage');
  private spreadEl = el('div', 'spread');
  private bar = el('div', 'bar');
  private info = el('span', 'page-info');
  private toast = el('p', 'toast');
  private buttons: Record<string, HTMLButtonElement> = {};

  private perScreen: 1 | 2 = 1;
  /** The first frame on the screen. */
  private frame = 0;
  private frames: Frame[] = [];
  private seq = 0;
  private slots: FrameSlot[] = [];
  /** Page canvases drawn at the frame's width, by 0-based page, for the frames on screen. */
  private pages = new Map<number, HTMLCanvasElement>();
  private rows = new Map<number, Promise<Float32Array>>();

  private zoom: Zoom = NO_ZOOM;
  private detailTimer: ReturnType<typeof setTimeout> | undefined;
  private detailSeq = 0;

  private tool: Tool = 'none';
  private penColor: string = PEN_COLORS[0];
  private undoStack: Undo[] = [];
  private redoStack: Undo[] = [];
  private saver;
  private editor: CutEditor;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  /** Fingers currently on the screen, by pointer id. */
  private fingers = new Map<number, Pt>();
  /** Pointers to disregard until they lift: palms, and the finger left over after a pinch. */
  private ignored = new Set<number>();
  private active: { id: number; type: string; slot: FrameSlot; rect: DOMRect; stroke?: Stroke; erasing: boolean; before: State } | null = null;
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
    private aspects: Aspects,
    private state: State,
    position: string | undefined,
    private prefs: Prefs,
    private onClose: () => void,
  ) {
    this.saver = pieceSaver(score.id, () => this.state);
    this.frames = pack(state.piece.cuts, aspects);
    this.frame = Math.max(0, position ? frameOf(this.frames, position) : 0);
    this.toast.setAttribute('role', 'status');
    this.editor = new CutEditor({
      root: this.root,
      stage: this.stage,
      aspects,
      state: () => this.state,
      frames: () => this.frames,
      slots: () => this.slots,
      commit: (s, focus) => this.commit(s, focus),
      preview: (s, frames, hatches) => this.preview(s, frames, hatches),
      rows: (page) => this.rowsFor(page),
      thumb: (page, w) => this.cache.render(page + 1, w, Math.round(w * aspects[page]), dpr()),
      inking: () => this.tool !== 'none',
      cancelGesture: () => { this.gesture = null; },
      say: (t) => this.say(t),
      changed: () => this.syncBar(),
    });
    this.buildBar();
    this.stage.append(this.spreadEl);
    this.root.append(this.stage, this.bar, this.toast);
    document.body.append(this.root);
    document.body.classList.add('viewing');

    this.stage.addEventListener('pointerdown', this.onDown);
    this.stage.addEventListener('pointermove', this.onMove);
    this.stage.addEventListener('pointerup', (e) => this.onUp(e, false));
    this.stage.addEventListener('pointercancel', (e) => this.onUp(e, true));
    this.stage.addEventListener('contextmenu', (e) => this.editor.onContext(e));
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
      this.button('edit', 'Edit cuts', () => { this.editor.setEnabled(!this.editor.enabled); this.syncBar(); this.decorate(); }),
      this.button('archived', 'Archived', () => this.editor.openArchive()),
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
    pressed('edit', this.editor.enabled);
    for (const c of PEN_COLORS) pressed('color' + c, this.tool === 'pen' && this.penColor === c);
    const archived = this.state.piece.archived.length;
    this.buttons.archived.hidden = !this.editor.enabled || !archived;
    this.buttons.archived.textContent = `Archived (${archived})`;
    this.buttons.layout.textContent = LAYOUT_LABEL[String(this.prefs.pagesPerScreen)];
    this.buttons.fit.hidden = !isZoomed(this.zoom);
    this.buttons.undo.disabled = !this.undoStack.length;
    this.buttons.redo.disabled = !this.redoStack.length;
    this.root.classList.toggle('writing', this.tool !== 'none');
    this.root.classList.toggle('editing', this.editor.enabled);
    this.root.style.setProperty('--bar-h', this.bar.offsetHeight + 'px');
  }

  /** The toolbar showing means annotation mode: zooming and writing are available. */
  private get annotating() { return !this.root.classList.contains('chrome-hidden'); }

  private showChrome(show: boolean) {
    this.root.classList.toggle('chrome-hidden', !show);
    if (!show) this.setZoom(NO_ZOOM);
  }

  private say(text: string) {
    this.toast.textContent = text;
    this.toast.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toast.hidden = true; }, 3500);
  }

  /* ---------- frames ---------- */

  /** The first frame of the screen that holds frame `f`. */
  private screenOf(f: number) { return Math.floor(f / this.perScreen) * this.perScreen; }

  private frameSize(W: number, H: number) {
    const sizes = fitPages(W, H, Array(this.perScreen).fill(frameHeight(this.aspects)), GAP);
    return sizes[0];
  }

  private pageSize(page: number, w: number) { return { w, h: Math.round(w * this.aspects[page]) }; }

  private async show() {
    const seq = ++this.seq; // a newer show() (turn, resize, edit) supersedes this one
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    if (!W || !H) return;
    this.perScreen = pagesPerScreen(this.prefs.pagesPerScreen, W, H);
    this.frame = this.screenOf(Math.min(this.frame, this.frames.length - 1));
    const size = this.frameSize(W, H);
    const scale = dpr();
    const on = this.frames.slice(this.frame, this.frame + this.perScreen);
    const pageNums = [...new Set(on.flatMap((f) => f.items.map((p) => p.cut.page)))];
    let canvases: HTMLCanvasElement[];
    try {
      canvases = await Promise.all(pageNums.map((p) => this.cache.render(p + 1, size.w, this.pageSize(p, size.w).h, scale)));
    } catch (e) {
      if (seq === this.seq) this.info.textContent = 'Could not draw this page';
      console.error(e);
      return;
    }
    if (seq !== this.seq) return;
    this.pages = new Map(pageNums.map((p, i) => [p, canvases[i]]));

    // Place frames on whole screen pixels so they are shown exactly as drawn, without resampling.
    const devW = Math.round(W * scale), devH = Math.round(H * scale), devGap = Math.round(GAP * scale);
    const fw = Math.round(size.w * scale), fh = Math.round(size.h * scale);
    const total = fw * on.length + devGap * (on.length - 1);
    let x = Math.floor((devW - total) / 2);
    this.slots = on.map((frame, i) => {
      const slot: FrameSlot = {
        index: this.frame + i,
        frame,
        box: el('div', 'page'),
        x: x / scale,
        y: Math.floor((devH - fh) / 2) / scale,
        w: fw / scale,
        h: fh / scale,
        canvas: Object.assign(el('canvas'), { width: fw, height: fh }),
        ink: Object.assign(el('canvas', 'ink'), { width: fw, height: fh }),
      };
      x += fw + devGap;
      Object.assign(slot.box.style, { left: slot.x + 'px', top: slot.y + 'px', width: slot.w + 'px', height: slot.h + 'px' });
      slot.box.append(slot.canvas, slot.ink);
      return slot;
    });
    for (const s of this.slots) this.paint(s, this.state);
    this.spreadEl.replaceChildren(...this.slots.map((s) => s.box));
    this.setZoom(NO_ZOOM);
    this.decorate();
    const last = this.frame + on.length;
    this.info.textContent = on.length > 1 ? `${this.frame + 1}–${last} of ${this.frames.length}` : `${last} of ${this.frames.length}`;
    const first = on[0]?.items[0];
    if (first) void savePosition(this.score.id, first.cut.id);
    void this.predraw(seq, size.w, scale);
  }

  /** Draw a frame's music and ink at its current layout. */
  private paint(slot: FrameSlot, s: State, hatches?: Hatches, extra?: Stroke) {
    const W = slot.canvas.width;
    drawFrame(slot.canvas.getContext('2d', { alpha: false })!, slot.frame, W, (p) => this.pages.get(p), this.aspects, hatches);
    this.paintInk(slot, s, extra);
  }

  private paintInk(slot: FrameSlot, s: State, extra?: Stroke) {
    drawFrameInk(slot.ink.getContext('2d')!, slot.frame, s.ink, this.aspects, slot.ink.width, 0, 0, extra);
    const d = slot.detail;
    if (d) drawFrameInk(d.ink.getContext('2d')!, slot.frame, s.ink, this.aspects, d.W, d.x, d.y, extra);
  }

  private decorate() {
    this.editor.decorate(this.slots, this.frames);
  }

  /** While a cut is dragged: show it with the layout frozen, the music being cut away hatched. */
  private preview(s: State | null, frames: Frame[] | null, hatches?: Hatches) {
    const all = frames ?? this.frames;
    this.dropDetail();
    for (const slot of this.slots) {
      slot.frame = all[slot.index] ?? slot.frame;
      this.paint(slot, s ?? this.state, hatches);
    }
    this.editor.decorate(this.slots, all, !!frames);
  }

  /** Draw the next and previous screens' pages in the background. */
  private async predraw(seq: number, w: number, scale: number) {
    const screens = [this.frame + this.perScreen, this.frame - this.perScreen]
      .filter((f) => f >= 0 && f < this.frames.length)
      .map((f) => this.frames.slice(f, f + this.perScreen));
    const near = new Set([...this.pages.keys(), ...screens.flat().flatMap((f) => f.items.map((p) => p.cut.page))]);
    this.cache.keepOnly([...near].map((p) => p + 1), (n) => this.pageSize(n - 1, w));
    for (const p of near) {
      if (seq !== this.seq) return;
      await this.cache.render(p + 1, w, this.pageSize(p, w).h, scale).catch(() => {});
    }
  }

  /** The row ink profile of a page, from a drawing 1600 pixels wide: enough to see small print. */
  private rowsFor(page: number): Promise<Float32Array> {
    let r = this.rows.get(page);
    if (!r) {
      r = this.cache.render(page + 1, PROFILE_WIDTH, Math.round(PROFILE_WIDTH * this.aspects[page]), 1).then((c) => {
        const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
        return rowInk(data, c.width, c.height);
      });
      r.catch(() => this.rows.delete(page));
      this.rows.set(page, r);
    }
    return r;
  }

  private turn(dir: 1 | -1) {
    const next = this.frame + dir * this.perScreen;
    if (next < 0 || next >= this.frames.length) return;
    this.frame = next;
    // Put the tool away so taps turn pages again. The toolbar stays until you dismiss it.
    this.tool = 'none';
    this.syncBar();
    void this.show();
  }

  private act(g: Gesture) {
    if (g === 'next') this.turn(1);
    else if (g === 'prev') this.turn(-1);
    else this.showChrome(!this.annotating);
  }

  /* ---------- editing ---------- */

  /**
   * Take a new state from an edit: remember the old one for undo, save, reflow, and show the
   * frame holding `focus` (or stay where you are, if that cut is gone). Undo shows it too.
   */
  private commit(s: State, focus?: string) {
    this.undoStack.push({ state: this.state, focus });
    this.redoStack = [];
    this.setState(s, focus);
  }

  private setState(s: State, focus?: string) {
    const moved = !sameLayout(s.piece.cuts, this.state.piece.cuts);
    this.state = s;
    this.saver.soon();
    this.syncBar();
    this.frames = pack(s.piece.cuts, this.aspects);
    const f = focus ? frameOf(this.frames, focus) : -1;
    const target = f >= 0 ? this.screenOf(f) : this.frame;
    if (!moved && target === this.frame) {
      for (const slot of this.slots) {
        slot.frame = this.frames[slot.index];
        this.paintInk(slot, s);
      }
      this.decorate();
      return;
    }
    this.frame = Math.min(target, Math.max(0, this.frames.length - 1));
    void this.show();
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
      s.detail?.canvas.remove();
      s.detail?.ink.remove();
      s.detail = undefined;
    }
  }

  /**
   * Zoomed in, the frame drawings are stretched and soft. Draw the visible part of each frame
   * again at the zoomed size, on top: the close-up hides the soft music and ink beneath it.
   */
  private async drawDetail() {
    const seq = ++this.detailSeq;
    const z = this.zoom;
    const W = this.stage.clientWidth, H = this.stage.clientHeight;
    const k = dpr() * z.s;
    for (const slot of this.slots) {
      const part = visiblePart(z, W, H, slot);
      if (!part) continue;
      const fw = Math.round(slot.w * k);
      const x = Math.floor(part.x * k), y = Math.floor(part.y * k);
      const region = { x, y, w: Math.ceil((part.x + part.w) * k) - x, h: Math.ceil((part.y + part.h) * k) - y };
      const canvas = Object.assign(el('canvas', 'detail'), { width: region.w, height: region.h });
      const ctx = canvas.getContext('2d', { alpha: false })!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, region.w, region.h);
      try {
        for (const b of regionBands(slot.frame, fw, this.aspects, region)) {
          const part = await this.cache.renderRegion(b.p.cut.page + 1, fw, { x, y: b.pageY, w: region.w, h: b.h });
          if (seq !== this.detailSeq) return;
          ctx.drawImage(part, 0, b.destY);
        }
      } catch (e) {
        console.error(e);
        continue;
      }
      if (seq !== this.detailSeq) return;
      const ink = Object.assign(el('canvas', 'ink detail'), { width: region.w, height: region.h });
      for (const c of [canvas, ink]) {
        Object.assign(c.style, { left: x / k + 'px', top: y / k + 'px', width: region.w / k + 'px', height: region.h / k + 'px' });
      }
      slot.detail?.canvas.remove();
      slot.detail?.ink.remove();
      slot.detail = { canvas, ink, W: fw, x, y };
      drawFrameInk(ink.getContext('2d')!, slot.frame, this.state.ink, this.aspects, fw, x, y);
      slot.box.insertBefore(canvas, slot.ui ?? null);
      slot.box.insertBefore(ink, slot.ui ?? null);
    }
  }

  /* ---------- ink on screen ---------- */

  private drawLive(slot: FrameSlot, s: Stroke, a: Point, b: Point) {
    if (s.tool !== 'pen') { this.paintInk(slot, this.state, s); return; }
    drawPenSegment(frameTarget(slot.ink.getContext('2d')!, slot.ink.width), s, a, b);
    const d = slot.detail;
    if (d) drawPenSegment(frameTarget(d.ink.getContext('2d')!, d.W, d.x, d.y), s, a, b);
  }

  /* ---------- input ---------- */

  private slotAt(x: number, y: number): { slot: FrameSlot; rect: DOMRect } | null {
    for (const slot of this.slots) {
      const rect = slot.box.getBoundingClientRect(); // includes the zoom
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return { slot, rect };
    }
    return null;
  }

  /** A point on a frame: x as a fraction of its width, y in frame widths from its top. */
  private point(e: PointerEvent, rect: DOMRect): Point {
    return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.width, e.pointerType === 'pen' ? e.pressure : 0.5];
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
    if (a.stroke) this.paintInk(a.slot, this.state);
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
        this.editor.cancel();
        this.gesture = this.panning = null;
        if (this.fingers.size === 2 && this.annotating) this.startPinch();
        else this.ignored.add(e.pointerId);
        return;
      }
    }
    if (this.active || this.pinching) return;
    if (e.button === 2) return; // right-click opens a menu instead
    this.stage.setPointerCapture(e.pointerId);
    // A tab or the split cue takes the pointer before writing, panning or turning.
    if (this.editor.onDown(e)) return;

    const eraserButton = e.pointerType === 'pen' && !!(e.buttons & 32); // the pen's eraser end or button
    if (this.tool !== 'none' || eraserButton) {
      const hit = this.slotAt(e.clientX, e.clientY);
      if (!hit) return;
      const erasing = this.tool === 'eraser' || eraserButton;
      const p = this.point(e, hit.rect);
      this.active = { id: e.pointerId, type: e.pointerType, ...hit, erasing, before: this.state };
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
    if (this.editor.onMove(e)) return;
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
    if (a.stroke?.tool === 'highlighter') this.paintInk(a.slot, this.state, a.stroke);
  };

  private onUp(e: PointerEvent, cancelled: boolean) {
    if (e.pointerType === 'pen') this.lastPen = performance.now();
    this.fingers.delete(e.pointerId);
    if (this.ignored.delete(e.pointerId)) return;
    if (this.editor.onUp(e, cancelled)) return;

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
    if (a.erasing) {
      // One undo step for the whole sweep of the eraser.
      if (this.state !== a.before) {
        this.undoStack.push({ state: a.before, focus: a.slot.frame.items[0]?.cut.id });
        this.redoStack = [];
        this.frames = pack(this.state.piece.cuts, this.aspects);
        a.slot.frame = this.frames[a.slot.index];
        this.syncBar();
      }
      return;
    }
    if (!a.stroke) return;
    if (cancelled) { this.paintInk(a.slot, this.state); return; } // the system decided it was a palm
    const claimed = claimStroke(a.slot.frame, { ...a.stroke, points: compact(a.stroke.points) }, this.aspects);
    if (!claimed) { this.paintInk(a.slot, this.state); return; }
    const { cut, stroke } = claimed;
    this.commit(setInk(this.state, cut.id, [...(this.state.ink[cut.id] ?? []), stroke]), cut.id);
  }

  private eraseAt(slot: FrameSlot, p: Point) {
    let s = this.state;
    for (const item of slot.frame.items) {
      const { cut } = item, aspect = this.aspects[cut.page];
      const list = s.ink[cut.id] ?? [];
      // The point on this cut's page; the eraser stays the same size on screen however far you zoom in.
      const q: Point = [p[0], cut.y0 + (p[1] - item.top) / aspect, p[2]];
      const keep = list.filter((st) => !(visible(st, cut, aspect) && touches(st, q, aspect, ERASER_RADIUS / this.zoom.s)));
      if (keep.length !== list.length) s = setInk(s, cut.id, keep);
    }
    if (s === this.state) return;
    this.state = s;
    this.saver.soon();
    this.paintInk(slot, s);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { if (!this.editor.dismiss()) history.back(); return; }
    if ((e.target as Element | null)?.closest?.('.menu, .dialog')) return;
    const g = gestureForKey(e.key);
    if (!g) return;
    e.preventDefault();
    this.act(g);
  };

  /* ---------- undo ---------- */

  private undo() {
    const e = this.undoStack.pop();
    if (!e) return;
    this.redoStack.push({ state: this.state, focus: e.focus });
    this.setState(e.state, e.focus);
  }

  private redo() {
    const e = this.redoStack.pop();
    if (!e) return;
    this.undoStack.push({ state: this.state, focus: e.focus });
    this.setState(e.state, e.focus);
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
    this.editor.dismiss();
    await this.saver.flush();
    void this.wake?.release().catch(() => {});
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    this.cache.destroy();
    this.root.remove();
    document.body.classList.remove('viewing');
    this.onClose();
  }
}
