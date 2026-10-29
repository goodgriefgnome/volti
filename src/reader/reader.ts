// The centre of the score screen: the frames on the screen, turning pages and scores, taking edits
// (commit, undo, redo), and opening and closing. It joins the other reader files together: what is
// read, and how edits carry to setlists, is _reading.ts; the toolbar's menus and dialogs are
// _toolbar-menus.ts. Code that can stand on its own goes in one of them.

import type { FileChange } from '../dialogs/score-files';
import { ends } from '../scores/excerpts';
import { PEN_COLORS } from '../markings/stroke';
import { type Marking } from '../markings/model';
import { knownTitles } from '../originals/library-files';
import { NoAccess, PasswordNotGiven, type SourceFile } from '../originals/types';
import { canvasesOf } from '../page-cache/cache';
import { NotSaved, type Drawn } from '../page-cache/types';
import { titleOf } from '../originals/path-utils';
import { framesOnScreen } from '../render/layout';
import { isZoomed, NO_ZOOM, type Zoom } from '../render/zoom';
import { pageWidths, screenAt } from '../render/screen';
import { type Hatches } from '../render/paint';
import { A4, type Aspects, type Cut, type NamedExcerpt, type State } from '../scores/model';
import { frameOf, pack, type Frame } from '../scores/frames';
import { loadScore } from '../scores/store';
import { loadSetlists } from '../setlists/store';
import { type Setlist } from '../setlists/model';
import { closeOverlay } from '../ui/overlay';
import { dpr, el } from '../ui/dom';
import { Toast } from '../ui/toast';
import { CutEditor } from './cuts/_editor';
import { Detail } from './_detail';
import type { Gesture } from './_gestures';
import { History } from './_history';
import { Input } from './_input';
import { OpenScores, openPages, type DrawPage, type DrawProgressive, type Item, type OpenScore } from './_open-scores';
import { Reading, setlistItems, type ReadingKind, type ReadingSnapshot } from './_reading';
import { Saver } from './_saver';
import { blankBox, ScoreCard, showSetlistTitle, type Unread } from './_setlist';
import { paintSlot, paintSlotInk, placeBoxes, placeSlots, type FrameSlot } from './_spread';
import { backIcon, Toolbar, turnIcon, type ToolChoice } from './_toolbar';
import { ReaderMenus } from './_toolbar-menus';
import { offerScore, turnFrom, type Offer } from './_turning';
import type { ToolName } from './tools/_tools';
import { resumeAt } from './_last-read';
import { loadLastRead, saveLastRead } from './_store';
import type { ReaderView } from './_view';

/**
 * Undo keeps whole states: each entry is a score's state before an edit, what was read with the
 * setlists (whose excerpts follow the edit), the item it was made in, and the cut to show.
 */
interface Undo { open: OpenScore; state: State; reading: ReadingSnapshot; k: number; focus?: string }

/** What the reader opens: a score on its own, a named excerpt of one, or a setlist. */
export type ToRead =
  /** A score, with the library's scores in its order, to turn to past this one's ends. */
  | { kind: 'score'; original: SourceFile; library: readonly SourceFile[] }
  | { kind: 'excerpt'; original: SourceFile; excerpt: NamedExcerpt }
  | { kind: 'setlist'; setlistId: string; originals: readonly SourceFile[]; startEntry?: string };

/** How long the next score is offered after turning past a score's end: as long as the toast saying so shows. */
const OFFER_MS = 3500;

/** Whether two played orders put the same music in the same places. */
const sameLayout = (a: readonly Cut[], b: readonly Cut[]) =>
  a.length === b.length && a.every((c, i) => c.id === b[i].id && c.page === b[i].page && c.y0 === b[i].y0 && c.y1 === b[i].y1 && c.pad === b[i].pad);


/** Open a score, or a setlist as one continuous score. A score that can't be opened throws; a setlist carries on past it. */
export async function openReader(what: ToRead, onClose: (fileChanges: FileChange[]) => void, fullscreen?: Promise<void>): Promise<void> {
  const setlists = await loadSetlists();
  if (what.kind !== 'setlist') {
    const { original } = what;
    const { draw, drawProgressive, aspects, readable, close } = await openPages(original.id, original, true);
    try {
      const { state } = await loadScore(original.id, aspects);
      const first: OpenScore = { id: original.id, original, aspects, state, draw, drawProgressive, readable, close };
      const item = { scoreId: original.id, title: titleOf(original.path), original };
      // Where it was last read, if that was this score or this excerpt of it.
      const last = await loadLastRead();
      if (what.kind === 'excerpt') {
        const excerpt = ends(what.excerpt);
        new Reader([item], { kind: 'excerpt', excerpt }, setlists, first, 0, resumeAt(last, { kind: 'excerpt', id: original.id, ...excerpt })?.cut, onClose, [], fullscreen);
      } else new Reader([item], { kind: 'score' }, setlists, first, 0, resumeAt(last, { kind: 'excerpt', id: original.id })?.cut, onClose, what.library, fullscreen);
    } catch (e) {
      close?.();
      throw e;
    }
    return;
  }
  const setlist = setlists.find((s) => s.id === what.setlistId);
  if (!setlist?.entries.length) throw new Error('No such setlist, or no scores in it');
  const items = setlistItems(setlist, new Map(what.originals.map((o) => [o.id, o])), await knownTitles());
  // From the entry tapped, else where it was last read; else from its first entry.
  let k = 0, position: string | undefined;
  if (what.startEntry) k = Math.max(0, items.findIndex((it) => it.entryId === what.startEntry));
  else {
    const at = resumeAt(await loadLastRead(), { kind: 'setlist', id: setlist.id });
    const found = at ? items.findIndex((it) => it.entryId === at.entry) : -1;
    if (found >= 0) { k = found; position = at!.cut; }
  }
  new Reader(items, { kind: 'setlist', id: setlist.id }, setlists, null, k, position, onClose, what.originals, fullscreen);
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
  /** Aborted when the screen changes: the pages drawn ahead for it are no longer wanted. */
  private ahead = new AbortController();
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
  /** The toast asking for access to the scores folder shows, until a page is drawn. */
  private askingAccess = false;
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
    private library: readonly SourceFile[] = [],
    /** Full screen already asked for at the tap, if it was; the first screen is drawn once it settles. */
    fullscreen?: Promise<void>,
  ) {
    this.reading = new Reading(items, what, setlists);
    this.scores = new OpenScores(items, first);
    this.saver = new Saver(() => this.reading.setlists, setlists);
    const view: ReaderView = {
      stage: this.stage,
      aspects: () => this.aspects,
      draw: () => this.draw,
      drawProgressive: () => this.drawProgressive,
      state: () => this.state,
      frames: () => this.frames,
      slots: () => this.slots,
      zoom: () => this.zoom,
    };
    this.editor = new CutEditor({
      ...view,
      commit: (s, focus) => this.commit(s, focus),
      preview: (s, frames, hatches) => this.preview(s, frames, hatches),
      thumbs: (page, w) => canvasesOf(this.drawProgressive(page + 1, Math.round(w * dpr()))),
      inking: () => this.tool !== 'none',
      cancelGesture: () => this.input.cancelGesture(),
      say: (t) => this.say(t),
      changed: () => this.syncBar(),
    });
    this.detail = new Detail(view);
    this.toolbar = new Toolbar(what.kind, {
      close: () => history.back(),
      hide: () => this.showChrome(false),
      scores: () => this.menus.scores(),
      excerpt: () => void this.withAccess(() => this.menus.excerpt()),
      excerpts: () => this.menus.excerpts(),
      more: () => void this.menus.more(),
      tool: (t) => this.setTool(t),
      penColor: (c) => { this.penColor = c; this.tool = 'pen'; this.syncBar(); },
      undo: () => this.undo(),
      redo: () => this.redo(),
      toggleEditing: () => void this.withAccess(() => { this.editor.setEnabled(!this.editor.enabled); this.syncBar(); this.decorate(); }),
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
      playExcerpt: (excerpt) => {
        this.reading.play(this.k, excerpt);
        this.frames = this.framesFor(this.k);
        this.frame = 0;
        void this.show();
      },
      leave: () => history.back(),
      access: () => this.allowAccess(),
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
    // While the toolbar shows, a scrim with a triangle marks the band at each side that turns the page.
    const bands = [el('div', 'turn-band left'), el('div', 'turn-band right')];
    bands[0].append(turnIcon('prev'));
    bands[1].append(turnIcon('next'));
    this.root.append(this.stage, ...bands, back, this.toolbar.el, this.scope, this.toast.el);
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

    // The first screen waits for full screen, to be drawn once at full size; the observer too, as
    // its first report would show the screen before `goTo` has chosen it.
    const full = fullscreen ?? document.documentElement.requestFullscreen?.().catch(() => {}) ?? Promise.resolve();
    void this.requestWake();
    void full.then(() => { void this.goTo(k, position); this.observer.observe(this.stage); });
  }

  /* ---------- the scores read ---------- */

  private get items() { return this.reading.items; }

  /** The current item's score, once open; undefined while it opens or when it can't be. */
  private get current(): OpenScore | undefined { return this.scores.get(this.items[this.k].scoreId); }
  private get state(): State { return this.current!.state; }
  private get aspects(): Aspects { return this.current!.aspects; }
  private get draw(): DrawPage { return this.current!.draw!; }
  private get drawProgressive(): DrawProgressive { return this.current!.drawProgressive!; }

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

  /** In a setlist, what fills the rest of a score's last screen. */
  private blank(): HTMLElement {
    return blankBox(this.items[this.k + 1]?.title);
  }

  private async show() {
    const seq = ++this.seq; // a newer show() (turn, resize, edit) supersedes this one
    this.ahead.abort();
    this.ahead = new AbortController();
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    if (!W || !H || this.loading) return;
    this.showTitle();
    const it = this.items[this.k];
    if (!this.current?.draw) {
      // A score that can't be opened: say so, and carry on with the next one.
      this.showUnread(it.title, it.needsAccess ? 'access' : 'missing', W, H);
      return;
    }
    this.frame = Math.max(0, Math.min(this.frame, this.frames.length - 1));
    const scale = dpr();
    const { on, wanted, rects } = this.screenAt(this.frames, this.frame, W, H, scale);
    this.shown = on.length;
    const widths = pageWidths(on, rects.map((r) => r.w));
    // Each page's first yield (a stand-in, or the exact page) shows the screen; the rest sharpen it.
    const progressive = this.drawProgressive;
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
      if (e instanceof NoAccess || e instanceof NotSaved) { this.showUnread(it.title, it.fileGone ? 'unsaved' : 'access', W, H); return; }
      this.toolbar.info.textContent = 'Could not draw this page';
      console.error(e);
      return;
    }
    if (seq !== this.seq) {
      for (const it of drawing) void it.return?.().catch(() => {});
      return;
    }
    if (this.askingAccess) { this.askingAccess = false; this.toast.hide(); }
    this.pages = new Map([...widths.keys()].map((p, i) => [p, first[i].canvas]));

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
    [...widths.keys()].forEach((p, i) => void this.sharpen(seq, p, drawing[i]));
  }

  /**
   * Page p's draws after its first: as each arrives, put it in `pages` and repaint the slots that
   * show it, unless the screen has moved on. A failure keeps the page that is shown.
   */
  private async sharpen(seq: number, p: number, drawing: AsyncIterator<Drawn>) {
    try {
      for (let r = await drawing.next(); !r.done; r = await drawing.next()) {
        if (seq !== this.seq) { void drawing.return?.().catch(() => {}); return; }
        this.pages.set(p, r.value.canvas);
        for (const s of this.slots) if (s.frame.items.some((i) => i.cut.page === p)) this.paint(s, this.state);
      }
    } catch (e) {
      if (seq !== this.seq) return;
      console.error(e);
      this.toolbar.info.textContent = 'Could not draw this page';
    }
  }


  /**
   * In place of the screen, a score that can't be shown: missing; (`access`) in the scores folder,
   * which Volti may not read until access is allowed, offered from a tap; or (`unsaved`) a gone
   * file whose saved pages don't include this screen's.
   */
  private showUnread(title: string, why: Unread, W: number, H: number) {
    this.slots = [];
    this.shown = 1;
    const boxes = [blankBox(undefined, { title, why }), ...(framesOnScreen(A4, W, H) === 2 ? [this.blank()] : [])];
    placeBoxes(boxes, boxes.map(() => A4), W, H, dpr());
    this.spreadEl.replaceChildren(...boxes);
    this.setZoom(NO_ZOOM);
    this.toolbar.info.textContent = { access: 'Needs access', missing: 'Missing', unsaved: 'Not saved' }[why];
    this.showCard();
    // Offered until the screen shows something else, as the page can't be read without it.
    if (why === 'access') {
      this.toast.say('Volti needs access to the scores folder to show this.', ['Allow access', () => void this.allowAccess()], true);
      this.askingAccess = true;
    } else this.saveSpot(undefined);
  }

  /** Whether the score read can be read from its PDF, or couldn't be as access to the scores folder isn't allowed. */
  private async readable(): Promise<boolean> {
    if (this.items[this.k]?.needsAccess) return false;
    const cur = this.current;
    return !cur?.draw || !!cur.readable;
  }

  /**
   * When the score read couldn't be read from its PDF for want of access to the scores folder,
   * open it again from a tap, which its original asks for access from: then read the other scores
   * from their PDFs too, and show the screen again. False, having said why, when it isn't allowed.
   */
  private async allowAccess(): Promise<boolean> {
    if (this.items[this.k]?.fileGone) {
      this.say('The file for this score is gone, so only its saved pages can be shown.');
      return false;
    }
    if (await this.readable()) return true;
    const at = this.slots[0]?.frame.items[0]?.cut.id;
    this.scores.accessAllowed();
    await this.scores.ensure(this.k, true);
    if (!(await this.readable())) { this.say('Volti can’t read the scores folder without access.'); return false; }
    this.toast.hide();
    void this.goTo(this.k, at);
    return true;
  }

  /** Do something that needs the PDFs (editing cuts, choosing an excerpt), asking for access first if need be. */
  private async withAccess(f: () => void) {
    if (await this.allowAccess()) f();
  }

  /**
   * Remember what is read and its first cut on the screen, to come back to (reader/_last-read.ts):
   * a score as an excerpt with no ends, an excerpt by the ends it plays now, a setlist by its entry.
   */
  private saveSpot(cut: string | undefined) {
    if (!cut) return;
    const what = this.reading.what, item = this.items[this.k];
    if (what.kind === 'setlist') {
      if (item.entryId) void saveLastRead({ kind: 'setlist', id: what.id, entry: item.entryId, cut });
    } else void saveLastRead({ kind: 'excerpt', id: item.scoreId, ...(what.kind === 'excerpt' ? ends(what.excerpt) : {}), cut });
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
    const { signal } = this.ahead, draw = this.draw;
    await Promise.all([...near].map(([p, w]) => draw(p + 1, Math.round(w * scale), { priority: 'ahead', signal }).catch(() => {})));
    if (seq !== this.seq) return;
    // On a score's last screen in a setlist, draw the next score's first screen too.
    if (!this.reading.setlistId || this.frame + this.shown < this.frames.length || this.k + 1 >= this.items.length) return;
    const cur = await this.scores.ensure(this.k + 1);
    if (seq !== this.seq || !cur?.draw) return;
    const { on, rects } = this.screenAt(this.framesFor(this.k + 1), 0, W, H, scale);
    const next = cur.draw;
    await Promise.all([...pageWidths(on, rects.map((r) => r.w))].map(([p, w]) => next(p + 1, Math.round(w * scale), { priority: 'ahead', signal }).catch(() => {})));
  }


  /** Turn a screen; in a setlist, past a score's end into the next one, or back into the one before. */
  private turn(dir: 1 | -1) {
    if (this.loading) return;
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
    else if (!open) this.say(`Tap again for “${titleOf(o.path)}”`);
    else {
      this.toast.hide();
      void this.turnToScore(o, dir);
    }
  }

  /** Read score `o` instead: from its start going forward, from its last screen going back. */
  private async turnToScore(o: SourceFile, dir: 1 | -1) {
    this.loading = true;
    this.editor.dismiss();
    this.toolbar.info.textContent = 'Opening…';
    let open: OpenScore;
    try {
      const { draw, drawProgressive, aspects, readable, close } = await openPages(o.id, o, true);
      if (this.scores.closed) { close?.(); return; }
      try {
        const { state } = await loadScore(o.id, aspects);
        open = { id: o.id, original: o, aspects, state, draw, drawProgressive, readable, close };
      } catch (e) {
        close?.();
        throw e;
      }
    } catch (e) {
      // Not opened (its password not given, say): stay where you were.
      this.loading = false;
      this.syncBar();
      void this.show();
      this.say(e instanceof PasswordNotGiven ? `“${titleOf(o.path)}” needs its password to open.` : `Could not open “${titleOf(o.path)}”. It may have been moved or renamed.`);
      if (!(e instanceof PasswordNotGiven)) console.error(e);
      return;
    }
    this.scores.adopt(open);
    this.reading.turnTo({ scoreId: o.id, title: titleOf(o.path), original: o });
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
    this.ahead.abort();
    this.editor.dismiss();
    this.card.stop();
    await this.saver.flush();
    void this.wake?.release().catch(() => {});
    // Leaving full screen settles before the library is shown, so it doesn't undo the library's scroll.
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    this.scores.destroy();
    this.root.remove();
    document.body.classList.remove('reading');
    this.onClose(this.fileChanges);
  }
}
