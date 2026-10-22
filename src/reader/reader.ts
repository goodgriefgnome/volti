// The centre of the score screen: the scores being read and the frames on the screen, turning pages
// and scores, taking edits (commit, undo, redo), and opening and closing. It joins the other reader
// files together; code that can stand on its own goes in one of them.

import type { Marking } from '../markings/model';
import { PEN_COLORS } from '../markings/stroke';
import { frameOf, pack, type Frame } from '../scores/frames';
import type { Aspects, Cut, State } from '../scores/model';
import { loadScore, savePosition } from '../scores/store';
import { followScore, newEntry, spanCuts, spanLabel, type Entry, type Setlist, type Span } from '../setlists/model';
import { loadPosition, loadSetlists, savePosition as saveSetlistPosition } from '../setlists/store';
import { openPdf, type PageCache } from '../originals/pdf';
import { titleFromId, type Original } from '../originals/originals';
import { savePrefs, type Prefs } from '../storage/prefs';
import { el } from '../ui/dom';
import { openExcerptPicker } from '../ui/excerpt-picker';
import { closeOverlay, showMenu } from '../ui/overlay';
import { chooseSetlist } from '../ui/setlists';
import { Toast } from '../ui/toast';
import { CutEditor } from './cuts/editor';
import { Detail } from './detail';
import { OpenScores, type Item, type OpenScore } from './open-scores';
import type { Hatches } from './frames';
import type { Gesture } from './gestures';
import { History } from './history';
import { Input } from './input';
import { pagesPerScreen } from './layout';
import { Saver } from './saver';
import { blankBox, ScoreCard, showSetlistTitle } from './setlist';
import { frameSize, paintSlot, paintSlotInk, placeBoxes, placeSlots, type FrameSlot } from './spread';
import { nextLayout, Toolbar, type ToolChoice } from './toolbar';
import type { ToolName } from './tools/tool';
import { isZoomed, NO_ZOOM, type Zoom } from './zoom';

/**
 * Undo keeps whole states: each entry is a score's state before an edit, the setlists (whose
 * excerpts follow the edit), the item it was made in, and the cut to show.
 */
interface Undo { open: OpenScore; state: State; setlists: readonly Setlist[]; k: number; focus?: string }

/** What the reader opens: a score on its own, or a setlist. */
export type ToRead =
  | { kind: 'score'; original: Original }
  | { kind: 'setlist'; setlistId: string; originals: readonly Original[]; startEntry?: string };

/** Frames take the first page's shape; a score that can't be opened is shown this shape. */
const A4 = 297 / 210;

const dpr = () => window.devicePixelRatio || 1;

/** Whether two played orders put the same music in the same places. */
const sameLayout = (a: readonly Cut[], b: readonly Cut[]) =>
  a.length === b.length && a.every((c, i) => c.id === b[i].id && c.page === b[i].page && c.y0 === b[i].y0 && c.y1 === b[i].y1 && c.pad === b[i].pad);

const playedCuts = (it: Item, cur: OpenScore, entry: Entry | undefined) => (it.entryId && entry ? spanCuts(cur.state.score.cuts, entry) : cur.state.score.cuts);

/** Open a score, or a setlist as one continuous score. A score that can't be opened throws; a setlist carries on past it. */
export async function openReader(what: ToRead, prefs: Prefs, onClose: () => void): Promise<void> {
  const setlists = await loadSetlists();
  if (what.kind === 'score') {
    const { original } = what;
    const cache = await openPdf(await original.getFile());
    const aspects = await cache.allAspects();
    const { state, position } = await loadScore(original.id, original.title, aspects);
    const first: OpenScore = { id: original.id, original, aspects, state, cache };
    new Reader([{ scoreId: original.id, title: original.title, original }], null, setlists, first, 0, position, prefs, onClose);
    return;
  }
  const setlist = setlists.find((s) => s.id === what.setlistId);
  if (!setlist?.entries.length) throw new Error('No such setlist, or no scores in it');
  const originals = new Map(what.originals.map((o) => [o.id, o]));
  const items: Item[] = setlist.entries.map((e) => {
    const original = originals.get(e.scoreId);
    return { scoreId: e.scoreId, entryId: e.id, original, title: original?.title ?? titleFromId(e.scoreId), missing: !original };
  });
  const pos = what.startEntry ? { entry: what.startEntry } : await loadPosition(setlist.id);
  const k = Math.max(0, items.findIndex((it) => it.entryId === pos?.entry));
  new Reader(items, setlist.id, setlists, null, k, pos?.cut, prefs, onClose);
}

/**
 * The score screen, for a score or a setlist. It holds the scores being read and the frames on
 * the screen, and joins up the toolbar, pointer input, the cut editor and the zoomed close-up.
 */
class Reader {
  private root = el('div', 'reader');
  private stage = el('div', 'stage');
  private spreadEl = el('div', 'spread');
  private scope = el('p', 'scope', 'Cuts changed here change the score, in every setlist');
  private toast = new Toast();
  private toolbar: Toolbar;

  private perScreen: 1 | 2 = 1;
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

  constructor(
    private items: Item[],
    /** The setlist being read, or null for a score on its own. */
    private setlistId: string | null,
    private setlists: readonly Setlist[],
    first: OpenScore | null,
    k: number,
    position: string | undefined,
    private prefs: Prefs,
    private onClose: () => void,
  ) {
    this.scores = new OpenScores(items, first);
    this.saver = new Saver(() => this.setlists, setlists);
    const reader = this;
    this.editor = new CutEditor({
      stage: this.stage,
      get aspects() { return reader.aspects; },
      state: () => this.state,
      frames: () => this.frames,
      slots: () => this.slots,
      commit: (s, focus) => this.commit(s, focus),
      preview: (s, frames, hatches) => this.preview(s, frames, hatches),
      thumb: (page, w) => this.cache.render(page + 1, w, Math.round(w * this.aspects[page]), dpr()),
      inking: () => this.tool !== 'none',
      cancelGesture: () => this.input.cancelGesture(),
      say: (t) => this.say(t),
      changed: () => this.syncBar(),
    });
    this.detail = new Detail({
      stage: this.stage,
      get cache() { return reader.cache; },
      get aspects() { return reader.aspects; },
      slots: () => this.slots,
      zoom: () => this.zoom,
      ink: () => this.state.ink,
    });
    this.toolbar = new Toolbar(!!setlistId, {
      close: () => history.back(),
      scores: () => this.scoresMenu(),
      excerpt: () => this.chooseExcerpt(),
      addToSetlist: () => this.addToSetlist(),
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
    this.scope.hidden = true;
    this.root.append(this.stage, this.toolbar.el, this.scope, this.toast.el);
    document.body.append(this.root);
    document.body.classList.add('reading');

    this.input = new Input({
      stage: this.stage,
      get aspects() { return reader.aspects; },
      editor: this.editor,
      slots: () => this.slots,
      state: () => this.state,
      tool: () => this.tool,
      penColor: () => this.penColor,
      zoom: () => this.zoom,
      scale: () => this.zoom.s,
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

  private get setlist() { return this.setlists.find((s) => s.id === this.setlistId); }
  private entry(k = this.k): Entry | undefined {
    const id = this.items[k]?.entryId;
    return id ? this.setlist?.entries.find((e) => e.id === id) : undefined;
  }
  /** The current item's score, once open; undefined while it opens or when it can't be. */
  private get current(): OpenScore | undefined { return this.scores.get(this.items[this.k].scoreId); }
  private get state(): State { return this.current!.state; }
  private get aspects(): Aspects { return this.current!.aspects; }
  private get cache(): PageCache { return this.current!.cache!; }

  private framesFor(k: number): Frame[] {
    const cur = this.scores.get(this.items[k].scoreId);
    return cur ? pack(playedCuts(this.items[k], cur, this.entry(k)), cur.aspects) : [];
  }

  /** Go to item k: its first or last screen, or the screen holding a cut. */
  private async goTo(k: number, at?: string | 'first' | 'last') {
    const seq = ++this.goSeq;
    this.loading = true;
    if (k !== this.k) { this.editor.dismiss(); this.toolbar.info.textContent = 'Opening…'; }
    await this.scores.ensure(k);
    if (seq !== this.goSeq || this.scores.closed) return;
    this.loading = false;
    this.k = k;
    this.frames = this.framesFor(k);
    const f = at === 'last' ? this.frames.length - 1 : at && at !== 'first' ? frameOf(this.frames, at) : 0;
    this.frame = Math.max(0, f);
    this.syncBar();
    await this.show();
    this.scores.keepNear(this.k);
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
      layout: this.prefs.pagesPerScreen,
      zoomed: isZoomed(this.zoom),
      canUndo: this.undos.canUndo,
      canRedo: this.undos.canRedo,
    });
    this.scope.hidden = !this.setlistId || !this.editor.enabled;
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
    const it = this.items[this.k];
    if (!this.setlistId) this.toolbar.title.textContent = it.title;
    else showSetlistTitle(this.toolbar.title, this.k, this.items.length, it.title);
  }

  private showCard() {
    if (this.setlistId) this.card.show(this.k, this.items.length, this.items[this.k].title);
  }

  /* ---------- toolbar menus ---------- */

  private scoresMenu() {
    showMenu(this.toolbar.anchor('scores'), this.setlist?.title ?? 'Scores', this.items.map((it, k) => ({
      label: `${k + 1}. ${it.title}${this.excerptLabel(k)}`,
      checked: k === this.k,
      run: () => void this.goTo(k, 'first'),
    })));
  }

  /** " · Pages 2–3" for an entry that plays an excerpt of a score that is open; otherwise nothing. */
  private excerptLabel(k: number): string {
    const cur = this.scores.get(this.items[k].scoreId), entry = this.entry(k);
    const label = cur && entry ? spanLabel(cur.state.score.cuts, entry) : null;
    return label ? ` · ${label}` : '';
  }

  /** In a score's own reader: add the score, whole, to the end of a setlist. */
  private addToSetlist() {
    const it = this.items[0];
    chooseSetlist(this.toolbar.anchor('addTo'), `Add “${it.title}” to`, this.setlists, (s, isNew) => {
      const added = { ...s, entries: [...s.entries, newEntry(it.scoreId)] };
      this.setlists = isNew ? [added, ...this.setlists] : this.setlists.map((x) => (x.id === s.id ? added : x));
      this.saver.soon();
      this.say(`Added to the end of “${s.title}”.`);
    }, it.scoreId);
  }

  /** In a setlist: choose which of the score's cuts it plays. */
  private chooseExcerpt() {
    const cur = this.current, entry = this.entry(), setlist = this.setlist;
    if (!cur?.cache || !entry || !setlist) return;
    this.editor.dismiss();
    const cache = cur.cache;
    openExcerptPicker({
      question: `Which part of “${this.items[this.k].title}” does entry ${this.k + 1} play?`,
      verb: 'This entry plays',
      state: cur.state,
      aspects: cur.aspects,
      span: entry,
      page: (p, w) => cache.render(p + 1, w, Math.round(w * cur.aspects[p]), dpr()),
      done: (span) => this.setExcerpt(entry.id, span),
    });
  }

  private setExcerpt(entryId: string, span: Span) {
    this.setlists = this.setlists.map((s) => (s.id !== this.setlistId ? s : {
      ...s,
      entries: s.entries.map((e) => (e.id === entryId ? { id: e.id, scoreId: e.scoreId, ...span } : e)),
    }));
    // The score too: one opened for the first time isn't saved yet, and the span names its cuts.
    this.saver.soon(this.current);
    this.frames = this.framesFor(this.k);
    this.frame = 0;
    void this.show();
  }

  /* ---------- frames ---------- */

  /** The first frame of the screen that holds frame `f`. */
  private screenOf(f: number) { return Math.floor(f / this.perScreen) * this.perScreen; }

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
    this.perScreen = pagesPerScreen(this.prefs.pagesPerScreen, W, H);
    this.showTitle();
    const it = this.items[this.k];
    if (!this.current?.cache) {
      // A score that can't be opened: say so, and carry on with the next one.
      this.slots = [];
      const boxes = [this.blank(it.title), ...(this.perScreen === 2 ? [this.blank()] : [])];
      placeBoxes(boxes, frameSize(W, H, this.perScreen, [A4]), W, H, dpr());
      this.spreadEl.replaceChildren(...boxes);
      this.setZoom(NO_ZOOM);
      this.toolbar.info.textContent = 'Missing';
      this.showCard();
      this.saveSpot(undefined);
      return;
    }
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

    // In a setlist each score starts on a fresh screen, so a score's last screen may have room left.
    const extra = this.setlistId && on.length < this.perScreen ? [this.blank()] : [];
    this.slots = placeSlots(on, this.frame, W, H, size, scale, extra);
    for (const s of this.slots) this.paint(s, this.state);
    this.spreadEl.replaceChildren(...this.slots.map((s) => s.box), ...extra);
    this.setZoom(NO_ZOOM);
    this.decorate();
    if (this.setlistId) {
      const screens = Math.ceil(this.frames.length / this.perScreen);
      this.toolbar.info.textContent = `${this.frame / this.perScreen + 1} of ${screens}`;
    } else {
      const last = this.frame + on.length;
      this.toolbar.info.textContent = on.length > 1 ? `${this.frame + 1}–${last} of ${this.frames.length}` : `${last} of ${this.frames.length}`;
    }
    this.showCard();
    this.saveSpot(on[0]?.items[0]?.cut.id);
    void this.predraw(seq, size.w, scale);
  }

  /** Remember the first cut on the screen, to come back to. */
  private saveSpot(cut: string | undefined) {
    const it = this.items[this.k];
    if (this.setlistId && it.entryId) void saveSetlistPosition(this.setlistId, { entry: it.entryId, cut });
    else if (cut) void savePosition(it.scoreId, cut);
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
    // On a score's last screen in a setlist, draw the next score's first screen too.
    if (!this.setlistId || this.frame + this.perScreen < this.frames.length || this.k + 1 >= this.items.length) return;
    const cur = await this.scores.ensure(this.k + 1);
    const first = this.framesFor(this.k + 1).slice(0, this.perScreen);
    if (seq !== this.seq || !cur?.cache) return;
    const nw = frameSize(this.stage.clientWidth, this.stage.clientHeight, this.perScreen, cur.aspects).w;
    for (const p of new Set(first.flatMap((f) => f.items.map((x) => x.cut.page)))) {
      if (seq !== this.seq || !cur.cache) return;
      await cur.cache.render(p + 1, nw, Math.round(nw * cur.aspects[p]), scale).catch(() => {});
    }
  }

  /** Turn a screen; in a setlist, past a score's end into the next one, or back into the one before. */
  private turn(dir: 1 | -1) {
    if (this.loading) return;
    const next = this.frame + dir * this.perScreen;
    // Put the tool away so taps turn pages again. The toolbar stays until you dismiss it.
    this.tool = 'none';
    if (next >= 0 && next < this.frames.length) {
      this.frame = next;
      this.syncBar();
      void this.show();
      return;
    }
    const k = this.k + dir;
    if (k < 0 || k >= this.items.length) return;
    this.syncBar();
    void this.goTo(k, dir > 0 ? 'first' : 'last');
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
    const cur = this.current!, entry = this.entry();
    this.undos.record({ open: cur, state: cur.state, setlists: this.setlists, k: this.k, focus });
    // Every setlist's excerpts of the score follow the edit. Pages inserted at the edges of the
    // excerpt being read join it.
    const grow = this.setlistId && entry ? { setlist: this.setlistId, entries: new Set([entry.id]) } : undefined;
    this.setState(s, followScore(this.setlists, cur.id, cur.state.score.cuts, s.score.cuts, grow), focus);
  }

  private setState(s: State, setlists: readonly Setlist[], focus?: string) {
    const cur = this.current!;
    const shown = this.frames.flatMap((f) => f.items.map((p) => p.cut));
    cur.state = s;
    this.setlists = setlists;
    this.saver.soon(cur);
    this.syncBar();
    this.frames = this.framesFor(this.k);
    const moved = !sameLayout(this.frames.flatMap((f) => f.items.map((p) => p.cut)), shown);
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
    this.current!.state = s;
    this.saver.soon(this.current);
    this.paintInk(slot, s);
  }

  /** One undo step for the whole sweep of the eraser. */
  private eraseEnded(before: State, slot: FrameSlot) {
    this.undos.record({ open: this.current!, state: before, setlists: this.setlists, k: this.k, focus: slot.frame.items[0]?.cut.id });
    this.frames = this.framesFor(this.k);
    slot.frame = this.frames[slot.index];
    this.syncBar();
  }

  private undo() {
    const e = this.undos.undo((e) => ({ ...e, state: e.open.state, setlists: this.setlists }));
    if (e) this.restore(e);
  }

  private redo() {
    const e = this.undos.redo((e) => ({ ...e, state: e.open.state, setlists: this.setlists }));
    if (e) this.restore(e);
  }

  /** Put back a score and the setlists as they were, showing the score where the edit was made. */
  private restore(e: Undo) {
    if (e.k === this.k && this.current === e.open) { this.setState(e.state, e.setlists, e.focus); return; }
    e.open.state = e.state;
    this.setlists = e.setlists;
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
    this.onClose();
  }
}
