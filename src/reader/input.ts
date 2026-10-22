import { drawPenSegment } from '../ink/draw';
import { compact, HIGHLIGHT_COLOR, HIGHLIGHT_SIZE, PEN_SIZE, touches, type Point, type Stroke } from '../ink/model';
import { setInk } from '../pieces/edits';
import { claimStroke, visible } from '../pieces/ink';
import type { Aspects, State } from '../pieces/model';
import { closeOverlay, overlayOpen } from '../ui/overlay';
import type { CutEditor } from './cuts/editor';
import { frameTarget } from './frames';
import { gestureFor, gestureForKey, type Gesture } from './gestures';
import type { FrameSlot } from './spread';
import type { Tool } from './toolbar';
import { isZoomed, pan, pinch, type Pt, type Zoom } from './zoom';

const ERASER_RADIUS = 0.012;
/** After the pen lifts, finger touches are ignored this long, as they are probably the writing hand. */
const PALM_GUARD_MS = 600;

/** What pointer and key handling needs from the reader. */
export interface InputHost {
  stage: HTMLElement;
  /** The current piece's: read each time, as the reader turns from piece to piece. */
  readonly aspects: Aspects;
  editor: CutEditor;
  slots(): FrameSlot[];
  state(): State;
  tool(): Tool;
  penColor(): string;
  zoom(): Zoom;
  setZoom(z: Zoom): void;
  /** The toolbar showing means annotation mode: zooming and writing are available. */
  annotating(): boolean;
  /** Turn a page, or show or hide the toolbar. */
  act(g: Gesture): void;
  /** Draw a frame's ink again; `extra` is a stroke still being drawn. */
  paintInk(slot: FrameSlot, extra?: Stroke): void;
  /** Take an edit: undo, save, reflow, and show the frame holding `focus`. */
  commit(s: State, focus?: string): void;
  /** The eraser took strokes away from the frame in `slot`: show and save it, without an undo step yet. */
  erased(s: State, slot: FrameSlot): void;
  /** The eraser lifted: one undo step, back to `before`, for its whole sweep. */
  eraseEnded(before: State, slot: FrameSlot): void;
}

/**
 * Pointers and keys on the score: two fingers pinch, one pans when zoomed in, a pen or finger
 * writes or erases with a tool selected, and otherwise taps, swipes and keys turn pages. A palm
 * resting while the pen writes is ignored. The cut editor gets the pointer first.
 */
export class Input {
  /** Fingers currently on the screen, by pointer id. */
  private fingers = new Map<number, Pt>();
  /** Pointers to disregard until they lift: palms, and the finger left over after a pinch. */
  private ignored = new Set<number>();
  private active: { id: number; type: string; slot: FrameSlot; rect: DOMRect; stroke?: Stroke; erasing: boolean; before: State } | null = null;
  private gesture: { id: number; x: number; y: number; t: number } | null = null;
  private pinching: { ids: [number, number]; start: Zoom; c0: Pt; d0: number } | null = null;
  private panning: { id: number; start: Zoom; x0: number; y0: number } | null = null;
  private lastPen = 0;

  constructor(private host: InputHost) {
    const { stage } = host;
    stage.addEventListener('pointerdown', this.onDown);
    stage.addEventListener('pointermove', this.onMove);
    stage.addEventListener('pointerup', (e) => this.onUp(e, false));
    stage.addEventListener('pointercancel', (e) => this.onUp(e, true));
    stage.addEventListener('contextmenu', (e) => host.editor.onContext(e));
    document.addEventListener('keydown', this.onKey);
  }

  /** Stop listening to the keyboard, as when the reader closes. */
  detach() {
    document.removeEventListener('keydown', this.onKey);
  }

  /** Forget the tap or swipe in progress. */
  cancelGesture() {
    this.gesture = null;
  }

  private slotAt(x: number, y: number): { slot: FrameSlot; rect: DOMRect } | null {
    for (const slot of this.host.slots()) {
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
    const r = this.host.stage.getBoundingClientRect();
    return { x: x - r.left, y: y - r.top };
  }

  /** A stroke made by a finger is dropped, not kept: a palm, or the start of a pinch. */
  private dropActive() {
    const a = this.active;
    if (!a) return;
    this.active = null;
    if (a.stroke) this.host.paintInk(a.slot);
  }

  private startPinch() {
    const [a, b] = [...this.fingers.entries()];
    const c0 = this.stagePoint((a[1].x + b[1].x) / 2, (a[1].y + b[1].y) / 2);
    this.pinching = { ids: [a[0], b[0]], start: this.host.zoom(), c0, d0: Math.max(1, Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y)) };
  }

  private drawLive(slot: FrameSlot, s: Stroke, a: Point, b: Point) {
    if (s.tool !== 'pen') { this.host.paintInk(slot, s); return; }
    drawPenSegment(frameTarget(slot.ink.getContext('2d')!, slot.ink.width), s, a, b);
    const d = slot.detail;
    if (d) drawPenSegment(frameTarget(d.ink.getContext('2d')!, d.W, d.x, d.y), s, a, b);
  }

  private onDown = (e: PointerEvent) => {
    const { host } = this;
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
        host.editor.cancel();
        this.gesture = this.panning = null;
        if (this.fingers.size === 2 && host.annotating()) this.startPinch();
        else this.ignored.add(e.pointerId);
        return;
      }
    }
    if (this.active || this.pinching) return;
    if (e.button === 2) return; // right-click opens a menu instead
    host.stage.setPointerCapture(e.pointerId);
    // A tab takes the pointer before writing, panning or turning.
    if (host.editor.onDown(e)) return;

    const tool = host.tool();
    const eraserButton = e.pointerType === 'pen' && !!(e.buttons & 32); // the pen's eraser end or button
    if (tool !== 'none' || eraserButton) {
      const hit = this.slotAt(e.clientX, e.clientY);
      if (!hit) return;
      const erasing = tool === 'eraser' || eraserButton;
      const p = this.point(e, hit.rect);
      this.active = { id: e.pointerId, type: e.pointerType, ...hit, erasing, before: host.state() };
      if (erasing) { this.eraseAt(hit.slot, p); return; }
      const hl = tool === 'highlighter';
      this.active.stroke = {
        tool: hl ? 'highlighter' : 'pen',
        color: hl ? HIGHLIGHT_COLOR : host.penColor(),
        size: hl ? HIGHLIGHT_SIZE : PEN_SIZE,
        points: [p],
      };
      this.drawLive(hit.slot, this.active.stroke, p, p);
      return;
    }
    if (isZoomed(host.zoom())) {
      this.panning = { id: e.pointerId, start: host.zoom(), x0: e.clientX, y0: e.clientY };
      return;
    }
    this.gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, t: now };
  };

  private onMove = (e: PointerEvent) => {
    const { host } = this;
    if (e.pointerType === 'pen') this.lastPen = performance.now();
    if (e.pointerType === 'touch' && this.fingers.has(e.pointerId)) this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (host.editor.onMove(e)) return;
    const W = host.stage.clientWidth, H = host.stage.clientHeight;

    const pz = this.pinching;
    if (pz && pz.ids.includes(e.pointerId)) {
      const a = this.fingers.get(pz.ids[0]), b = this.fingers.get(pz.ids[1]);
      if (!a || !b) return;
      const c = this.stagePoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      host.setZoom(pinch(pz.start, pz.c0, pz.d0, c, Math.hypot(a.x - b.x, a.y - b.y), W, H));
      return;
    }
    const pn = this.panning;
    if (pn && pn.id === e.pointerId) {
      host.setZoom(pan(pn.start, e.clientX - pn.x0, e.clientY - pn.y0, W, H));
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
    if (a.stroke?.tool === 'highlighter') host.paintInk(a.slot, a.stroke);
  };

  private onUp(e: PointerEvent, cancelled: boolean) {
    const { host } = this;
    if (e.pointerType === 'pen') this.lastPen = performance.now();
    this.fingers.delete(e.pointerId);
    if (this.ignored.delete(e.pointerId)) return;
    if (host.editor.onUp(e, cancelled)) return;

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
      const action = gestureFor({ x0: g.x, y0: g.y, x1: e.clientX, y1: e.clientY, ms: performance.now() - g.t }, host.stage.clientWidth);
      if (action) host.act(action);
      return;
    }

    const a = this.active;
    if (!a || e.pointerId !== a.id) return;
    this.active = null;
    if (a.erasing) {
      if (host.state() !== a.before) host.eraseEnded(a.before, a.slot);
      return;
    }
    if (!a.stroke) return;
    if (cancelled) { host.paintInk(a.slot); return; } // the system decided it was a palm
    const claimed = claimStroke(a.slot.frame, { ...a.stroke, points: compact(a.stroke.points) }, host.aspects);
    if (!claimed) { host.paintInk(a.slot); return; }
    const { cut, stroke } = claimed, s = host.state();
    host.commit(setInk(s, cut.id, [...(s.ink[cut.id] ?? []), stroke]), cut.id);
  }

  private eraseAt(slot: FrameSlot, p: Point) {
    const { host } = this;
    let s = host.state();
    for (const item of slot.frame.items) {
      const { cut } = item, aspect = host.aspects[cut.page];
      const list = s.ink[cut.id] ?? [];
      // The point on this cut's page; the eraser stays the same size on screen however far you zoom in.
      const q: Point = [p[0], cut.y0 + (p[1] - item.top) / aspect, p[2]];
      const keep = list.filter((st) => !(visible(st, cut, aspect) && touches(st, q, aspect, ERASER_RADIUS / host.zoom().s)));
      if (keep.length !== list.length) s = setInk(s, cut.id, keep);
    }
    if (s === host.state()) return;
    host.erased(s, slot);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { if (!this.host.editor.dismiss() && !closeOverlay()) history.back(); return; }
    if (overlayOpen() || (e.target as Element | null)?.closest?.('.menu, .dialog')) return;
    const g = gestureForKey(e.key);
    if (!g) return;
    e.preventDefault();
    this.host.act(g);
  };
}
