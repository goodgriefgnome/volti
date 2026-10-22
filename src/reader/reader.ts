import { PEN_COLORS, type Stroke } from '../ink/model';
import { frameOf, pack, type Frame } from '../pieces/frames';
import type { Aspects, Cut, State } from '../pieces/model';
import { loadPiece, pieceSaver, savePosition } from '../pieces/store';
import { openPdf, type PageCache } from '../sources/pdf';
import type { Score } from '../sources/scores';
import { savePrefs, type Prefs } from '../storage/prefs';
import { el } from '../ui/dom';
import { CutEditor } from './cuts/editor';
import { Detail } from './detail';
import type { Hatches } from './frames';
import type { Gesture } from './gestures';
import { History } from './history';
import { Input } from './input';
import { pagesPerScreen } from './layout';
import { frameSize, paintSlot, paintSlotInk, placeSlots, type FrameSlot } from './spread';
import { nextLayout, Toolbar, type Tool } from './toolbar';
import { isZoomed, NO_ZOOM, type Zoom } from './zoom';

const dpr = () => window.devicePixelRatio || 1;

/** Whether two played orders put the same music in the same places. */
const sameLayout = (a: readonly Cut[], b: readonly Cut[]) =>
  a.length === b.length && a.every((c, i) => c.id === b[i].id && c.page === b[i].page && c.y0 === b[i].y0 && c.y1 === b[i].y1 && c.pad === b[i].pad);

export async function openReader(score: Score, prefs: Prefs, onClose: () => void): Promise<void> {
  const cache = await openPdf(await score.getFile());
  const aspects = await cache.allAspects();
  const { state, position } = await loadPiece(score.id, score.title, aspects);
  new Reader(score, cache, aspects, state, position, prefs, onClose);
}

/**
 * The score screen. It holds the piece being read and the frames on the screen, and joins up
 * the toolbar, pointer input, the cut editor and the zoomed close-up.
 */
class Reader {
  private root = el('div', 'viewer');
  private stage = el('div', 'stage');
  private spreadEl = el('div', 'spread');
  private toast = el('p', 'toast');
  private toolbar: Toolbar;

  private perScreen: 1 | 2 = 1;
  /** The first frame on the screen. */
  private frame = 0;
  private frames: Frame[] = [];
  private seq = 0;
  private slots: FrameSlot[] = [];
  /** Page canvases drawn at the frame's width, by 0-based page, for the frames on screen. */
  private pages = new Map<number, HTMLCanvasElement>();

  private zoom: Zoom = NO_ZOOM;
  private detail: Detail;

  private tool: Tool = 'none';
  private penColor: string = PEN_COLORS[0];
  private undos = new History();
  private saver;
  private editor: CutEditor;
  private input: Input;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

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
      thumb: (page, w) => this.cache.render(page + 1, w, Math.round(w * aspects[page]), dpr()),
      inking: () => this.tool !== 'none',
      cancelGesture: () => this.input.cancelGesture(),
      say: (t) => this.say(t),
      changed: () => this.syncBar(),
    });
    this.detail = new Detail({
      stage: this.stage,
      cache,
      aspects,
      slots: () => this.slots,
      zoom: () => this.zoom,
      ink: () => this.state.ink,
    });
    this.toolbar = new Toolbar(score.title, {
      close: () => history.back(),
      tool: (t) => this.setTool(t),
      penColor: (c) => { this.penColor = c; this.tool = 'pen'; this.syncBar(); },
      undo: () => this.undo(),
      redo: () => this.redo(),
      toggleEditing: () => { this.editor.setEnabled(!this.editor.enabled); this.syncBar(); this.decorate(); },
      openArchive: () => this.editor.openArchive(),
      fit: () => this.setZoom(NO_ZOOM),
      nextLayout: () => {
        this.prefs.pagesPerScreen = nextLayout(this.prefs.pagesPerScreen);
        void savePrefs(this.prefs);
        this.syncBar();
        void this.show();
      },
    });
    this.syncBar();
    this.stage.append(this.spreadEl);
    this.root.append(this.stage, this.toolbar.el, this.toast);
    document.body.append(this.root);
    document.body.classList.add('viewing');

    this.input = new Input({
      stage: this.stage,
      aspects,
      editor: this.editor,
      slots: () => this.slots,
      state: () => this.state,
      tool: () => this.tool,
      penColor: () => this.penColor,
      zoom: () => this.zoom,
      setZoom: (z) => this.setZoom(z),
      annotating: () => this.annotating,
      act: (g) => this.act(g),
      paintInk: (slot, extra) => this.paintInk(slot, this.state, extra),
      commit: (s, focus) => this.commit(s, focus),
      erased: (s, slot) => this.erased(s, slot),
      eraseEnded: (before, slot) => this.eraseEnded(before, slot),
    });
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('popstate', this.onPop);
    history.pushState({ viewer: true }, '');

    void document.documentElement.requestFullscreen?.().catch(() => {});
    void this.requestWake();
    this.observer.observe(this.stage);
  }

  /* ---------- toolbar ---------- */

  /** Tapping the active tool again puts it away. */
  private setTool(t: Tool) {
    this.tool = this.tool === t ? 'none' : t;
    this.syncBar();
  }

  private syncBar() {
    this.toolbar.sync({
      tool: this.tool,
      penColor: this.penColor,
      editing: this.editor.enabled,
      archived: this.state.piece.archived.length,
      layout: this.prefs.pagesPerScreen,
      zoomed: isZoomed(this.zoom),
      canUndo: this.undos.canUndo,
      canRedo: this.undos.canRedo,
    });
    this.root.classList.toggle('writing', this.tool !== 'none');
    this.root.classList.toggle('editing', this.editor.enabled);
    this.root.style.setProperty('--bar-h', this.toolbar.el.offsetHeight + 'px');
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

  private pageSize(page: number, w: number) { return { w, h: Math.round(w * this.aspects[page]) }; }

  private async show() {
    const seq = ++this.seq; // a newer show() (turn, resize, edit) supersedes this one
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    if (!W || !H) return;
    this.perScreen = pagesPerScreen(this.prefs.pagesPerScreen, W, H);
    this.frame = this.screenOf(Math.min(this.frame, this.frames.length - 1));
    const size = frameSize(W, H, this.perScreen, this.aspects);
    const scale = dpr();
    const on = this.frames.slice(this.frame, this.frame + this.perScreen);
    const pageNums = [...new Set(on.flatMap((f) => f.items.map((p) => p.cut.page)))];
    let canvases: HTMLCanvasElement[];
    try {
      canvases = await Promise.all(pageNums.map((p) => this.cache.render(p + 1, size.w, this.pageSize(p, size.w).h, scale)));
    } catch (e) {
      if (seq === this.seq) this.toolbar.info.textContent = 'Could not draw this page';
      console.error(e);
      return;
    }
    if (seq !== this.seq) return;
    this.pages = new Map(pageNums.map((p, i) => [p, canvases[i]]));

    this.slots = placeSlots(on, this.frame, W, H, size, scale);
    for (const s of this.slots) this.paint(s, this.state);
    this.spreadEl.replaceChildren(...this.slots.map((s) => s.box));
    this.setZoom(NO_ZOOM);
    this.decorate();
    const last = this.frame + on.length;
    this.toolbar.info.textContent = on.length > 1 ? `${this.frame + 1}–${last} of ${this.frames.length}` : `${last} of ${this.frames.length}`;
    const first = on[0]?.items[0];
    if (first) void savePosition(this.score.id, first.cut.id);
    void this.predraw(seq, size.w, scale);
  }

  /** Draw a frame's music and ink at its current layout. */
  private paint(slot: FrameSlot, s: State, hatches?: Hatches, extra?: Stroke) {
    paintSlot(slot, this.pages, this.aspects, s.ink, hatches, extra);
  }

  private paintInk(slot: FrameSlot, s: State, extra?: Stroke) {
    paintSlotInk(slot, this.aspects, s.ink, extra);
  }

  private decorate() {
    this.editor.decorate(this.slots, this.frames);
  }

  /** While a cut is dragged: show it with the layout frozen, the music being cut away hatched. */
  private preview(s: State | null, frames: Frame[] | null, hatches?: Hatches) {
    const all = frames ?? this.frames;
    this.detail.drop();
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
    this.undos.record(this.state, focus);
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

  /** The eraser took strokes away: show and save them gone, but leave the undo step until it lifts. */
  private erased(s: State, slot: FrameSlot) {
    this.state = s;
    this.saver.soon();
    this.paintInk(slot, s);
  }

  /** One undo step for the whole sweep of the eraser. */
  private eraseEnded(before: State, slot: FrameSlot) {
    this.undos.record(before, slot.frame.items[0]?.cut.id);
    this.frames = pack(this.state.piece.cuts, this.aspects);
    slot.frame = this.frames[slot.index];
    this.syncBar();
  }

  private undo() {
    const e = this.undos.undo(this.state);
    if (e) this.setState(e.state, e.focus);
  }

  private redo() {
    const e = this.undos.redo(this.state);
    if (e) this.setState(e.state, e.focus);
  }

  /* ---------- zoom ---------- */

  private setZoom(z: Zoom) {
    this.zoom = z;
    this.spreadEl.style.transform = isZoomed(z) ? `translate(${z.x}px, ${z.y}px) scale(${z.s})` : '';
    this.syncBar();
    this.detail.update();
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
    this.input.detach();
    document.removeEventListener('visibilitychange', this.onVisible);
    this.observer.disconnect();
    this.detail.stop();
    this.seq++;
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
