import { PEN_COLORS, type Stroke } from '../ink/model';
import { frameOf, pack, type Frame } from '../pieces/frames';
import type { Aspects, Cut, State } from '../pieces/model';
import { loadPiece, savePosition } from '../pieces/store';
import { followPiece, newEntry, spanCuts, type Entry, type Setlist, type Span } from '../setlists/model';
import { loadPosition, loadSetlists, savePosition as saveSetlistPosition } from '../setlists/store';
import { openPdf, type PageCache } from '../sources/pdf';
import { titleFromId, type Score } from '../sources/scores';
import { savePrefs, type Prefs } from '../storage/prefs';
import { chooseSetlist } from '../ui/add-to';
import { el } from '../ui/dom';
import { closeOverlay, showMenu, Toast } from '../ui/overlay';
import { CutEditor } from './cuts/editor';
import { Detail } from './detail';
import { Docs, type Doc, type Item } from './docs';
import { openExcerptPicker } from './excerpt-picker';
import type { Hatches } from './frames';
import type { Gesture } from './gestures';
import { History } from './history';
import { Input } from './input';
import { pagesPerScreen } from './layout';
import { Saver } from './saver';
import { frameSize, paintSlot, paintSlotInk, placeBoxes, placeSlots, type FrameSlot } from './spread';
import { nextLayout, Toolbar, type Tool } from './toolbar';
import { isZoomed, NO_ZOOM, type Zoom } from './zoom';

/**
 * Undo keeps whole states: each entry is a piece's state before an edit, the setlists (whose
 * excerpts follow the edit), the item it was made in, and the cut to show.
 */
interface Undo { doc: Doc; state: State; setlists: readonly Setlist[]; k: number; focus?: string }

export type Source =
  | { kind: 'piece'; score: Score }
  | { kind: 'setlist'; setlistId: string; scores: readonly Score[]; startEntry?: string; chooseExcerpt?: boolean };

const PIECE_CARD_MS = 2200;
/** Frames take the first page's shape; a piece that can't be opened is shown this shape. */
const A4 = 297 / 210;

const dpr = () => window.devicePixelRatio || 1;

/** Whether two played orders put the same music in the same places. */
const sameLayout = (a: readonly Cut[], b: readonly Cut[]) =>
  a.length === b.length && a.every((c, i) => c.id === b[i].id && c.page === b[i].page && c.y0 === b[i].y0 && c.y1 === b[i].y1 && c.pad === b[i].pad);

const playedCuts = (it: Item, doc: Doc, entry: Entry | undefined) => (it.entryId && entry ? spanCuts(doc.state.piece.cuts, entry) : doc.state.piece.cuts);

/** Open a piece, or a setlist as one continuous score. A piece that can't be opened throws; a setlist carries on past it. */
export async function openReader(source: Source, prefs: Prefs, onClose: () => void): Promise<void> {
  const setlists = await loadSetlists();
  if (source.kind === 'piece') {
    const { score } = source;
    const cache = await openPdf(await score.getFile());
    const aspects = await cache.allAspects();
    const { state, position } = await loadPiece(score.id, score.title, aspects);
    const doc: Doc = { id: score.id, score, aspects, state, cache };
    new Reader([{ pieceId: score.id, title: score.title, score }], null, setlists, doc, 0, position, false, prefs, onClose);
    return;
  }
  const setlist = setlists.find((s) => s.id === source.setlistId);
  if (!setlist?.entries.length) throw new Error('No such setlist, or no pieces in it');
  const scores = new Map(source.scores.map((s) => [s.id, s]));
  const items: Item[] = setlist.entries.map((e) => {
    const score = scores.get(e.pieceId);
    return { pieceId: e.pieceId, entryId: e.id, score, title: score?.title ?? titleFromId(e.pieceId), missing: !score };
  });
  const pos = source.startEntry ? { entry: source.startEntry } : await loadPosition(setlist.id);
  const k = Math.max(0, items.findIndex((it) => it.entryId === pos?.entry));
  new Reader(items, setlist.id, setlists, null, k, pos?.cut, !!source.chooseExcerpt, prefs, onClose);
}

/**
 * The score screen, for a piece or a setlist. It holds the pieces being read and the frames on
 * the screen, and joins up the toolbar, pointer input, the cut editor and the zoomed close-up.
 */
class Reader {
  private root = el('div', 'viewer');
  private stage = el('div', 'stage');
  private spreadEl = el('div', 'spread');
  private scope = el('p', 'scope', 'Cuts changed here change the piece, in every setlist');
  private toast = new Toast();
  private toolbar: Toolbar;

  private perScreen: 1 | 2 = 1;
  /** The item being read. */
  private k = 0;
  /** The first frame on the screen, among the current item's. */
  private frame = 0;
  /** The current item's frames. */
  private frames: Frame[] = [];
  private docs: Docs;
  private goSeq = 0;
  private loading = false;
  /** The item shown last, to name the piece when the reader turns into another one. */
  private shownItem = -1;
  private card: HTMLElement | null = null;
  private cardTimer: ReturnType<typeof setTimeout> | undefined;
  private seq = 0;
  private slots: FrameSlot[] = [];
  /** Page canvases drawn at the frame's width, by 0-based page, for the frames on screen. */
  private pages = new Map<number, HTMLCanvasElement>();

  private zoom: Zoom = NO_ZOOM;
  private detail: Detail;

  private tool: Tool = 'none';
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
    /** The setlist being read, or null for a piece on its own. */
    private setlistId: string | null,
    private setlists: readonly Setlist[],
    doc: Doc | null,
    k: number,
    position: string | undefined,
    chooseExcerpt: boolean,
    private prefs: Prefs,
    private onClose: () => void,
  ) {
    this.docs = new Docs(items, doc);
    this.saver = new Saver(() => this.setlists, setlists);
    const reader = this;
    this.editor = new CutEditor({
      root: this.root,
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
      pieces: () => this.piecesMenu(),
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
    document.body.classList.add('viewing');

    this.input = new Input({
      stage: this.stage,
      get aspects() { return reader.aspects; },
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
    void this.goTo(k, position).then(() => { if (chooseExcerpt) this.chooseExcerpt(); });
    this.observer.observe(this.stage);
  }

  /* ---------- the pieces read ---------- */

  private get setlist() { return this.setlists.find((s) => s.id === this.setlistId); }
  private entry(k = this.k): Entry | undefined {
    const id = this.items[k]?.entryId;
    return id ? this.setlist?.entries.find((e) => e.id === id) : undefined;
  }
  /** The current item's piece, once open; undefined while it opens or when it can't be. */
  private get doc(): Doc | undefined { return this.docs.get(this.items[this.k].pieceId); }
  private get state(): State { return this.doc!.state; }
  private get aspects(): Aspects { return this.doc!.aspects; }
  private get cache(): PageCache { return this.doc!.cache!; }

  private framesFor(k: number): Frame[] {
    const doc = this.docs.get(this.items[k].pieceId);
    return doc ? pack(playedCuts(this.items[k], doc, this.entry(k)), doc.aspects) : [];
  }

  /** Go to item k: its first or last screen, or the screen holding a cut. */
  private async goTo(k: number, at?: string | 'first' | 'last') {
    const seq = ++this.goSeq;
    this.loading = true;
    if (k !== this.k) { this.editor.dismiss(); this.toolbar.info.textContent = 'Opening…'; }
    await this.docs.ensure(k);
    if (seq !== this.goSeq || this.docs.closed) return;
    this.loading = false;
    this.k = k;
    this.frames = this.framesFor(k);
    const f = at === 'last' ? this.frames.length - 1 : at && at !== 'first' ? frameOf(this.frames, at) : 0;
    this.frame = Math.max(0, f);
    this.syncBar();
    await this.show();
    this.docs.keepNear(this.k);
  }

  /* ---------- toolbar ---------- */

  /** Tapping the active tool again puts it away. */
  private setTool(t: Tool) {
    this.tool = this.tool === t ? 'none' : t;
    this.syncBar();
  }

  private syncBar() {
    const doc = this.doc;
    this.toolbar.sync({
      open: !!doc,
      tool: this.tool,
      penColor: this.penColor,
      editing: this.editor.enabled,
      archived: doc?.state.piece.archived.length ?? 0,
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

  /** "2/3 Gymnopédie No. 1" in a setlist. */
  private showTitle() {
    const it = this.items[this.k];
    if (!this.setlistId) { this.toolbar.title.textContent = it.title; return; }
    this.toolbar.title.replaceChildren(el('b', '', `${this.k + 1}/${this.items.length} `), it.title);
  }

  /** Names the piece for a moment when the reader turns into it. */
  private showCard() {
    if (!this.setlistId || this.shownItem === this.k) return;
    this.shownItem = this.k;
    this.card?.remove();
    clearTimeout(this.cardTimer);
    const card = el('p', 'piece-card');
    card.append(el('b', '', `${this.k + 1} OF ${this.items.length}`), this.items[this.k].title);
    this.root.append(card);
    this.card = card;
    this.cardTimer = setTimeout(() => card.classList.add('gone'), PIECE_CARD_MS);
  }

  /* ---------- toolbar menus ---------- */

  private piecesMenu() {
    showMenu(this.toolbar.anchor('pieces'), this.setlist?.title ?? 'Pieces', this.items.map((it, k) => ({
      label: `${k + 1}. ${it.title}`,
      checked: k === this.k,
      run: () => void this.goTo(k, 'first'),
    })));
  }

  /** In a piece's own reader: add the piece, whole, to the end of a setlist. */
  private addToSetlist() {
    const it = this.items[0];
    chooseSetlist(this.toolbar.anchor('addTo'), `Add “${it.title}” to`, this.setlists, (s, isNew) => {
      const added = { ...s, entries: [...s.entries, newEntry(it.pieceId)] };
      this.setlists = isNew ? [added, ...this.setlists] : this.setlists.map((x) => (x.id === s.id ? added : x));
      this.saver.soon();
      this.say(`Added to the end of “${s.title}”.`);
    }, it.pieceId);
  }

  /** In a setlist: choose which of the piece's cuts it plays. */
  private chooseExcerpt() {
    const doc = this.doc, entry = this.entry(), setlist = this.setlist;
    if (!doc?.cache || !entry || !setlist) return;
    this.editor.dismiss();
    const cache = doc.cache;
    openExcerptPicker({
      question: `Which excerpt of “${this.items[this.k].title}” does “${setlist.title}” play?`,
      state: doc.state,
      aspects: doc.aspects,
      span: entry,
      page: (p, w) => cache.render(p + 1, w, Math.round(w * doc.aspects[p]), dpr()),
      done: (span) => this.setExcerpt(entry.id, span),
    });
  }

  private setExcerpt(entryId: string, span: Span) {
    this.setlists = this.setlists.map((s) => (s.id !== this.setlistId ? s : {
      ...s,
      entries: s.entries.map((e) => (e.id === entryId ? { id: e.id, pieceId: e.pieceId, ...span } : e)),
    }));
    this.saver.soon();
    this.frames = this.framesFor(this.k);
    this.frame = 0;
    void this.show();
  }

  /* ---------- frames ---------- */

  /** The first frame of the screen that holds frame `f`. */
  private screenOf(f: number) { return Math.floor(f / this.perScreen) * this.perScreen; }

  private pageSize(page: number, w: number) { return { w, h: Math.round(w * this.aspects[page]) }; }

  /** In a setlist, what fills the rest of a piece's last screen: the next piece's title, or the end. */
  private blank(missing?: string): HTMLElement {
    const box = el('div', 'page blank');
    const next = this.items[this.k + 1];
    if (missing) box.append(el('span', 'label', 'Can’t find'), el('span', 't', `“${missing}”`));
    else if (next) box.append(el('span', 'label', 'Next'), el('span', 't', next.title));
    else box.append(el('span', 'label', 'End of the setlist'));
    return box;
  }

  private async show() {
    const seq = ++this.seq; // a newer show() (turn, resize, edit) supersedes this one
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    if (!W || !H || this.loading) return;
    this.perScreen = pagesPerScreen(this.prefs.pagesPerScreen, W, H);
    this.showTitle();
    const it = this.items[this.k];
    if (!this.doc?.cache) {
      // A piece that can't be opened: say so, and carry on with the next one.
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

    // In a setlist each piece starts on a fresh screen, so a piece's last screen may have room left.
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
    else if (cut) void savePosition(it.pieceId, cut);
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
    // On a piece's last screen in a setlist, draw the next piece's first screen too.
    if (!this.setlistId || this.frame + this.perScreen < this.frames.length || this.k + 1 >= this.items.length) return;
    const doc = await this.docs.ensure(this.k + 1);
    const first = this.framesFor(this.k + 1).slice(0, this.perScreen);
    if (seq !== this.seq || !doc?.cache) return;
    const nw = frameSize(this.stage.clientWidth, this.stage.clientHeight, this.perScreen, doc.aspects).w;
    for (const p of new Set(first.flatMap((f) => f.items.map((x) => x.cut.page)))) {
      if (seq !== this.seq || !doc.cache) return;
      await doc.cache.render(p + 1, nw, Math.round(nw * doc.aspects[p]), scale).catch(() => {});
    }
  }

  /** Turn a screen; in a setlist, past a piece's end into the next one, or back into the one before. */
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
    const doc = this.doc!, entry = this.entry();
    this.undos.record({ doc, state: doc.state, setlists: this.setlists, k: this.k, focus });
    // Every setlist's excerpts of the piece follow the edit. Pages inserted at the edges of the
    // excerpt being read join it.
    const grow = this.setlistId && entry ? { setlist: this.setlistId, entries: new Set([entry.id]) } : undefined;
    this.setState(s, followPiece(this.setlists, doc.id, doc.state.piece.cuts, s.piece.cuts, grow), focus);
  }

  private setState(s: State, setlists: readonly Setlist[], focus?: string) {
    const doc = this.doc!;
    const shown = this.frames.flatMap((f) => f.items.map((p) => p.cut));
    doc.state = s;
    this.setlists = setlists;
    this.saver.soon(doc);
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
    this.doc!.state = s;
    this.saver.soon(this.doc);
    this.paintInk(slot, s);
  }

  /** One undo step for the whole sweep of the eraser. */
  private eraseEnded(before: State, slot: FrameSlot) {
    this.undos.record({ doc: this.doc!, state: before, setlists: this.setlists, k: this.k, focus: slot.frame.items[0]?.cut.id });
    this.frames = this.framesFor(this.k);
    slot.frame = this.frames[slot.index];
    this.syncBar();
  }

  private undo() {
    const e = this.undos.undo((e) => ({ ...e, state: e.doc.state, setlists: this.setlists }));
    if (e) this.restore(e);
  }

  private redo() {
    const e = this.undos.redo((e) => ({ ...e, state: e.doc.state, setlists: this.setlists }));
    if (e) this.restore(e);
  }

  /** Put back a piece and the setlists as they were, showing the piece where the edit was made. */
  private restore(e: Undo) {
    if (e.k === this.k && this.doc === e.doc) { this.setState(e.state, e.setlists, e.focus); return; }
    e.doc.state = e.state;
    this.setlists = e.setlists;
    this.saver.soon(e.doc);
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
    this.docs.closed = true;
    closeOverlay();
    window.removeEventListener('popstate', this.onPop);
    this.input.detach();
    document.removeEventListener('visibilitychange', this.onVisible);
    this.observer.disconnect();
    this.detail.stop();
    this.seq++;
    this.editor.dismiss();
    clearTimeout(this.cardTimer);
    await this.saver.flush();
    void this.wake?.release().catch(() => {});
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    this.docs.destroy();
    this.root.remove();
    document.body.classList.remove('viewing');
    this.onClose();
  }
}
