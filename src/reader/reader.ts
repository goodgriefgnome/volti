// The centre of the score screen: the frames on the screen, turning pages and scores, taking edits
// (commit, undo, redo), and opening and closing. It joins the other reader files together: what is
// read, and how edits carry to setlists, is reading.ts; the toolbar's menus and dialogs are
// toolbar-menus.ts. Code that can stand on its own goes in one of them.

import type { FileChange } from '../dialogs/score-files';
import { ends } from '../excerpts/span';
import type { Marking } from '../markings/model';
import { PEN_COLORS } from '../markings/stroke';
import { PasswordNotGiven } from '../originals/open';
import { knownTitles, type Original } from '../originals/originals';
import type { PageCache } from '../originals/pages';
import { framesOnScreen } from '../render/layout';
import type { Hatches } from '../render/paint';
import { pageWidths, screenAt } from '../render/screen';
import { isZoomed, NO_ZOOM, type Zoom } from '../render/zoom';
import { frameOf, pack, type Frame } from '../scores/frames';
import { A4, type Aspects, type Cut, type ExcerptName, type State } from '../scores/model';
import { loadScore, saveScorePosition } from '../scores/store';
import type { Setlist } from '../setlists/model';
import { loadSetlists } from '../setlists/store';
import { dpr, el } from '../ui/dom';
import { closeOverlay } from '../ui/overlay';
import { Toast } from '../ui/toast';
import { CutEditor } from './cuts/editor';
import { Detail } from './detail';
import type { Gesture } from './gestures';
import { History } from './history';
import { Input } from './input';
import { OpenScores, openPages, type Item, type OpenScore } from './open-scores';
import { Reading, setlistItems, type ReadingKind, type ReadingSnapshot } from './reading';
import { Saver } from './saver';
import { blankBox, ScoreCard, showSetlistTitle } from './setlist';
import { paintSlot, paintSlotInk, placeBoxes, placeSlots, type FrameSlot } from './spread';
import { backIcon, Toolbar, type ToolChoice } from './toolbar';
import { ReaderMenus } from './toolbar-menus';
import { offerScore, turnFrom, type Offer } from './turning';
import type { ToolName } from './tools';
import type { ReaderView } from './view';

/**
 * Undo keeps whole states: each entry is a score's state before an edit, what was read with the
 * setlists (whose excerpts follow the edit), the item it was made in, and the cut to show.
 */
interface Undo { open: OpenScore; state: State; reading: ReadingSnapshot; k: number; focus?: string }

/** What the reader opens: a score on its own, a named excerpt of one, or a setlist. */
export type ToRead =
  /** A score, with the library's scores in its order, to turn to past this one's ends. */
  | { kind: 'score'; original: Original; library: readonly Original[] }
  | { kind: 'excerpt'; original: Original; excerpt: ExcerptName }
  | { kind: 'setlist'; setlistId: string; originals: readonly Original[]; startEntry?: string };

/** How long the next score is offered after turning past a score's end: as long as the toast saying so shows. */
const OFFER_MS = 3500;

/** Whether two played orders put the same music in the same places. */
const sameLayout = (a: readonly Cut[], b: readonly Cut[]) =>
  a.length === b.length && a.every((c, i) => c.id === b[i].id && c.page === b[i].page && c.y0 === b[i].y0 && c.y1 === b[i].y1 && c.pad === b[i].pad);


/** Open a score, or a setlist as one continuous score. A score that can't be opened throws; a setlist carries on past it. */
export async function openReader(what: ToRead, onClose: (fileChanges: FileChange[]) => void): Promise<void> {
  const setlists = await loadSetlists();
  if (what.kind !== 'setlist') {
    const { original } = what;
    const { cache, aspects } = await openPages(original, true);
    const { state, position } = await loadScore(original.id, original.title, aspects);
    const first: OpenScore = { id: original.id, original, aspects, state, cache };
    const item = { scoreId: original.id, title: original.title, original };
    // An excerpt starts at its start each time: its place isn't kept.
    if (what.kind === 'excerpt') new Reader([item], { kind: 'excerpt', span: ends(what.excerpt) }, setlists, first, 0, undefined, onClose);
    else new Reader([item], { kind: 'score' }, setlists, first, 0, position, onClose, what.library);
    return;
  }
  const setlist = setlists.find((s) => s.id === what.setlistId);
  if (!setlist?.entries.length) throw new Error('No such setlist, or no scores in it');
  const items = setlistItems(setlist, new Map(what.originals.map((o) => [o.id, o])), await knownTitles());
  // From its first entry, as each performance runs from the top; or from the entry tapped.
  const k = Math.max(0, items.findIndex((it) => it.entryId === what.startEntry));
  new Reader(items, { kind: 'setlist', id: setlist.id }, setlists, null, k, undefined, onClose, what.originals);
}

/**
 * The score screen, for a score or a setlist. It holds the scores being read and the frames on
 * the screen, and joins up the toolbar, pointer input, the cut editor and the zoomed close-up.
 */
class Reader {
  // Opens ready to play, with the toolbar hidden: a tap in the middle brings it up.
  private root = el('div', 'reader chrome-hidden');
  private stage = el('div', 'stage');
  private spreadEl = el('div', 'spread');
  private scope = el('p', 'scope', 'Cuts changed here change the score, in every setlist');
  private toast = new Toast();
  private toolbar: Toolbar;

  /** How many frames the screen shows. */
  private shown = 1;
  /** The item being read. */
  private k = 0;
  /** The first frame on the screen, among the current item's. */
  private frame = 0;
  /** The current item's frames. */
  private frames: Frame[] = [];
  private scores: OpenScores;
  private goSeq = 0;
  private loading = false;
  private card = new ScoreCard(this.root);
  private seq = 0;
  private slots: FrameSlot[] = [];
  /** Page canvases drawn at the frame's width, by 0-based page, for the frames on screen. */
  private pages = new Map<number, HTMLCanvasElement>();

  private zoom: Zoom = NO_ZOOM;
  private detail: Detail;

  private tool: ToolChoice = 'none';
  private penColor: string = PEN_COLORS[0];
  private undos = new History<Undo>();
  private saver: Saver;
  private editor: CutEditor;
  private input: Input;

  private wake: WakeLockSentinel | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;
  private observer = new ResizeObserver(() => {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => void this.show(), 150);
  });

  private reading: Reading;
  private menus: ReaderMenus;
  /** Scores' files renamed, moved or removed here, for the library to show on going back. */
  private fileChanges: FileChange[] = [];
  /** The score offered by turning past this one's end: turning that way again while it is offered opens it. */
  private offered: Offer | null = null;

  constructor(
    items: Item[],
    what: ReadingKind,
    setlists: readonly Setlist[],
    first: OpenScore | null,
    k: number,
    position: string | undefined,
    private onClose: (fileChanges: FileChange[]) => void,
    /** The library's scores; in a score's own reader, in the library's order, to turn to. */
    private library: readonly Original[] = [],
  ) {
    this.reading = new Reading(items, what, setlists);
    this.scores = new OpenScores(items, first);
    this.saver = new Saver(() => this.reading.setlists, setlists);
    const view: ReaderView = {
      stage: this.stage,
      aspects: () => this.aspects,
      cache: () => this.cache,
      state: () => this.state,
      frames: () => this.frames,
      slots: () => this.slots,
      zoom: () => this.zoom,
    };
    this.editor = new CutEditor({
      ...view,
      commit: (s, focus) => this.commit(s, focus),
      preview: (s, frames, hatches) => this.preview(s, frames, hatches),
      thumb: (page, w) => this.cache.render(page + 1, w, Math.round(w * this.aspects[page]), dpr()),
      inking: () => this.tool !== 'none',
      cancelGesture: () => this.input.cancelGesture(),
      say: (t) => this.say(t),
      changed: () => this.syncBar(),
    });
    this.detail = new Detail(view);
    this.toolbar = new Toolbar(what.kind, {
      close: () => history.back(),
      scores: () => this.menus.scores(),
      excerpt: () => this.menus.excerpt(),
      excerpts: () => this.menus.excerpts(),
      more: () => void this.menus.more(),
      tool: (t) => this.setTool(t),
      penColor: (c) => { this.penColor = c; this.tool = 'pen'; this.syncBar(); },
      undo: () => this.undo(),
      redo: () => this.redo(),
      toggleEditing: () => { this.editor.setEnabled(!this.editor.enabled); this.syncBar(); this.decorate(); },
      openArchive: () => this.editor.openArchive(),
      fit: () => this.setZoom(NO_ZOOM),
    });
    this.menus = new ReaderMenus({
      reading: this.reading,
      toolbar: this.toolbar,
      saver: this.saver,
      k: () => this.k,
      open: (k) => this.scores.get(this.items[k].scoreId),
      goTo: (k, at) => void this.goTo(k, at),
      replay: () => {
        this.frames = this.framesFor(this.k);
        this.frame = 0;
        void this.show();
      },
      retitle: () => this.showTitle(),
      dismiss: () => this.editor.dismiss(),
      say: (t, action) => this.toast.say(t, action),
      library: this.library,
      relisted: (entryId, at) => this.relisted(entryId, at),
      readSpan: (span) => {
        this.reading.play(this.k, span);
        this.frames = this.framesFor(this.k);
        this.frame = 0;
        void this.show();
      },
      leave: () => history.back(),
      filesChanged: (change) => { this.fileChanges.push(change); },
    });
    this.syncBar();
    this.stage.append(this.spreadEl);
    this.scope.hidden = true;
    // While the toolbar is hidden, a small back arrow at the top left still leads to the library.
    const back = el('button', 'back');
    back.type = 'button';
    back.append(backIcon());
    back.setAttribute('aria-label', 'Library');
    back.addEventListener('click', () => history.back());
    this.root.append(this.stage, back, this.toolbar.el, this.scope, this.toast.el);
    document.body.append(this.root);
    document.body.classList.add('reading');

    this.input = new Input({
      ...view,
      editor: this.editor,
      tool: () => this.tool,
      penColor: () => this.penColor,
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
    history.pushState({ reader: true }, '');

    void document.documentElement.requestFullscreen?.().catch(() => {});
    void this.requestWake();
    void this.goTo(k, position);
    this.observer.observe(this.stage);
  }

  /* ---------- the scores read ---------- */

  private get items() { return this.reading.items; }

  /** The current item's score, once open; undefined while it opens or when it can't be. */
  private get current(): OpenScore | undefined { return this.scores.get(this.items[this.k].scoreId); }
  private get state(): State { return this.current!.state; }
  private get aspects(): Aspects { return this.current!.aspects; }
  private get cache(): PageCache { return this.current!.cache!; }

  private framesFor(k: number): Frame[] {
    const cur = this.scores.get(this.items[k].scoreId);
    return cur ? pack(this.reading.playedCuts(k, cur.state.score.cuts), cur.aspects) : [];
  }

  /** Go to item k: its first or last screen, or the screen holding a cut. */
  private async goTo(k: number, at?: string | 'first' | 'last') {
    const seq = ++this.goSeq;
    this.loading = true;
    if (k !== this.k) { this.editor.dismiss(); this.toolbar.info.textContent = 'Opening…'; }
    await this.scores.ensure(k, true);
    if (seq !== this.goSeq || this.scores.closed) return;
    this.loading = false;
    this.k = k;
    this.frames = this.framesFor(k);
    const f = at === 'last' ? this.lastScreen(this.frames) : at && at !== 'first' ? frameOf(this.frames, at) : 0;
    this.frame = Math.max(0, f);
    this.syncBar();
    await this.show();
    this.scores.keepNear(this.k);
  }

  /**
   * The setlist's entries changed: list them again, and read entry `entryId` where it is now, or,
   * when it's gone, the entry now at `at` (or the last); with none left, back to the library.
   */
  private relisted(entryId?: string, at = this.k) {
    const s = this.reading.setlist;
    if (!s?.entries.length) { history.back(); return; }
    const titles = Object.fromEntries(this.items.map((it) => [it.scoreId, it.title]));
    const was = this.items[this.k]?.entryId;
    this.reading.relist(setlistItems(s, new Map(this.library.map((o) => [o.id, o])), titles));
    const k = entryId ? this.items.findIndex((it) => it.entryId === entryId) : -1;
    if (k >= 0 && entryId === was) {
      // Still reading the same entry, only somewhere else in the setlist.
      this.k = k;
      this.syncBar();
      void this.show();
      this.scores.keepNear(k);
      return;
    }
    void this.goTo(k >= 0 ? k : Math.min(at, this.items.length - 1), 'first');
  }

  /* ---------- toolbar ---------- */

  /** Tapping the active tool again puts it away. */
  private setTool(t: ToolName) {
    this.tool = this.tool === t ? 'none' : t;
    this.syncBar();
  }

  private syncBar() {
    const cur = this.current;
    this.toolbar.sync({
      open: !!cur,
      tool: this.tool,
      penColor: this.penColor,
      editing: this.editor.enabled,
      archived: cur?.state.score.archived.length ?? 0,
      zoomed: isZoomed(this.zoom),
      canUndo: this.undos.canUndo,
      canRedo: this.undos.canRedo,
    });
    this.scope.hidden = this.reading.what.kind === 'score' || !this.editor.enabled;
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
    this.toast.say(text);
  }

  private showTitle() {
    const it = this.items[this.k], cur = this.current;
    if (this.reading.what.kind === 'excerpt' && cur) this.toolbar.title.textContent = `${this.reading.excerptName(this.k, cur.state.score, cur.aspects)} · ${it.title}`;
    else if (!this.reading.setlistId) this.toolbar.title.textContent = it.title;
    else showSetlistTitle(this.toolbar.title, this.k, this.items.length, it.title);
  }

  private showCard() {
    if (this.reading.setlistId) this.card.show(this.k, this.items.length, this.items[this.k].title);
  }

  /* ---------- frames ---------- */

  /**
   * The screen starting at frame f of `frames`: the frames on it (as many as f's shape decides,
   * fewer at the end), how many it wanted, and where they go, a setlist keeping room for the box
   * after a score's last frame.
   */
  private screenAt(frames: Frame[], f: number, W: number, H: number, scale: number) {
    return screenAt(frames, f, W, H, scale, !!this.reading.setlistId);
  }

  /** Where a score's last screen starts: at its last two frames when the one before last shows two. */
  private lastScreen(frames: Frame[]): number {
    const n = frames.length, W = this.stage.clientWidth, H = this.stage.clientHeight;
    return n >= 2 && framesOnScreen(frames[n - 2].aspect, W, H) === 2 ? n - 2 : n - 1;
  }

  private pageSize(page: number, w: number) { return { w, h: Math.round(w * this.aspects[page]) }; }

  /** In a setlist, what fills the rest of a score's last screen. */
  private blank(missing?: string): HTMLElement {
    return blankBox(this.items[this.k + 1]?.title, missing);
  }

  private async show() {
    const seq = ++this.seq; // a newer show() (turn, resize, edit) supersedes this one
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    if (!W || !H || this.loading) return;
    this.showTitle();
    const it = this.items[this.k];
    if (!this.current?.cache) {
      // A score that can't be opened: say so, and carry on with the next one.
      this.slots = [];
      this.shown = 1;
      const boxes = [this.blank(it.title), ...(framesOnScreen(A4, W, H) === 2 ? [this.blank()] : [])];
      placeBoxes(boxes, boxes.map(() => A4), W, H, dpr());
      this.spreadEl.replaceChildren(...boxes);
      this.setZoom(NO_ZOOM);
      this.toolbar.info.textContent = 'Missing';
      this.showCard();
      this.saveSpot(undefined);
      return;
    }
    this.frame = Math.max(0, Math.min(this.frame, this.frames.length - 1));
    const scale = dpr();
    const { on, wanted, rects } = this.screenAt(this.frames, this.frame, W, H, scale);
    this.shown = on.length;
    const widths = pageWidths(on, rects.map((r) => r.w));
    let canvases: HTMLCanvasElement[];
    try {
      canvases = await Promise.all([...widths].map(([p, w]) => this.cache.render(p + 1, w, this.pageSize(p, w).h, scale, 'now', true)));
    } catch (e) {
      if (seq === this.seq) this.toolbar.info.textContent = 'Could not draw this page';
      console.error(e);
      return;
    }
    if (seq !== this.seq) return;
    this.pages = new Map([...widths.keys()].map((p, i) => [p, canvases[i]]));

    // In a setlist each score starts on a fresh screen, so a score's last screen may have room left.
    const extra = this.reading.setlistId && on.length < wanted ? [this.blank()] : [];
    this.slots = placeSlots(on, this.frame, W, H, scale, extra);
    for (const s of this.slots) this.paint(s, this.state);
    this.spreadEl.replaceChildren(...this.slots.map((s) => s.box), ...extra);
    this.setZoom(NO_ZOOM);
    this.decorate();
    // The score's pages are its frames; in a setlist, the excerpt's own.
    const last = this.frame + on.length;
    this.toolbar.info.textContent = on.length > 1 ? `Pages ${this.frame + 1}–${last} of ${this.frames.length}` : `Page ${last} of ${this.frames.length}`;
    this.showCard();
    this.saveSpot(on[0]?.items[0]?.cut.id);
    void this.predraw(seq, widths, scale);
  }


  /**
   * In a score's own reader, remember the first cut on the screen, to come back to; an excerpt and
   * a setlist always start at their start.
   */
  private saveSpot(cut: string | undefined) {
    if (this.reading.what.kind === 'score' && cut) void saveScorePosition(this.items[this.k].scoreId, cut);
  }

  /** Draw a frame's music and ink at its current layout. */
  private paint(slot: FrameSlot, s: State, hatches?: Hatches, extra?: Marking) {
    paintSlot(slot, this.pages, this.aspects, s.ink, hatches, extra);
  }

  private paintInk(slot: FrameSlot, s: State, extra?: Marking) {
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

  /** Draw the next and previous screens' pages in the background; `widths` are the current screen's. */
  private async predraw(seq: number, widths: Map<number, number>, scale: number) {
    const W = this.stage.clientWidth, H = this.stage.clientHeight;
    const starts = [this.frame + this.shown, ...(this.frame > 0 ? [Math.max(0, this.frame - this.shown)] : [])].filter((f) => f < this.frames.length);
    // Each page at one width: the current screen's where it is on it.
    const near = new Map<number, number>();
    for (const f of starts) {
      const { on, rects } = this.screenAt(this.frames, f, W, H, scale);
      for (const [p, w] of pageWidths(on, rects.map((r) => r.w))) near.set(p, w);
    }
    for (const [p, w] of widths) near.set(p, w);
    this.cache.keepOnly([...near.keys()].map((p) => p + 1), (n) => this.pageSize(n - 1, near.get(n - 1)!));
    const cache = this.cache;
    await Promise.all([...near].map(([p, w]) => cache.render(p + 1, w, this.pageSize(p, w).h, scale, 'ahead', true).catch(() => {})));
    if (seq !== this.seq) return;
    // On a score's last screen in a setlist, draw the next score's first screen too.
    if (!this.reading.setlistId || this.frame + this.shown < this.frames.length || this.k + 1 >= this.items.length) return;
    const cur = await this.scores.ensure(this.k + 1);
    if (seq !== this.seq || !cur?.cache) return;
    const { on, rects } = this.screenAt(this.framesFor(this.k + 1), 0, W, H, scale);
    const next = cur.cache;
    await Promise.all([...pageWidths(on, rects.map((r) => r.w))].map(([p, w]) => next.render(p + 1, w, Math.round(w * cur.aspects[p]), scale, 'ahead', true).catch(() => {})));
  }


  /** Turn a screen; in a setlist, past a score's end into the next one, or back into the one before. */
  private turn(dir: 1 | -1) {
    if (this.loading) return;
    // Put the tool away so taps turn pages again. The toolbar stays until you dismiss it.
    this.tool = 'none';
    const place = { k: this.k, items: this.items.length, frame: this.frame, shown: this.shown, frames: this.frames.length };
    const t = turnFrom(place, dir, this.reading.what.kind);
    if (t.to !== 'score') this.offered = null;
    if (t.to === 'frame') {
      this.frame = t.frame;
      this.syncBar();
      void this.show();
    } else if (t.to === 'item') {
      this.syncBar();
      void this.goTo(t.k, t.at);
    } else if (t.to === 'score') {
      this.offerScore(t.dir);
    }
  }

  /**
   * Past a score's end (or before its start), in its own reader: offer the library's next score (or
   * the one before), and open it when turned that way again while the offer shows.
   */
  private offerScore(dir: 1 | -1) {
    const here = this.library.findIndex((o) => o.id === this.items[0].scoreId);
    const o = here < 0 ? undefined : this.library[here + dir];
    const { open, offered } = offerScore(this.offered, dir, o?.id, Date.now(), OFFER_MS);
    this.offered = offered;
    if (!o) this.say(dir > 0 ? 'This is the last score.' : 'This is the first score.');
    else if (!open) this.say(`Tap again for “${o.title}”`);
    else {
      this.toast.hide();
      void this.turnToScore(o, dir);
    }
  }

  /** Read score `o` instead: from its start going forward, from its last screen going back. */
  private async turnToScore(o: Original, dir: 1 | -1) {
    this.loading = true;
    this.editor.dismiss();
    this.toolbar.info.textContent = 'Opening…';
    let open: OpenScore;
    try {
      const { cache, aspects } = await openPages(o, true);
      if (this.scores.closed) { cache.destroy(); return; }
      const { state } = await loadScore(o.id, o.title, aspects);
      open = { id: o.id, original: o, aspects, state, cache };
    } catch (e) {
      // Not opened (its password not given, say): stay where you were.
      this.loading = false;
      this.syncBar();
      void this.show();
      this.say(e instanceof PasswordNotGiven ? `“${o.title}” needs its password to open.` : `Could not open “${o.title}”. It may have been moved or renamed.`);
      if (!(e instanceof PasswordNotGiven)) console.error(e);
      return;
    }
    this.scores.adopt(open);
    this.reading.turnTo({ scoreId: o.id, title: o.title, original: o });
    this.loading = false;
    await this.goTo(0, dir > 0 ? 'first' : 'last');
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
    const cur = this.current!;
    this.undos.record({ open: cur, state: cur.state, reading: this.reading.snapshot(), k: this.k, focus });
    // Every setlist's excerpts of the score, and its named excerpts, follow the edit.
    this.setState(this.reading.edited(this.k, cur.id, cur.state.score.cuts, s), focus);
  }

  /** Show the current score in state `s`, saving it; the setlists have been changed already. */
  private setState(s: State, focus?: string) {
    const cur = this.current!;
    const shown = this.frames.flatMap((f) => f.items.map((p) => p.cut));
    cur.state = s;
    this.saver.soon(cur);
    this.syncBar();
    this.frames = this.framesFor(this.k);
    const moved = !sameLayout(this.frames.flatMap((f) => f.items.map((p) => p.cut)), shown);
    const f = focus ? frameOf(this.frames, focus) : -1;
    // A cut on this screen stays put; one elsewhere opens the screen starting at its frame.
    const target = f >= 0 && (f < this.frame || f >= this.frame + this.shown) ? f : this.frame;
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
    this.current!.state = s;
    this.saver.soon(this.current);
    this.paintInk(slot, s);
  }

  /** One undo step for the whole sweep of the eraser. */
  private eraseEnded(before: State, slot: FrameSlot) {
    this.undos.record({ open: this.current!, state: before, reading: this.reading.snapshot(), k: this.k, focus: slot.frame.items[0]?.cut.id });
    this.frames = this.framesFor(this.k);
    slot.frame = this.frames[slot.index];
    this.syncBar();
  }

  private undo() {
    const e = this.undos.undo((e) => ({ ...e, state: e.open.state, reading: this.reading.snapshot() }));
    if (e) this.restore(e);
  }

  private redo() {
    const e = this.undos.redo((e) => ({ ...e, state: e.open.state, reading: this.reading.snapshot() }));
    if (e) this.restore(e);
  }

  /** Put back a score and the setlists as they were, showing the score where the edit was made. */
  private restore(e: Undo) {
    this.reading.restore(e.reading);
    if (e.k === this.k && this.current === e.open) { this.setState(e.state, e.focus); return; }
    e.open.state = e.state;
    this.saver.soon(e.open);
    void this.goTo(e.k, e.focus);
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
    this.scores.closed = true;
    closeOverlay();
    window.removeEventListener('popstate', this.onPop);
    this.input.detach();
    document.removeEventListener('visibilitychange', this.onVisible);
    this.observer.disconnect();
    this.detail.stop();
    this.seq++;
    this.editor.dismiss();
    this.card.stop();
    await this.saver.flush();
    void this.wake?.release().catch(() => {});
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    this.scores.destroy();
    this.root.remove();
    document.body.classList.remove('reading');
    this.onClose(this.fileChanges);
  }
}
