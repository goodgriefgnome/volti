// Pointer and keyboard input on the score: palm rejection, pinch and pan, handing a pointer to the
// cut editor or the selected tool, and presses, taps and keys that turn pages or hide the toolbar. What each tool does
// is in tools/.

import type { Point } from '../markings/model';
import { isZoomed, pan, pinch, type Pt, type Zoom } from '../render/zoom';
import { closeOverlay, overlayOpen } from '../ui/overlay';
import type { CutEditor } from './cuts/_editor';
import { gestureForKey, isTap, turnFor, type Gesture } from './_gestures';
import type { FrameSlot } from './_spread';
import { placesMarkings, type ToolChoice } from './_toolbar';
import { symbolTool } from './tools/_symbol';
import { TOOLS } from './tools/_tools';
import type { ToolHost, ToolPointer } from './tools/_tool';

/**
 * While the pen is down, and this long after it lifts, finger touches are ignored, as they are
 * probably the writing hand: they neither write nor turn.
 */
const PALM_GUARD_MS = 600;

/** What pointer and key handling needs from the reader, besides what the tools need. */
export interface InputHost extends ToolHost {
  editor: CutEditor;
  tool(): ToolChoice;
  setZoom(z: Zoom): void;
  /** The toolbar showing means annotation mode: zooming and writing are available. */
  annotating(): boolean;
  /** Turn a page, or show or hide the toolbar. */
  act(g: Gesture): void;
}

/**
 * Pointers and keys on the score. A press turns the page as it goes down: at each side while the
 * toolbar is hidden (a tap in the middle shows it), and only in the band at each side while it
 * shows (_gestures.ts). Otherwise,
 * with the toolbar showing, two fingers pinch, one pans when zoomed in, a pen or finger uses the
 * selected tool (tools/), and a tap hides the toolbar; the pen writes in the bands too. A palm
 * resting while the pen writes is ignored. The cut editor's tabs get the pointer first.
 */
export class Input {
  /** Fingers currently on the screen, by pointer id. */
  private fingers = new Map<number, Pt>();
  /** Pointers to disregard until they lift: palms, and the finger left over after a pinch. */
  private ignored = new Set<number>();
  /** The pointer using a tool, and the frame it started on. */
  private active: { id: number; type: string; slot: FrameSlot; rect: DOMRect; use: ToolPointer } | null = null;
  private gesture: { id: number; x: number; y: number; t: number } | null = null;
  private pinching: { ids: [number, number]; start: Zoom; c0: Pt; d0: number } | null = null;
  private panning: { id: number; start: Zoom; x0: number; y0: number; t: number } | null = null;
  private lastPen = 0;
  /** Pens on the screen, by pointer id. */
  private pens = new Set<number>();

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

  /** Forget the tap in progress. */
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

  /** Forget what a pointer was doing with a tool: it was a palm, or a finger starting a pinch. */
  private dropActive() {
    const a = this.active;
    if (!a) return;
    this.active = null;
    a.use.drop();
  }

  private startPinch() {
    const [a, b] = [...this.fingers.entries()];
    const c0 = this.stagePoint((a[1].x + b[1].x) / 2, (a[1].y + b[1].y) / 2);
    this.pinching = { ids: [a[0], b[0]], start: this.host.zoom(), c0, d0: Math.max(1, Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y)) };
  }

  private onDown = (e: PointerEvent) => {
    const { host } = this;
    // The selected marking's delete button takes its own click: no capture, no tool.
    if ((e.target as Element | null)?.closest?.('.selection-delete')) return;
    const now = performance.now();
    if (e.pointerType === 'pen') {
      this.lastPen = now;
      this.pens.add(e.pointerId);
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
      if (this.pens.size || this.active?.type === 'pen' || now - this.lastPen < PALM_GUARD_MS) { this.ignored.add(e.pointerId); return; }
      if (this.fingers.size >= 2) {
        // A second finger: this is a pinch, not writing, a tap or panning.
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
    // A tab takes the pointer before turning, writing or panning.
    if (host.editor.onDown(e)) return;

    const eraserButton = e.pointerType === 'pen' && !!(e.buttons & 32); // the pen's eraser end or button
    const tool = eraserButton ? 'eraser' : host.tool();
    const toolbar = host.annotating();
    // With a symbol or text as the tool the pen acts as a finger: it taps and drags, and turns pages at the sides.
    const penWrites = toolbar && tool !== 'none' && !placesMarkings(tool) && e.pointerType === 'pen';
    const turn = penWrites ? null : turnFor(this.stagePoint(e.clientX, e.clientY).x, host.stage.clientWidth, toolbar);
    if (turn) {
      host.editor.cancel(); // no long press on the page it turned from
      host.act(turn);
      return;
    }
    if (!toolbar) { // the middle, toolbar hidden: only a tap, which shows it
      this.gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, t: now };
      return;
    }
    if (tool !== 'none') {
      const hit = this.slotAt(e.clientX, e.clientY);
      if (!hit) return;
      const use = (tool === 'symbol' ? symbolTool : TOOLS[tool]).start(host, hit.slot, this.point(e, hit.rect));
      this.active = { id: e.pointerId, type: e.pointerType, ...hit, use };
      return;
    }
    if (isZoomed(host.zoom())) {
      this.panning = { id: e.pointerId, start: host.zoom(), x0: e.clientX, y0: e.clientY, t: now };
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
    for (const ce of events.length ? events : [e]) a.use.move(this.point(ce, a.rect));
    a.use.moved?.();
  };

  private onUp(e: PointerEvent, cancelled: boolean) {
    const { host } = this;
    if (e.pointerType === 'pen') { this.lastPen = performance.now(); this.pens.delete(e.pointerId); }
    this.fingers.delete(e.pointerId);
    if (this.ignored.delete(e.pointerId)) return;
    if (host.editor.onUp(e, cancelled)) return;

    if (this.pinching?.ids.includes(e.pointerId)) {
      // The other finger stays down; don't let it write or turn pages when it lifts.
      for (const id of this.pinching.ids) if (id !== e.pointerId && this.fingers.has(id)) this.ignored.add(id);
      this.pinching = null;
      return;
    }
    // A tap on the page, when it doesn't write or edit cuts, hides the toolbar.
    const tapped = (x: number, y: number, t: number) =>
      !cancelled && isTap({ x0: x, y0: y, x1: e.clientX, y1: e.clientY, ms: performance.now() - t });
    const pn = this.panning;
    if (pn?.id === e.pointerId) {
      this.panning = null;
      if (tapped(pn.x0, pn.y0, pn.t)) host.act('toggleChrome');
      return;
    }
    const g = this.gesture;
    if (g && e.pointerId === g.id) {
      this.gesture = null;
      if (tapped(g.x, g.y, g.t)) host.act('toggleChrome');
      return;
    }

    const a = this.active;
    if (!a || e.pointerId !== a.id) return;
    this.active = null;
    a.use.end(cancelled);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { if (!closeOverlay()) history.back(); return; }
    if (overlayOpen() || (e.target as Element | null)?.closest?.('.menu, .dialog')) return;
    const g = gestureForKey(e.key);
    if (!g) return;
    e.preventDefault();
    this.host.act(g);
  };
}
