// What is on the reader's screen: the frames shown as slots, drawn from their pages (stand-ins
// first, then sharp), the screen of a score that can't be shown, drawing frames and their ink, the
// frozen layout while a cut is dragged, and drawing the next screens ahead. Which screen to show is
// the Pager's.

import type { Marking } from '../markings/model';
import { NoAccess } from '../originals/types';
import { NotSaved, type Drawn } from '../page-cache/types';
import type { Hatches } from '../render/draw';
import { framesOnScreen } from '../render/layout';
import { pageWidths, screenAt } from '../render/screen';
import type { Frame } from '../scores/frames';
import { A4, type State } from '../scores/model';
import { dpr } from '../ui/dom';
import { failed } from '../ui/failure';
import type { Toast } from '../ui/toast';
import type { DrawPage, Item, OpenScore } from './_open-scores';
import { blankBox, type Unread } from './_setlist';
import { drawSlot, drawSlotInk, placeBoxes, placeSlots, type FrameSlot } from './_slots';
import type { StageZoom } from './_stage-zoom';

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
  private count = 1;
  private seq = 0;
  /** Aborted when the screen changes: the pages drawn ahead for it are no longer wanted. */
  private ahead = new AbortController();
  /** Page canvases drawn at the frame's width, by 0-based page, for the frames on screen. */
  private pages = new Map<number, HTMLCanvasElement>();
  /** The toast asking for access to the scores folder shows, until a page is drawn. */
  private askingAccess = false;

  constructor(private host: ScreenHost, private zoom: StageZoom) {}

  /** The frames on the screen. */
  get slots(): FrameSlot[] { return this.slotList; }

  /** How many frames the screen shows. */
  get shown(): number { return this.count; }

  /**
   * The screen starting at frame f of `frames`: the frames on it (as many as f's shape decides,
   * fewer at the end), how many it wanted, and where they go, a setlist keeping room for the box
   * after a score's last frame.
   */
  private screenAt(frames: Frame[], f: number, W: number, H: number, scale: number) {
    return screenAt(frames, f, W, H, scale, this.host.inSetlist());
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
  async show({ turned = false, place = 'fresh' }: { turned?: boolean; place?: 'keep' | 'fresh' } = {}) {
    const { host } = this;
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
    const { on, wanted, rects } = this.screenAt(frames, frame, W, H, scale);
    this.count = on.length;
    const widths = pageWidths(on, rects.map((r) => r.w));
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

    // In a setlist each score starts on a fresh screen, so a score's last screen may have room left.
    const extra = host.inSetlist() && on.length < wanted ? [this.blank()] : [];
    this.slotList = placeSlots(on, frame, W, H, scale, extra);
    for (const s of this.slotList) this.draw(s, cur.state);
    host.screen.replaceChildren(...this.slotList.map((s) => s.box), ...extra);
    if (place === 'fresh') this.zoom.placeFresh();
    // The score's pages are its frames; in a setlist, the excerpt's own.
    const last = frame + on.length;
    host.showed(on[0]?.items[0]?.cut.id, on.length > 1 ? `Pages ${frame + 1}–${last} of ${frames.length}` : `Page ${last} of ${frames.length}`);
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
    this.count = 1;
    const boxes = [blankBox(undefined, { title, why }), ...(framesOnScreen(A4, W, H) === 2 ? [this.blank()] : [])];
    placeBoxes(boxes, boxes.map(() => A4), W, H, dpr());
    host.screen.replaceChildren(...boxes);
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
    const W = host.stage.clientWidth, H = host.stage.clientHeight;
    const frames = host.frames(), frame = host.frame();
    const starts = [frame + this.count, ...(frame > 0 ? [Math.max(0, frame - this.count)] : [])].filter((f) => f < frames.length);
    // Each page at one width: the current screen's where it is on it.
    const near = new Map<number, number>();
    for (const f of starts) {
      const { on, rects } = this.screenAt(frames, f, W, H, scale);
      for (const [p, w] of pageWidths(on, rects.map((r) => r.w))) near.set(p, w);
    }
    for (const [p, w] of widths) near.set(p, w);
    const { signal } = this.ahead, draw = host.current()!.draw!;
    await Promise.all([...near].map(([p, w]) => draw(p + 1, Math.round(w * scale), { priority: 'ahead', signal }).catch(() => {})));
    if (seq !== this.seq) return;
    // On a score's last screen in a setlist, draw the next score's first screen too.
    if (!host.inSetlist() || frame + this.count < frames.length) return;
    const next = await host.next();
    if (seq !== this.seq || !next) return;
    const { on, rects } = this.screenAt(next.frames, 0, W, H, scale);
    await Promise.all([...pageWidths(on, rects.map((r) => r.w))].map(([p, w]) => next.draw(p + 1, Math.round(w * scale), { priority: 'ahead', signal }).catch(() => {})));
  }

  /** The reader is closing, or the screen is going: no screen being drawn shows, and drawing ahead stops. */
  stop() {
    this.seq++;
    this.ahead.abort();
  }
}
