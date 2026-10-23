// The centre of the score screen: the scores being read and the frames on the screen, turning pages
// and scores, taking edits (commit, undo, redo), and opening and closing. It joins the other reader
// files together; code that can stand on its own goes in one of them.

import type { Marking } from '../markings/model';
import { PEN_COLORS } from '../markings/stroke';
import { frameOf, pack, type Frame } from '../scores/frames';
import type { Aspects, Cut, ExcerptName, State } from '../scores/model';
import { loadScore, savePosition } from '../scores/store';
import { followEdit, followScore, newEntry, spanCuts, spanLabel, spanOf, type Entry, type Setlist, type Span } from '../setlists/model';
import { ends, excerptName, followNames, nameOf, sortedNames } from '../setlists/names';
import { loadPosition, loadSetlists, saveLastAddedTo, savePosition as saveSetlistPosition } from '../setlists/store';
import type { PageCache } from '../originals/pdf';
import { folderState, knownTitles, type Original } from '../originals/originals';
import type { ExportPart } from '../export/pdf';
import { button, el } from '../ui/dom';
import { openExcerptPicker, type ExcerptSource } from '../ui/excerpt-picker';
import { addExcerpt, changeExcerptCuts, deleteExcerpt, renameExcerpt, type ExcerptHost } from '../ui/excerpts';
import { openExportPdf } from '../ui/export-pdf';
import { buttonRow, closeOverlay, showDialog, showMenu } from '../ui/overlay';
import { chooseSetlist } from '../ui/setlists';
import { Toast } from '../ui/toast';
import type { Hatches } from '../render/paint';
import { framesOnScreen } from '../render/layout';
import { isZoomed, NO_ZOOM, type Zoom } from '../render/zoom';
import { pageWidths, screenAt } from '../render/screen';
import { CutEditor } from './cuts/editor';
import { Detail } from './detail';
import { OpenScores, openPages, type Item, type OpenScore } from './open-scores';
import type { Gesture } from './gestures';
import { History } from './history';
import { Input } from './input';
import { Saver } from './saver';
import { blankBox, ScoreCard, showSetlistTitle } from './setlist';
import { paintSlot, paintSlotInk, placeBoxes, placeSlots, type FrameSlot } from './spread';
import { backIcon, Toolbar, type ToolChoice } from './toolbar';
import type { ToolName } from './tools/tool';

/**
 * Undo keeps whole states: each entry is a score's state before an edit, the setlists (whose
 * excerpts follow the edit), the item it was made in, and the cut to show.
 */
interface Undo { open: OpenScore; state: State; setlists: readonly Setlist[]; k: number; focus?: string; reading: Reading }

/** What the reader opens: a score on its own, a named excerpt of one, or a setlist. */
export type ToRead =
  | { kind: 'score'; original: Original }
  | { kind: 'excerpt'; original: Original; excerpt: ExcerptName }
  | { kind: 'setlist'; setlistId: string; originals: readonly Original[]; startEntry?: string };

/**
 * What is being read: a score; a named excerpt of it, read as a setlist entry playing it would be
 * (its span follows edits, as entries' spans do); or a setlist.
 */
type Reading = { kind: 'score' } | { kind: 'excerpt'; span: Span } | { kind: 'setlist'; id: string };

/** A score that can't be opened is shown this shape. */
const A4 = 297 / 210;

const dpr = () => window.devicePixelRatio || 1;

/** Whether two played orders put the same music in the same places. */
const sameLayout = (a: readonly Cut[], b: readonly Cut[]) =>
  a.length === b.length && a.every((c, i) => c.id === b[i].id && c.page === b[i].page && c.y0 === b[i].y0 && c.y1 === b[i].y1 && c.pad === b[i].pad);


/** Open a score, or a setlist as one continuous score. A score that can't be opened throws; a setlist carries on past it. */
export async function openReader(what: ToRead, onClose: () => void): Promise<void> {
  const setlists = await loadSetlists();
  if (what.kind !== 'setlist') {
    const { original } = what;
    const { cache, aspects } = await openPages(original, true);
    const { state, position } = await loadScore(original.id, original.title, aspects);
    const first: OpenScore = { id: original.id, original, aspects, state, cache };
    const item = { scoreId: original.id, title: original.title, original };
    // An excerpt starts at its start each time: its place isn't kept.
    if (what.kind === 'excerpt') new Reader([item], { kind: 'excerpt', span: ends(what.excerpt) }, setlists, first, 0, undefined, onClose);
    else new Reader([item], { kind: 'score' }, setlists, first, 0, position, onClose);
    return;
  }
  const setlist = setlists.find((s) => s.id === what.setlistId);
  if (!setlist?.entries.length) throw new Error('No such setlist, or no scores in it');
  const originals = new Map(what.originals.map((o) => [o.id, o]));
  const titles = await knownTitles();
  const items: Item[] = setlist.entries.map((e) => {
    const original = originals.get(e.scoreId);
    return { scoreId: e.scoreId, entryId: e.id, original, title: original?.title ?? titles[e.scoreId] ?? 'Missing score', missing: !original };
  });
  const pos = what.startEntry ? { entry: what.startEntry } : await loadPosition(setlist.id);
  const k = Math.max(0, items.findIndex((it) => it.entryId === pos?.entry));
  new Reader(items, { kind: 'setlist', id: setlist.id }, setlists, null, k, pos?.cut, onClose);
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

  constructor(
    private items: Item[],
    private reading: Reading,
    private setlists: readonly Setlist[],
    first: OpenScore | null,
    k: number,
    position: string | undefined,
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
    this.toolbar = new Toolbar(reading.kind, {
      close: () => history.back(),
      scores: () => this.scoresMenu(),
      excerpt: () => this.chooseExcerpt(),
      excerpts: () => this.excerptsList(),
      exportPdf: () => void this.exportPdf(),
      addToSetlist: () => this.addToSetlist(),
      tool: (t) => this.setTool(t),
      penColor: (c) => { this.penColor = c; this.tool = 'pen'; this.syncBar(); },
      undo: () => this.undo(),
      redo: () => this.redo(),
      toggleEditing: () => { this.editor.setEnabled(!this.editor.enabled); this.syncBar(); this.decorate(); },
      openArchive: () => this.editor.openArchive(),
      fit: () => this.setZoom(NO_ZOOM),
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

  private get setlistId() { return this.reading.kind === 'setlist' ? this.reading.id : null; }
  private get setlist() { return this.setlists.find((s) => s.id === this.setlistId); }

  /** In a setlist, the entry item k is. */
  private setlistEntry(k = this.k): Entry | undefined {
    const id = this.items[k]?.entryId;
    return id ? this.setlist?.entries.find((e) => e.id === id) : undefined;
  }

  /** The span item k plays: its entry's, or the excerpt's; none for the whole score. */
  private entry(k = this.k): Span | undefined {
    return this.reading.kind === 'excerpt' ? this.reading.span : this.setlistEntry(k);
  }

  /** The cuts item k plays. */
  private playedCuts(k: number, cur: OpenScore) {
    const span = this.entry(k);
    return span ? spanCuts(cur.state.score.cuts, span) : cur.state.score.cuts;
  }
  /** The current item's score, once open; undefined while it opens or when it can't be. */
  private get current(): OpenScore | undefined { return this.scores.get(this.items[this.k].scoreId); }
  private get state(): State { return this.current!.state; }
  private get aspects(): Aspects { return this.current!.aspects; }
  private get cache(): PageCache { return this.current!.cache!; }

  private framesFor(k: number): Frame[] {
    const cur = this.scores.get(this.items[k].scoreId);
    return cur ? pack(this.playedCuts(k, cur), cur.aspects) : [];
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
    this.scope.hidden = this.reading.kind === 'score' || !this.editor.enabled;
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
    if (this.reading.kind === 'excerpt' && cur) this.toolbar.title.textContent = `${excerptName(cur.state.score, this.reading.span, cur.aspects)} · ${it.title}`;
    else if (!this.setlistId) this.toolbar.title.textContent = it.title;
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

  /** " · Kyrie" or " · Pages 2–3" for an entry that plays an excerpt of a score that is open; otherwise nothing. */
  private excerptLabel(k: number): string {
    const cur = this.scores.get(this.items[k].scoreId), entry = this.entry(k);
    const label = cur && entry ? excerptName(cur.state.score, entry, cur.aspects) : null;
    return label ? ` · ${label}` : '';
  }

  /** In a score's own reader: add the score, whole, to the end of a setlist; in an excerpt's, the excerpt. */
  private addToSetlist() {
    const it = this.items[0], span = this.entry(0), cur = this.current;
    const what = span && cur ? excerptName(cur.state.score, span, cur.aspects) ?? it.title : it.title;
    chooseSetlist(this.toolbar.anchor('addTo'), `Add “${what}” to`, this.setlists, (s, isNew) => {
      const added = { ...s, entries: [...s.entries, { ...newEntry(it.scoreId), ...(span ? ends(span) : {}) }] };
      this.setlists = isNew ? [added, ...this.setlists] : this.setlists.map((x) => (x.id === s.id ? added : x));
      void saveLastAddedTo(s.id);
      this.saver.soon();
      this.say(`Added to the end of “${s.title}”.`);
    }, it.scoreId);
  }

  /** Export what this reader pages through: the score, the excerpt, or the whole setlist. */
  private async exportPdf() {
    this.editor.dismiss();
    // The export reads the scores as saved.
    await this.saver.flush();
    const parts: ExportPart[] = [], missing: string[] = [];
    this.items.forEach((it, k) => {
      if (it.original && !it.missing) parts.push({ original: it.original, span: this.entry(k) });
      else missing.push(it.title);
    });
    if (!parts.length) { this.say('Its scores are all missing.'); return; }
    const cur = this.current, span = this.entry();
    const title = this.setlist?.title
      ?? (this.reading.kind === 'excerpt' && cur && span ? `${this.items[0].title} - ${excerptName(cur.state.score, span, cur.aspects)}` : this.items[0].title);
    openExportPdf({
      title,
      parts,
      missing,
      toFolder: (await folderState()).kind !== 'none',
      saved: (name) => this.say(`Saved “${name}.pdf” in Exports, in the scores folder.`),
    });
  }

  /** An open score's pages, for the excerpt picker. */
  private source(cur: OpenScore, cache: PageCache): ExcerptSource {
    return { state: cur.state, aspects: cur.aspects, page: (p, w) => cache.render(p + 1, w, Math.round(w * cur.aspects[p]), dpr()) };
  }

  /** Changing the open score's named excerpts from the reader, saved with the score. */
  private excerptHost(cur: OpenScore): ExcerptHost {
    return {
      setlists: this.setlists,
      aspects: cur.aspects,
      save: (score, setlists) => {
        cur.state = { ...cur.state, score };
        if (setlists) this.setlists = setlists;
        this.saver.soon(cur);
        this.showTitle();
      },
      say: (t) => this.say(t),
    };
  }

  /** In a score's own reader: its named excerpts, to go to one, add one or change them. */
  private excerptsList() {
    const cur = this.current, cache = cur?.cache;
    if (!cur || !cache) return;
    this.editor.dismiss();
    const score = cur.state.score, title = this.items[0].title, names = sortedNames(score);
    const d = showDialog(`Excerpts of “${title}”`);
    const list = el('ul', 'excerpt-list');
    for (const x of names) {
      const li = el('li');
      const go = button('', () => {
        closeOverlay();
        void this.goTo(this.k, score.cuts[spanOf(score.cuts, x).i0]?.id);
      }, 'open');
      go.append(el('span', 'item-title', x.name));
      const pages = spanLabel(score.cuts, x, cur.aspects);
      if (pages) go.append(el('span', 'meta', pages));
      go.setAttribute('aria-label', `Go to ${x.name}`);
      const more = button('⋯', () => showMenu(more, x.name, [
        { label: 'Rename…', run: () => renameExcerpt(cur.state.score, x, this.excerptHost(cur)) },
        { label: 'Change cuts…', run: () => changeExcerptCuts(this.source(cur, cache), x, this.excerptHost(cur)) },
        { label: 'Delete…', run: () => deleteExcerpt(cur.state.score, x, this.excerptHost(cur)) },
      ]), 'quiet more');
      more.setAttribute('aria-label', `More for ${x.name}`);
      more.setAttribute('aria-haspopup', 'menu');
      li.append(go, more);
      list.append(li);
    }
    if (!names.length) list.append(el('li', 'empty', 'No excerpts yet. Add one to name part of the score, such as the Kyrie.'));
    d.append(list, buttonRow(
      button('Add excerpt…', () => addExcerpt(this.source(cur, cache), title, this.excerptHost(cur))),
      button('Close', closeOverlay, 'primary'),
    ));
  }

  /** In a setlist: choose which of the score's cuts this entry plays. In an excerpt: change the excerpt's cuts. */
  private chooseExcerpt() {
    const cur = this.current;
    if (!cur?.cache) return;
    this.editor.dismiss();
    const pages = this.source(cur, cur.cache);
    if (this.reading.kind === 'excerpt') {
      this.changeExcerpt(cur, this.reading.span, pages);
      return;
    }
    const entry = this.setlistEntry();
    if (!entry) return;
    openExcerptPicker({
      ...pages,
      question: `Which part of “${this.items[this.k].title}” does entry ${this.k + 1} play?`,
      verb: 'This entry plays',
      named: true,
      span: entry,
      done: (span) => this.setExcerpt(entry.id, span),
    });
  }

  /**
   * Give the named excerpt being read other cuts; every setlist entry that plays it moves with it.
   * An excerpt that lost its name to an edit (it came to be the whole score) just plays other cuts.
   */
  private changeExcerpt(cur: OpenScore, span: Span, pages: ExcerptSource) {
    const name = nameOf(cur.state.score, span);
    const read = (to: Span) => {
      this.reading = { kind: 'excerpt', span: ends(to) };
      this.frames = this.framesFor(this.k);
      this.frame = 0;
      void this.show();
    };
    if (name) changeExcerptCuts(pages, name, this.excerptHost(cur), read);
    else openExcerptPicker({ ...pages, question: `Which part of “${this.items[0].title}” to read?`, verb: 'It plays', span, done: read });
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

  /**
   * The screen starting at frame f of `frames`: the frames on it (as many as f's shape decides,
   * fewer at the end), how many it wanted, and where they go, a setlist keeping room for the box
   * after a score's last frame.
   */
  private screenAt(frames: Frame[], f: number, W: number, H: number, scale: number) {
    return screenAt(frames, f, W, H, scale, !!this.setlistId);
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
    const extra = this.setlistId && on.length < wanted ? [this.blank()] : [];
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


  /** Remember the first cut on the screen, to come back to; an excerpt always starts at its start. */
  private saveSpot(cut: string | undefined) {
    const it = this.items[this.k];
    if (this.reading.kind === 'excerpt') return;
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
    if (!this.setlistId || this.frame + this.shown < this.frames.length || this.k + 1 >= this.items.length) return;
    const cur = await this.scores.ensure(this.k + 1);
    if (seq !== this.seq || !cur?.cache) return;
    const { on, rects } = this.screenAt(this.framesFor(this.k + 1), 0, W, H, scale);
    const next = cur.cache;
    await Promise.all([...pageWidths(on, rects.map((r) => r.w))].map(([p, w]) => next.render(p + 1, w, Math.round(w * cur.aspects[p]), scale, 'ahead', true).catch(() => {})));
  }


  /** Turn a screen; in a setlist, past a score's end into the next one, or back into the one before. */
  private turn(dir: 1 | -1) {
    if (this.loading) return;
    // Forward by the frames shown; back by as many (to the first frame, near the start).
    const next = dir > 0 ? this.frame + this.shown : this.frame > 0 ? Math.max(0, this.frame - this.shown) : -1;
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
    this.undos.record({ open: cur, state: cur.state, setlists: this.setlists, k: this.k, focus, reading: this.reading });
    // Every setlist's excerpts of the score, and its named excerpts, follow the edit. Pages
    // inserted at the edges of the excerpt being read join it, wherever it is played.
    const before = cur.state.score.cuts, after = s.score.cuts, grow = this.reading.kind === 'score' ? undefined : entry;
    const names = followNames(s.score.names, before, after, grow);
    if (names !== s.score.names) s = { ...s, score: { ...s.score, names } };
    if (this.reading.kind === 'excerpt') this.reading = { kind: 'excerpt', span: followEdit(this.reading.span, before, after, true) };
    this.setState(s, followScore(this.setlists, cur.id, before, after, grow), focus);
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
    this.undos.record({ open: this.current!, state: before, setlists: this.setlists, k: this.k, focus: slot.frame.items[0]?.cut.id, reading: this.reading });
    this.frames = this.framesFor(this.k);
    slot.frame = this.frames[slot.index];
    this.syncBar();
  }

  private undo() {
    const e = this.undos.undo((e) => ({ ...e, state: e.open.state, setlists: this.setlists, reading: this.reading }));
    if (e) this.restore(e);
  }

  private redo() {
    const e = this.undos.redo((e) => ({ ...e, state: e.open.state, setlists: this.setlists, reading: this.reading }));
    if (e) this.restore(e);
  }

  /** Put back a score and the setlists as they were, showing the score where the edit was made. */
  private restore(e: Undo) {
    this.reading = e.reading;
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
