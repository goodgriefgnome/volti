// What is on the reader's screen: the frames shown as slots, drawn from their pages (stand-ins
// first, then sharp), the screen of a score that can't be shown, drawing frames and their ink, the
// frozen layout while a cut is dragged, and drawing the next screens ahead. Which screen to show is
// the Pager's.

import type { Marking } from '../markings/model';
import { NoAccess } from '../originals/types';
import { NotSaved, type Drawn } from '../page-cache/types';
import type { Hatches } from '../render/draw';
import { pageWidths } from '../render/screen';
import { layStrip, stripDistance, stripScreen } from '../render/strip';
import type { Frame } from '../scores/frames';
import { A4, type State } from '../scores/model';
import { smallestScale } from '../settings/turning';
import { dpr } from '../ui/dom';
import { failed } from '../ui/failure';
import type { Toast } from '../ui/toast';
import type { DrawPage, Item, OpenScore } from './_open-scores';
import { blankBox, type Unread } from './_setlist';
import { drawSlot, drawSlotInk, placeBoxes, placeSlots, type FrameSlot } from './_slots';
import type { StageZoom } from './_stage-zoom';
import type { Strip, StripScreen } from '../render/strip';

export interface ScreenHost {
  stage: HTMLElement;
  screen: HTMLElement;
  toast: Toast;
  /** The item read. */
  item(): Item;
  /** Its score, once open. */
  current(): OpenScore | undefined;
  /** Its frames. */
  frames(): Frame[];
  /** The first frame on the screen. */
  frame(): number;
  /** The first frame on the screen, brought within the item's frames. */
  setFrame(f: number): void;
  /** The strip of the item's frames (or of `frames`) on the stage. */
  strip(frames?: Frame[]): Strip;
  /** The first frames of the screens before and after this one in the item's list, those there are. */
  neighbours(): number[];
  /** An item is opening: nothing is shown until it has. */
  loading(): boolean;
  /** Reading a setlist: each score starts on a screen of its own, and the next one's first screen is drawn ahead. */
  inSetlist(): boolean;
  /** The next item's title; undefined after the last. */
  nextTitle(): string | undefined;
  /** In a setlist, the next item's score opened, with its frames; null when there is none or it can't be opened. */
  next(): Promise<{ draw: DrawPage; frames: Frame[] } | null>;
  /** The page info under the title. */
  info(text: string): void;
  /** The title, before a screen is drawn. */
  title(): void;
  /** A screen of the score's frames shows, its first cut `first`: the cut editor, the tools' chrome, the selection, the page info `info`, the score card and the place read follow. */
  showed(first: string | undefined, info: string): void;
  /** A score that can't be shown shows, with the page info `info`: the score card follows. */
  showedUnread(info: string): void;
  /** Ask for access to the scores folder, from a tap. */
  allowAccess(): Promise<boolean>;
}

export class Screen {
  private slotList: FrameSlot[] = [];
  /** The last frame on the screen, whole or part, and the last whole one. */
  private lastShown = 0;
  private lastWhole = 0;
  private seq = 0;
  /** Aborted when the screen changes: the pages drawn ahead for it are no longer wanted. */
  private ahead = new AbortController();
  /** Page canvases drawn at the frame's width, by 0-based page, for the frames on screen. */
  private pages = new Map<number, HTMLCanvasElement>();
  /** The toast asking for access to the scores folder shows, until a page is drawn. */
  private askingAccess = false;
  /** What the screen holds now: its boxes (slots and the blank), and the first frame it shows. */
  private boxes: HTMLElement[] = [];
  private firstFrame = 0;
  /** A slide that is running: its animations, and the boxes it is taking away. */
  private sliding: { animations: Animation[]; old: HTMLElement[] } | null = null;
  private slideStart = 0; // TEMPORARY (slide check)

  constructor(private host: ScreenHost, private zoom: StageZoom) {}

  /** The frames on the screen. */
  get slots(): FrameSlot[] { return this.slotList; }

  /** The last frame on the screen, whole or part. */
  get last(): number { return this.lastShown; }

  /** A slide that is moving ends at once: the boxes it takes away go. */
  private finishSlide(why = 'finished') {
    if (!this.sliding) return;
    // TEMPORARY (slide check on the tablet): say when a slide is cut short.
    if (why !== 'finished') this.host.toast.say(`Slide cut short by ${why} after ${Math.round(performance.now() - this.slideStart)} ms`);
    for (const a of this.sliding.animations) a.cancel();
    for (const box of this.sliding.old) box.remove();
    this.sliding = null;
  }

  /**
   * Put `boxes` on the screen. With `slide` (a turn, 1 forward or -1 back, within the item), the old
   * boxes stay under them and the strip slides by `distance` (CSS pixels along, signed) over
   * `--quick`; otherwise the old are replaced at once.
   */
  private put(boxes: HTMLElement[], slide: 1 | -1 | undefined, along: 'x' | 'y', distance: number) {
    const { screen } = this.host, old = this.boxes;
    this.finishSlide('put');
    this.boxes = boxes;
    if (!slide || !old.length || !distance || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // TEMPORARY (slide check on the tablet): say why a turn doesn't slide.
      if (slide) this.host.toast.say(`No slide: ${!old.length ? 'no old boxes' : !distance ? 'distance 0' : 'reduced motion'}`);
      screen.replaceChildren(...boxes);
      return;
    }
    this.slideStart = performance.now();
    const move = (d: number) => `translate${along === 'x' ? 'X' : 'Y'}(${d}px)`;
    const options = { duration: 1000, easing: 'ease-out' }; // TEMPORARY (slide check): was --quick
    screen.append(...boxes);
    const animations = [
      ...old.map((box) => box.animate([{ transform: move(0) }, { transform: move(-distance) }], options)),
      ...boxes.map((box) => box.animate([{ transform: move(distance) }, { transform: move(0) }], options)),
    ];
    this.sliding = { animations, old };
    void Promise.all(animations.map((a) => a.finished)).then(() => { if (this.sliding?.animations === animations) this.finishSlide(); }, () => {});
  }

  /** The frames of the screen at `sc` of `frames`, whole ones then the part, and the widths of their boxes. */
  private framesOf(frames: Frame[], sc: StripScreen) {
    const on = [...sc.whole, ...(sc.part === undefined ? [] : [sc.part])].map((i) => frames[i]);
    return { on, widths: pageWidths(on, sc.boxes.map((b) => b.w)) };
  }

  /** In a setlist, what fills the rest of a score's last screen. */
  private blank(): HTMLElement {
    return blankBox(this.host.nextTitle());
  }

  /**
   * Show the screen. `turned`, from a tap that turned to it: a screen that can't be shown at all
   * without access to the scores folder asks for it then. Otherwise only the toolbar asks.
   * `place`: a new screen is placed fresh (see placeFresh); 'keep' leaves the screen where it is.
   */
  async show({ turned = false, place = 'fresh', slide }: { turned?: boolean; place?: 'keep' | 'fresh'; slide?: 1 | -1 } = {}) {
    const { host } = this;
    this.finishSlide('another show()');
    const seq = ++this.seq; // a newer show() (turn, resize, edit) supersedes this one
    this.ahead.abort();
    this.ahead = new AbortController();
    const W = host.stage.clientWidth;
    const H = host.stage.clientHeight;
    if (!W || !H || host.loading()) return;
    host.title();
    const it = host.item();
    const cur = host.current();
    if (!cur?.draw) {
      // A score that can't be opened: say so, and carry on with the next one.
      this.showUnread(it.title, it.needsAccess ? 'access' : 'missing', W, H, turned, place);
      return;
    }
    const frames = host.frames();
    host.setFrame(Math.max(0, Math.min(host.frame(), frames.length - 1)));
    const frame = host.frame();
    const scale = dpr();
    const strip = host.strip();
    const sc = stripScreen(strip, frame);
    const { on, widths } = this.framesOf(frames, sc);
    this.lastShown = frame + on.length - 1;
    this.lastWhole = frame + sc.whole.length - 1;
    // Each page's first yield (a stand-in, or the exact page) shows the screen; the rest sharpen it.
    const progressive = cur.drawProgressive!;
    const drawing = [...widths].map(([p, w]) => progressive(p + 1, Math.round(w * scale), { priority: 'now' })[Symbol.asyncIterator]());
    let first: Drawn[];
    try {
      first = (await Promise.all(drawing.map(async (it) => {
        const r = await it.next();
        if (r.done) throw new Error('Nothing drawn');
        return r.value;
      })));
    } catch (e) {
      for (const it of drawing) void it.return?.().catch(() => {});
      if (seq !== this.seq) return;
      // A page not saved as a picture: of a PDF that can't be read until access is allowed, or of a file that is gone.
      if (e instanceof NoAccess || e instanceof NotSaved) { this.showUnread(it.title, it.fileGone ? 'unsaved' : 'access', W, H, turned, place); return; }
      host.info(failed('draw this page', e));
      return;
    }
    if (seq !== this.seq) {
      for (const it of drawing) void it.return?.().catch(() => {});
      return;
    }
    if (this.askingAccess) { this.askingAccess = false; host.toast.hide(); }
    // Full screen missed as the reader opened (access took long to allow): asked for again by a turn
    // that shows its screen, not before, as asking for access needs the turn's tap more.
    if (turned && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
    this.pages = new Map([...widths.keys()].map((p, i) => [p, first[i].canvas]));

    // In a setlist the empty stretch past a score's last frame holds the next entry's title.
    const extra: HTMLElement[] = [];
    if (host.inSetlist() && sc.empty) {
      const blank = this.blank(), end = sc.boxes[sc.whole.length - 1], e = sc.empty;
      const [x, y, w, h] = strip.along === 'x' ? [e.at, end.y, e.len, end.h] : [end.x, e.at, end.w, e.len];
      Object.assign(blank.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
      extra.push(blank);
    }
    this.slotList = placeSlots(on, frame, sc.boxes, sc.part !== undefined);
    for (const s of this.slotList) this.draw(s, cur.state);
    this.put([...this.slotList.map((s) => s.box), ...extra], slide, strip.along, stripDistance(strip, this.firstFrame, frame));
    this.firstFrame = frame;
    if (place === 'fresh') this.zoom.placeFresh();
    // The score's pages are its frames; in a setlist, the excerpt's own. Only whole frames count.
    const last = this.lastWhole + 1;
    host.showed(on[0]?.items[0]?.cut.id, sc.whole.length > 1 ? `Pages ${frame + 1}–${last} of ${frames.length}` : `Page ${last} of ${frames.length}`);
    void this.predraw(seq, widths, scale);
    [...widths.keys()].forEach((p, i) => void this.sharpen(seq, p, drawing[i]));
  }

  /**
   * Page p's draws after its first: as each arrives, put it in `pages` and redraw the slots that
   * show it, unless the screen has moved on. A failure keeps the page that is shown.
   */
  private async sharpen(seq: number, p: number, drawing: AsyncIterator<Drawn>) {
    try {
      for (let r = await drawing.next(); !r.done; r = await drawing.next()) {
        if (seq !== this.seq) { void drawing.return?.().catch(() => {}); return; }
        this.pages.set(p, r.value.canvas);
        for (const s of this.slotList) if (s.frame.items.some((i) => i.cut.page === p)) this.draw(s, this.host.current()!.state);
      }
    } catch (e) {
      if (seq !== this.seq) return;
      this.host.info(failed('draw this page', e));
    }
  }

  /**
   * In place of the screen, a score that can't be shown: missing; (`access`) in the scores folder,
   * which Volti may not read until access is allowed, offered from a tap (and asked for at once when
   * `turned` to); or (`unsaved`) a gone file whose saved pages don't include this screen's.
   */
  private showUnread(title: string, why: Unread, W: number, H: number, turned = false, place: 'keep' | 'fresh' = 'fresh') {
    const { host } = this;
    this.slotList = [];
    this.lastShown = this.lastWhole = 0;
    // One A4 frame alone, centred, with nothing beside it.
    const box = blankBox(undefined, { title, why });
    placeBoxes([box], stripScreen(layStrip([A4], W, H, dpr(), smallestScale()), 0).boxes);
    this.finishSlide('an unread screen');
    this.boxes = [box];
    this.firstFrame = 0;
    host.screen.replaceChildren(box);
    if (place === 'fresh') this.zoom.placeFresh();
    host.showedUnread({ access: 'Needs access', missing: 'Missing', unsaved: 'Not saved' }[why]);
    // Offered until the screen shows something else, as the page can't be read without it.
    if (why === 'access') {
      host.toast.say('Volti needs access to the scores folder to show this.', ['Allow access', () => void host.allowAccess()], true);
      this.askingAccess = true;
      if (turned) void host.allowAccess();
    }
  }

  /** Draw a frame's music and ink at its current layout. */
  draw(slot: FrameSlot, s: State, hatches?: Hatches, extra?: Marking) {
    drawSlot(slot, this.pages, this.host.current()!.aspects, s.ink, hatches, extra);
  }

  drawInk(slot: FrameSlot, s: State, extra?: Marking) {
    drawSlotInk(slot, this.host.current()!.aspects, s.ink, extra);
  }

  /** Each slot takes its frame of `frames` (by its index) and its ink is drawn from `s`. */
  reframe(frames: Frame[], s: State) {
    for (const slot of this.slotList) {
      slot.frame = frames[slot.index];
      this.drawInk(slot, s);
    }
  }

  /** Each slot takes its frame of `frames`, where there is one, and is drawn from `s`: a cut dragged. */
  redraw(frames: Frame[], s: State, hatches?: Hatches) {
    for (const slot of this.slotList) {
      slot.frame = frames[slot.index] ?? slot.frame;
      this.draw(slot, s, hatches);
    }
  }

  /** Draw the next and previous screens' pages in the background; `widths` are the current screen's. */
  private async predraw(seq: number, widths: Map<number, number>, scale: number) {
    const { host } = this;
    const frames = host.frames(), strip = host.strip();
    // Each page at one width: the current screen's where it is on it.
    const near = new Map<number, number>();
    for (const start of host.neighbours()) {
      for (const [p, w] of this.framesOf(frames, stripScreen(strip, start)).widths) near.set(p, w);
    }
    for (const [p, w] of widths) near.set(p, w);
    const { signal } = this.ahead, draw = host.current()!.draw!;
    await Promise.all([...near].map(([p, w]) => draw(p + 1, Math.round(w * scale), { priority: 'ahead', signal }).catch(() => {})));
    if (seq !== this.seq) return;
    // On a score's last screen in a setlist, draw the next score's first screen too.
    if (!host.inSetlist() || this.lastWhole < frames.length - 1) return;
    const next = await host.next();
    if (seq !== this.seq || !next) return;
    const nextWidths = this.framesOf(next.frames, stripScreen(host.strip(next.frames), 0)).widths;
    await Promise.all([...nextWidths].map(([p, w]) => next.draw(p + 1, Math.round(w * scale), { priority: 'ahead', signal }).catch(() => {})));
  }

  /** The reader is closing, or the screen is going: no screen being drawn shows, and drawing ahead stops. */
  stop() {
    this.finishSlide('stop()');
    this.seq++;
    this.ahead.abort();
  }
}
