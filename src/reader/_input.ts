// Pointer and keyboard input on the score: palm rejection, pinch, handing a pointer to the cut
// editor or the equipped tool, and presses, taps and keys that turn pages or hide the toolbar. What each tool does
// is in tools/.

import type { Marking, Point } from '../markings/model';
import type { PlacedMark } from '../markings/placed';
import { markingAt } from '../scores/placing';
import { pinch, type Pt, type View, type Zoom } from '../render/zoom';
import { closeOverlay, overlayOpen } from '../ui/overlay';
import type { CutEditor } from './_cuts/_editor';
import { gestureForKey, isTap, turnFor, type Gesture } from './_gestures';
import type { FrameSlot } from './_spread';
import type { Press, Tool, ToolHost, ToolName, ToolPointer } from './_tools/_tool';

/** What a press goes to, from what is known of it as it goes down. */
export function _route(f: {
  onTab: boolean; turn: 'next' | 'prev' | null; toolbarShown: boolean; eraserButton: boolean;
  onFrame: boolean; selecting: boolean;
}): 'tab' | 'turn' | 'toolbar-tap' | 'select' | 'tool' | 'hand' {
  if (f.onTab) return 'tab';
  if (f.turn) return 'turn';
  if (!f.toolbarShown) return 'toolbar-tap';
  if (!f.onFrame) return 'hand';
  // The stylus's eraser button is Erase's press, which doesn't select.
  return f.selecting && !f.eraserButton ? 'select' : 'tool';
}

/**
 * While the pen is down, and this long after it lifts, finger touches are ignored, as they are
 * probably the writing hand: they neither write nor turn.
 */
const PALM_GUARD_MS = 600;
/** How far from a marking's ink a press still counts as on it, in CSS pixels. */
const SELECT_MARGIN_PX = 12;

/** What pointer and key handling needs from the reader, besides what the tools need. */
export interface InputHost extends ToolHost {
  editor: CutEditor;
  tool(): ToolName;
  /** The stylus's eraser button lends `tool` for the length of the press. */
  lendForPress(tool: ToolName): void;
  /** The press that lent a tool ended: it goes. */
  endPressLend(): void;
  setZoom(z: Zoom): void;
  /** The part of the stage below the toolbar. */
  view(): View;
  /** The smallest zoom. */
  minScale(): number;
  /** The toolbar showing means annotation mode: zooming and writing are available. */
  annotating(): boolean;
  /** Turn a page, or show or hide the toolbar. */
  act(g: Gesture): void;
}

/**
 * Pointers and keys on the score. A press turns the page as it goes down: at each side while the
 * toolbar is hidden (a tap in the middle shows it, and so does a pinch whose first finger goes down
 * there), and only in the band at each side while it shows (_gestures.ts). Otherwise,
 * with the toolbar showing, two fingers pinch, and a pen or finger uses the equipped tool
 * (tools/): the hand tool pans and a tap hides the toolbar. A palm resting while the pen writes is
 * ignored. The cut editor's tabs get the pointer first.
 */
export class Input {
  /** Fingers currently on the screen, by pointer id. */
  private fingers = new Map<number, Pt>();
  /** Pointers to disregard until they lift: palms, and the finger left over after a pinch. */
  private ignored = new Set<number>();
  /** The pointer using a tool, and the frame it started on. */
  private active: { id: number; type: string; slot?: FrameSlot; rect?: DOMRect; tool: Tool; use: ToolPointer; lent: boolean } | null = null;
  private gesture: { id: number; x: number; y: number; t: number } | null = null;
  private pinching: { ids: [number, number]; start: Zoom; c0: Pt; d0: number } | null = null;
  private lastPen = 0;
  /** Pens on the screen, by pointer id. */
  private pens = new Set<number>();

  constructor(private host: InputHost, private tools: Record<ToolName, Tool>) {
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

  /** A press on `hit`'s frame, as a tool gets it. */
  private press(e: PointerEvent, hit: { slot: FrameSlot; rect: DOMRect } | null): Press {
    return { slot: hit?.slot, framePoint: this.point(e, hit?.rect), screenPoint: { x: e.clientX, y: e.clientY } };
  }

  /** A point on a frame: x as a fraction of its width, y in frame widths from its top. */
  private point(e: PointerEvent, rect?: DOMRect): Point {
    const pressure = e.pointerType === 'pen' ? e.pressure : 0.5;
    return rect ? [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.width, pressure] : [0, 0, pressure];
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
    if (a.lent) this.host.endPressLend();
  }

  private startPinch() {
    const [a, b] = [...this.fingers.entries()];
    const c0 = this.stagePoint((a[1].x + b[1].x) / 2, (a[1].y + b[1].y) / 2);
    this.pinching = { ids: [a[0], b[0]], start: this.host.zoom(), c0, d0: Math.max(1, Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y)) };
  }

  private onDown = (e: PointerEvent) => {
    const { host } = this;
    // 1. An open menu or panel: the press only closes it.
    if (overlayOpen()) { closeOverlay(); return; }
    // 2. Chrome that takes its own presses (the delete button, the typing field): no capture, no tool.
    if ((e.target as Element | null)?.closest?.('[data-own-presses]')) return;
    // 3. While the tool suppresses all presses (Text while typing), each one is the tool's.
    const equipped = this.tools[host.tool()];
    if (equipped.suppressions?.().allPresses) {
      equipped.start(this.press(e, this.slotAt(e.clientX, e.clientY)));
      return;
    }
    const now = performance.now();
    if (e.pointerType === 'pen') {
      this.lastPen = now;
      this.pens.add(e.pointerId);
      // A palm often lands just before the pen tip; drop whatever it started.
      if (this.active?.type === 'touch') this.dropActive();
      if (this.pinching) {
        for (const id of this.fingers.keys()) this.ignored.add(id);
        this.pinching = null;
      }
      this.gesture = null;
    }
    if (e.pointerType === 'touch') {
      this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pens.size || this.active?.type === 'pen' || now - this.lastPen < PALM_GUARD_MS) { this.ignored.add(e.pointerId); return; }
      if (this.fingers.size >= 2) {
        // A second finger: this is a pinch, not writing, a tap or panning. With the toolbar hidden,
        // only when the first went down in the middle, where it didn't turn: the pinch shows the toolbar.
        // A marking being moved or resized stays as it is: the second finger is ignored. Placing one is dropped by the pinch.
        if (this.active?.tool.suppressions?.().pinching) { this.ignored.add(e.pointerId); return; }
        const fromMiddle = !!this.gesture && this.fingers.has(this.gesture.id);
        this.dropActive();
        host.editor.cancel();
        this.gesture = null;
        if (this.fingers.size === 2 && (host.annotating() || fromMiddle)) {
          if (!host.annotating()) host.act('toggleChrome');
          this.startPinch();
        } else this.ignored.add(e.pointerId);
        return;
      }
    }
    if (this.active || this.pinching) return;
    if (e.button === 2) return; // right-click opens a menu instead
    host.stage.setPointerCapture(e.pointerId);
    const onTab = host.editor.onDown(e); // 6. a tab takes the pointer
    const eraserButton = e.pointerType === 'pen' && !!(e.buttons & 32); // the pen's eraser end or button
    const tool = eraserButton ? 'eraser' : host.tool();
    const toolbar = host.annotating();
    const turn = turnFor(this.stagePoint(e.clientX, e.clientY).x, host.stage.clientWidth, toolbar);
    const hit = this.slotAt(e.clientX, e.clientY);
    const route = _route({ onTab, turn, toolbarShown: toolbar, eraserButton, onFrame: !!hit, selecting: !!hit && !this.tools[tool].suppressions?.().selecting });
    switch (route) {
      case 'tab': return;
      case 'turn': host.act(turn!); return;
      case 'toolbar-tap': // the middle, toolbar hidden: only a tap, which shows it
        this.gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, t: now };
        return;
      case 'hand': if (tool !== 'hand') return; break; // off the frames only the hand tool gets presses
    }
    // 9. The stylus's eraser button lends Erase for this press.
    if (eraserButton) host.lendForPress('eraser');
    let t = this.tools[tool];
    let on: Press['on'];
    // 10. Selecting.
    if (route === 'select') {
      const found = this.selectStep(e, hit!, t);
      if (found === 'ended') return;
      if (found) { t = found.tool; on = found.on; }
    }
    // 11. The tool; one that declines the press leaves it to the hand tool.
    const press = { ...this.press(e, hit), on };
    const use = t.start(press) ?? (t === this.tools.hand ? undefined : this.tools.hand.start(press));
    if (use) this.active = { id: e.pointerId, type: e.pointerType, slot: hit?.slot, rect: hit?.rect, tool: t, use, lent: eraserButton };
    else if (eraserButton) host.endPressLend();
  };

  /** The marking that is a press's, or the selection's chrome it is on, or the end of the selection. */
  private selectStep(e: PointerEvent, hit: { slot: FrameSlot; rect: DOMRect }, active: Tool): { tool: Tool; on: NonNullable<Press['on']> } | 'ended' | undefined {
    const { host } = this, fp = this.point(e, hit.rect), sel = host.selected();
    // 1. The active tool's chrome: the box and handles of the selected marking.
    if (sel && active.isChromeAt?.(hit.slot, fp)) return { tool: active, on: { what: 'chrome' } };
    // 2. The nearest marking some tool owns: selected, which lends its tool.
    const owner = (m: Marking) => Object.values(this.tools).find((t) => t.ownsMarking?.(m));
    const found = markingAt(hit.slot.frame, host.state().ink, host.aspects(), [fp[0], fp[1]], SELECT_MARGIN_PX / (hit.slot.w * host.zoom().s), (m) => !!owner(m));
    if (found) {
      const picked = { page: found.cut.page, cut: found.cut.id, mark: found.mark as PlacedMark };
      host.select(picked);
      return { tool: owner(found.mark)!, on: { what: 'grabbed', sel: picked } };
    }
    // 3. Anywhere else, a selection only ends.
    if (sel) { host.select(undefined); return 'ended'; }
    return undefined;
  }

  private onMove = (e: PointerEvent) => {
    const { host } = this;
    if (e.pointerType === 'pen') this.lastPen = performance.now();
    if (e.pointerType === 'touch' && this.fingers.has(e.pointerId)) this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (host.editor.onMove(e)) return;

    const pz = this.pinching;
    if (pz && pz.ids.includes(e.pointerId)) {
      const a = this.fingers.get(pz.ids[0]), b = this.fingers.get(pz.ids[1]);
      if (!a || !b) return;
      const c = this.stagePoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      host.setZoom(pinch(pz.start, pz.c0, pz.d0, c, Math.hypot(a.x - b.x, a.y - b.y), host.view(), host.minScale()));
      return;
    }

    const a = this.active;
    if (!a || e.pointerId !== a.id) return;
    const events = e.getCoalescedEvents?.() ?? [];
    for (const ce of events.length ? events : [e]) a.use.move(this.point(ce, a.rect), { x: ce.clientX, y: ce.clientY });
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
    if (a.lent) host.endPressLend();
  }

  private onKey = (e: KeyboardEvent) => {
    if ((e.target as Element | null)?.closest?.('.typing')) return; // typing never turns the page
    if (e.key === 'Escape') { if (!closeOverlay()) history.back(); return; }
    if (overlayOpen() || (e.target as Element | null)?.closest?.('.menu, .dialog')) return;
    const g = gestureForKey(e.key);
    if (!g) return;
    e.preventDefault();
    this.host.act(g);
  };
}
