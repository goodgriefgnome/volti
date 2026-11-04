// The centre of the score screen: the frames on the screen, turning pages and scores, taking edits
// (commit, undo, redo), and opening and closing. It joins the other reader files together: what is
// read, and how edits carry to setlists, is _reading.ts; the toolbar's menus and dialogs are
// _toolbar-menus.ts. Code that can stand on its own goes in one of them.

import type { FileChange } from '../dialogs/score-files';
import { ends } from '../scores/excerpts';
import { addAdhoc, findSymbol, moveGroup, moveSymbol, replaceSymbol, symbolsOf, type LibrarySymbol, type SymbolAt, type SymbolLibrary } from '../markings/library';
import { type Marking } from '../markings/model';
import { unlockFolder } from '../originals/device-score-fs';
import { knownTitles } from '../originals/library-files';
import { NoAccess, PasswordNotGiven, type SourceFile } from '../originals/types';
import { canvasesOf } from '../page-cache/cache';
import { NotSaved, type Drawn } from '../page-cache/types';
import { titleOf } from '../originals/path-utils';
import { framesOnScreen } from '../render/layout';
import { fitScale, isIdentity, NO_ZOOM, placeFresh, type View, type Zoom } from '../render/zoom';
import { pageWidths, screenAt } from '../render/screen';
import { type Hatches } from '../render/paint';
import { replaceMarking, setInk, textSizeOf } from '../scores/edits';
import { centreOnFrame, movedTo, type Selected } from '../scores/placing';
import { baselineStart, markColors, textMark, type Background, type PlacedMark } from '../markings/placed';
import { claimMarking } from '../scores/ownership';
import { compactMarking } from '../markings/model';
import { A4, type Aspects, type Cut, type NamedExcerpt, type State } from '../scores/model';
import { frameOf, pack, type Frame } from '../scores/frames';
import { loadScore } from '../scores/store';
import { loadSetlists } from '../setlists/store';
import { type Setlist } from '../setlists/model';
import { closeOverlay, showDialog } from '../ui/overlay';
import { ACADEMICO, BRAVURA, fontChoices, fontMetrics, shapeWith, type FontChoice } from '../fonts/fonts';
import { loadToolSettings, saveGlyphs, saveLibrary, saveToolSettings } from '../markings/store';
import { mix } from '../markings/draw';
import { backgroundOf, type BackgroundChoice, type ColorChoice, DEFAULT_TOOL_SETTINGS, ownColor, strokeColor, type ToolSettings } from '../markings/tool-settings';
import { dpr, el } from '../ui/dom';
import { Toast } from '../ui/toast';
import { CutEditor } from './cuts/_editor';
import { Detail } from './_detail';
import type { Gesture } from './_gestures';
import { History } from './_history';
import { Input, type InputHost } from './_input';
import { OpenScores, openPages, type DrawPage, type DrawProgressive, type Item, type OpenScore } from './_open-scores';
import { Reading, setlistItems, type ReadingKind, type ReadingSnapshot } from './_reading';
import { Saver } from './_saver';
import { TypingField } from './_typing';
import { LendStack } from './_lending';
import { lastSymbol, makeSymbol, reorderedCurrents, savedLibrary, symbolLibrary } from './_symbols';
import { glyphPicker } from './_glyph-picker';
import { editLibrary } from './_library-editor';
import { blankBox, ScoreCard, showSetlistTitle, type Unread } from './_setlist';
import { paintSlot, paintSlotInk, placeBoxes, placeSlots, type FrameSlot } from './_spread';
import { Loupe } from './_loupe';
import { showSymbolPanel } from './_symbol-panel';
import { showTextPanel, type SymbolSettingsView, type TextPanel } from './_tool-panels';
import { backIcon, Toolbar, turnIcon, type ToolChoice } from './_toolbar';
import { symbolFace, textFace, type Look } from './tools/_faces';
import { ReaderMenus } from './_toolbar-menus';
import { offerScore, turnFrom, type Offer } from './_turning';
import { makeTools } from './tools/_tools';
import type { ButtonFace, HandHost, Tool, ToolName } from './tools/_tool';
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
    const { draw, drawProgressive, aspects, readable, close } = await openPages(original.id, original, true, true);
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
  /** The app's theme before the reader made it light; put back when the reader closes. */
  private themeBefore = document.documentElement.dataset.theme;
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
  /** The smallest zoom: the spread fits below the toolbar at its tallest since it showed. */
  private minScale = 1;
  private detail: Detail;

  /** The tool equipped by its button, with the tools a selection has lent on top of it. */
  private stack = new LendStack<ToolChoice>('hand');
  /** The tools, made for this reader. */
  private tools!: Record<ToolName, Tool>;
  /** What each tool's button shows, as the tool last set it. */
  private faces = new Map<ToolName, ButtonFace>();
  /** The tool in use: the one on top of the stack. */
  private get tool(): ToolChoice { return this.stack.active; }
  /** Each tool's settings for new markings; kept across restarts. */
  private settings: ToolSettings = DEFAULT_TOOL_SETTINGS;
  /** The symbol library, once it has been made. */
  private symbolLib: SymbolLibrary | undefined;
  /** The group whose current symbol is the tool, while a symbol is; -1 for the ad-hoc group. */
  private group = 0;
  /** Each group's current symbol, an index into it, while the app runs. */
  private currents: number[] = [];
  /** The ad-hoc group's current symbol. */
  private adhocCurrent = 0;
  /** The font last used in the glyph picker, while the app runs. */
  private pickerFont = BRAVURA;
  /** The fonts text can be typed in, once known. */
  private textFonts: FontChoice[] = [];
  /** The placed marking showing its box, while a symbol is the tool. */
  private selected: Selected | undefined;
  private typing = new TypingField(this.stage);
  private loupe: Loupe;
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
      cancelGesture: () => this.input.cancelGesture(),
      say: (t) => this.say(t),
      changed: () => this.syncBar(),
    });
    this.detail = new Detail(view);
    this.loupe = new Loupe(this.root, view);
    const base: Omit<InputHost & HandHost, 'layer' | 'setButtonFace'> = {
      ...view,
      editor: this.editor,
      tool: () => this.tool,
      penColor: () => strokeColor('pen', this.settings.pen.color, markColors()),
      highlightColor: () => strokeColor('highlighter', this.settings.highlighter.color, markColors()),
      symbolColor: () => ownColor(this.settings.symbol.color),
      placing: () => this.symbolLib && symbolsOf(this.symbolLib, this.group)[this.currentOf(this.group)],
      library: () => this.symbolLib,
      paintState: (slot, s) => this.paintInk(slot, s),
      selected: () => this.selected,
      select: (s) => this.select(s),
      delete: () => this.deleteSelected(),
      settings: () => this.settings,
      setSettings: (change) => this.setSettings(change),
      textPanel: () => this.textPanel(),
      symbolPanel: () => void this.symbolPanel(),
      cycled: (sym) => this.cycledTo(sym),
      setZoom: (z) => this.setZoom(z),
      view: () => this.view(),
      minScale: () => this.minScale,
      annotating: () => this.annotating,
      act: (g) => this.act(g),
      paintInk: (slot, extra) => this.paintInk(slot, this.state, extra),
      commit: (s, focus, selected) => this.commit(s, focus, selected),
      show: (s, slot) => this.showState(s, slot),
      undoTo: (before, slot) => this.undoTo(before, slot),
      lendForPress: (tool) => { this.stack.lend(tool, 'press'); this.refreshSelection(); },
      endPressLend: () => { this.stack.end('press'); this.refreshSelection(); },
      unequip: () => { this.useTool('hand'); this.syncBar(); },
      lift: () => {},
      toggleToolbar: () => this.act('toggleChrome'),
      cutsOn: () => this.editor.enabled,
      cutMenu: (p) => this.editor.menuAt(p.x, p.y),
      loupe: () => this.loupe,
      textGhost: (at) => this.textGhost(at),
      newText: (slot, at) => this.newText(slot, at),
      editText: (sel) => this.editText(sel),
      typing: () => this.typing.open,
      finishTyping: () => this.typing.finish(),
    };
    // Each tool gets a host whose chrome layers and button face are its own.
    const hostFor = (tool: ToolName): InputHost & HandHost => ({
      ...base,
      layer: (slot) => this.layerFor(tool, slot),
      setButtonFace: (face) => this.setFace(tool, face),
    });
    const host = hostFor('hand');
    this.tools = makeTools(hostFor, host);
    this.toolbar = new Toolbar(what.kind, {
      close: () => history.back(),
      titleMenu: () => this.menus.titleMenu(),
      more: () => void this.menus.more(),
      tool: (t) => (t === 'symbol' ? void this.symbols() : this.setTool(t)),
      panel: (t) => this.panel(t),
      undo: () => this.undo(),
      redo: () => this.redo(),
      toggleCuts: () => void this.withAccess(() => { this.editor.setEnabled(!this.editor.enabled); this.syncBar(); this.decorate(); }),
    }, this.tools);
    // Faces the tools set before the toolbar was there.
    for (const [tool, face] of this.faces) this.toolbar.setFace(tool, face);
    this.menus = new ReaderMenus({
      reading: this.reading,
      toolbar: this.toolbar,
      saver: this.saver,
      k: () => this.k,
      open: (k) => this.scores.get(this.items[k].scoreId),
      goTo: (k, at) => void this.goTo(k, at, true),
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
      ensure: (k) => this.scores.ensure(k, true),
      readWhole: () => {
        this.reading.readWhole();
        this.frames = this.framesFor(this.k);
        this.frame = 0;
        void this.show();
      },
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
    void loadToolSettings().then((s) => { this.settings = s; this.syncBar(); }, () => {});
    void fontChoices().then((all) => { this.textFonts = all.filter((c) => c.text); this.syncBar(); }, () => {});
    void savedLibrary().then((lib) => { if (lib && !this.symbolLib) { this.symbolLib = lib; this.syncBar(); } }, () => {});
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
    document.documentElement.dataset.theme = 'light';

    this.input = new Input(host, this.tools);
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

  /** Go to item k: its first or last screen, or the screen holding a cut; `turned` as show() says. */
  private async goTo(k: number, at?: string | 'first' | 'last', turned = false) {
    const seq = ++this.goSeq;
    this.loading = true;
    this.deselect();
    if (k !== this.k) { this.editor.dismiss(); this.toolbar.info.textContent = 'Opening…'; }
    await this.scores.ensure(k, true);
    if (seq !== this.goSeq || this.scores.closed) return;
    this.loading = false;
    this.k = k;
    this.frames = this.framesFor(k);
    const f = at === 'last' ? this.lastScreen(this.frames) : at && at !== 'first' ? frameOf(this.frames, at) : 0;
    this.frame = Math.max(0, f);
    this.syncBar();
    await this.show({ turned });
    this.scores.keepNear(this.k);
  }

  /**
   * The setlist's entries changed: list them again, and read entry `entryId` where it is now, or,
   * when it's gone, the entry now at `at` (or the last); with none left, back to the library.
   * Done when the entry is on its way to the screen.
   */
  private relisted(entryId?: string, at = this.k): Promise<void> {
    const s = this.reading.setlist;
    if (!s?.entries.length) { history.back(); return Promise.resolve(); }
    const titles = Object.fromEntries(this.items.map((it) => [it.scoreId, it.title]));
    const was = this.items[this.k]?.entryId;
    this.reading.relist(setlistItems(s, new Map(this.library.map((o) => [o.id, o])), titles));
    const k = entryId ? this.items.findIndex((it) => it.entryId === entryId) : -1;
    if (k >= 0 && entryId === was) {
      // Still reading the same entry, only somewhere else in the setlist.
      this.k = k;
      this.syncBar();
      void this.show({ place: 'keep' });
      this.scores.keepNear(k);
      return Promise.resolve();
    }
    return this.goTo(k >= 0 ? k : Math.min(at, this.items.length - 1), 'first');
  }

  /* ---------- toolbar ---------- */

  /** Tapping the active tool again puts it away. */
  private setTool(t: ToolName) {
    this.useTool(this.tool === t ? 'hand' : t);
    this.syncBar();
  }

  /** Change the tool; the selection ends with it, between Text and a symbol too, and nothing is given back. */
  private useTool(t: ToolChoice) {
    if (t !== this.tool) {
      this.typing.finish();
      this.stack.equip(t);
      this.deselect();
    }
  }

  /** End the selection and hide its box; the tool its marking lent, if any, goes back to what it was. The caller shows the toolbar. */
  private deselect() {
    this.stack.end('selection');
    this.selected = undefined;
    this.selectionChanged();
  }

  /** Every tool is told the selection changed, to draw its chrome again. */
  private selectionChanged() {
    this.showLayers();
    for (const t of Object.values(this.tools ?? {})) t.onSelectionChanged?.();
  }

  /** Selecting a marking lends the tool for its kind, keeping the selection; ending the selection takes the lend off. */
  private lend(kind: ToolName) {
    if (this.tool === kind) return;
    this.typing.finish();
    this.stack.lend(kind, 'selection');
  }

  /** A long press on a tool's button makes it the tool, if it isn't; when it is, the press leaves it be. */
  private chooseOnLongPress(tool: ToolName) {
    if (this.tool === tool) return;
    this.useTool(tool);
    this.syncBar();
  }

  /** A long press on a tool's button: it becomes the tool (Symbols does that itself), and its panel shows under the button. */
  private panel(tool: Exclude<ToolName, 'hand'>) {
    if (tool !== 'symbol') this.chooseOnLongPress(tool);
    this.tools[tool].showPanel?.(this.toolbar.anchor(tool));
  }

  /** A tool's button shows `face` from now on. */
  private setFace(tool: ToolName, face: ButtonFace) {
    this.faces.set(tool, face);
    this.toolbar?.setFace(tool, face);
  }

  /** The tool's chrome layer in a frame, made the first time it is asked for and shown while the tool is in use. */
  private layerFor(tool: ToolName, slot: FrameSlot): HTMLElement {
    slot.layers ??= {};
    let layer = slot.layers[tool];
    if (!layer) {
      layer = el('div', 'tool-layer');
      layer.hidden = tool !== this.tool;
      slot.box.append(layer);
      slot.layers[tool] = layer;
    }
    return layer;
  }

  /** Only the chrome of the tool in use shows. */
  private showLayers() {
    for (const slot of this.slots) for (const [tool, layer] of Object.entries(slot.layers ?? {})) layer.hidden = tool !== this.tool;
  }

  /** Every tool draws its chrome again: the layout or the zoom changed. */
  private drawChromes() {
    for (const t of Object.values(this.tools ?? {})) t.drawChrome?.();
  }

  /** Change the tools' settings, save them, and show them. */
  private setSettings(change: (s: ToolSettings) => ToolSettings): void {
    this.settings = change(this.settings);
    saveToolSettings(this.settings).catch((e) => { console.error(e); this.say("Could not save the tools' settings."); });
    this.syncBar();
  }

  /** The selected marking, when it is of `tool`'s kind. */
  private selectedOf(tool: 'text' | 'symbol'): Selected | undefined {
    return this.selected?.mark.kind === tool ? this.selected : undefined;
  }

  /** What the Text or Symbols button shows: the selected marking's look, else the settings for the next marking. */
  private lookOf(tool: 'text' | 'symbol'): Look {
    const m = this.selectedOf(tool)?.mark;
    if (m) return { ...(tool === 'text' ? { font: m.font } : {}), color: m.color ?? markColors().color, ...(m.background ? { background: m.background } : {}) };
    if (tool === 'text') {
      const t = this.settings.text, background = backgroundOf(t.background, t.backgroundColor);
      return { font: t.font ?? ACADEMICO, color: ownColor(t.color) ?? markColors().color, ...(background ? { background } : {}) };
    }
    const background = this.pickedSymbol()?.background;
    return { color: ownColor(this.settings.symbol.color) ?? markColors().color, ...(background ? { background } : {}) };
  }

  /** A colour from the Text or Symbols panel: the selected marking of that kind takes it, and so do new ones. */
  private panelColor(tool: 'text' | 'symbol', c: ColorChoice) {
    const sel = this.selectedOf(tool);
    if (sel && sel.mark.color !== ownColor(c)) {
      const { color: _, ...rest } = sel.mark, own = ownColor(c);
      const marked: PlacedMark = own ? { ...rest, color: own } : rest;
      this.commit(replaceMarking(this.state, sel.cut, sel.mark, marked), sel.cut, { cut: sel.cut, mark: marked });
    }
    this.setSettings((s) => (tool === 'text' ? { ...s, text: { ...s.text, color: c } } : { ...s, symbol: { color: c } }));
  }

  /**
   * A background shape or colour from the Text or Symbols panel: the selected marking of that kind
   * takes it; for Text, so do new ones; for Symbols, so does the library symbol (the selected
   * symbol's, or with none selected the tool's), which the next marking of it is a copy of.
   */
  private panelBackground(tool: 'text' | 'symbol', change: { shape?: BackgroundChoice; color?: ColorChoice }) {
    const sel = this.selectedOf(tool);
    const resolve = (was: Background | undefined) => backgroundOf(change.shape ?? was?.shape ?? 'none', change.color ?? was?.color ?? 'default');
    let next: Background | undefined;
    if (sel) {
      next = resolve(sel.mark.background);
      if (JSON.stringify(next) !== JSON.stringify(sel.mark.background)) {
        const { background: _, ...rest } = sel.mark;
        const marked: PlacedMark = next ? { ...rest, background: next } : rest;
        this.commit(replaceMarking(this.state, sel.cut, sel.mark, marked), sel.cut, { cut: sel.cut, mark: marked });
      }
    }
    if (tool === 'text') {
      this.setSettings((s) => ({ ...s, text: { ...s.text, ...(change.shape !== undefined ? { background: change.shape } : {}), ...(change.color !== undefined ? { backgroundColor: change.color } : {}) } }));
      return;
    }
    const lib = this.symbolLib;
    const at = lib && sel && findSymbol(lib, sel.mark.font, sel.mark.text);
    const sym = sel ? lib && at && symbolsOf(lib, at.group)[at.index] : this.pickedSymbol();
    if (lib && sym) {
      const { background: _, ...rest } = sym, was = sel ? next : resolve(sym.background);
      this.setLibrary(replaceSymbol(lib, sym, was ? { ...rest, background: was } : rest));
    } else this.syncBar();
  }

  /** The Text button's long press: it becomes the tool, and its settings show, or the selected text marking's. */
  private textPanel() {
    this.chooseOnLongPress('text');
    const sel = this.selectedOf('text')?.mark, t = this.settings.text;
    const v: TextPanel = {
      fonts: this.textFonts,
      font: this.typing.font ?? sel?.font ?? t.font ?? ACADEMICO,
      color: sel ? sel.color ?? 'default' : t.color,
      background: sel ? sel.background?.shape ?? 'none' : t.background,
      backgroundColor: sel ? sel.background?.color ?? 'default' : t.backgroundColor,
    };
    showTextPanel(this.toolbar.anchor('text'), v, {
      font: (id) => this.setFont(id),
      color: (c) => this.panelColor('text', c),
      background: (b) => this.panelBackground('text', { shape: b }),
      backgroundColor: (c) => this.panelBackground('text', { color: c }),
    });
  }

  /** The library, made the first time; undefined, having said so, when that fails. */
  private async ensureLibrary(): Promise<SymbolLibrary | undefined> {
    if (!this.symbolLib) {
      try { this.symbolLib = await symbolLibrary(); } catch (e) { console.error(e); this.say('Could not load the symbols.'); }
    }
    return this.symbolLib;
  }

  /** The Symbols button's long press: the last symbol picked becomes the tool, and the library and the symbols' settings show, or the selected symbol's. */
  private async symbolPanel() {
    if (!await this.ensureLibrary()) return;
    // Not the tool yet: the last symbol picked becomes it, as a tap on the button does.
    if (this.tool !== 'symbol') {
      const at = lastSymbol(this.symbolLib!, this.group, this.currents, this.adhocCurrent);
      if (at) this.chooseSymbol(at.group, at.index);
    }
    const sel = this.selectedOf('symbol')?.mark, was = sel ? sel.background : this.pickedSymbol()?.background;
    const v: SymbolSettingsView = {
      color: sel ? sel.color ?? 'default' : this.settings.symbol.color,
      background: was?.shape ?? 'none',
      backgroundColor: was?.color ?? 'default',
    };
    showSymbolPanel(this.toolbar.anchor('symbol'), {
      library: () => this.symbolLib!,
      tool: () => { const lib = this.symbolLib, s = this.pickedSymbol(); return lib && s && this.tool === 'symbol' ? findSymbol(lib, s.font, s.text) : undefined; },
      pick: (at) => this.chooseSymbol(at.group, at.index),
      move: (from, to) => this.moveSymbolTo(from, to),
      moveGroup: (from, to) => this.moveGroupTo(from, to),
      add: () => this.addSymbol(),
      edit: () => { if (this.symbolLib) editLibrary({ library: () => this.symbolLib!, change: (lib) => this.setLibrary(lib) }); },
    }, v, {
      color: (c) => this.panelColor('symbol', c),
      background: (b) => this.panelBackground('symbol', { shape: b }),
      backgroundColor: (c) => this.panelBackground('symbol', { color: c }),
    });
  }

  /** A font from the Text panel: the font of new text, of the text being typed, and of the selected text marking. */
  private setFont(id: string) {
    this.setSettings((s) => ({ ...s, text: { ...s.text, font: id } }));
    // The field takes the font once it has loaded, and the panel shows the field's.
    if (this.typing.open) void this.typing.setFont(id).then(() => this.syncBar(), (e) => { console.error(e); this.say('Could not change the font.'); });
    else if (this.selected?.mark.kind === 'text' && this.selected.mark.font !== id) {
      const sel = this.selected;
      void this.retext(sel, id, sel.mark.text);
    }
    this.syncBar();
  }

  /* ---------- typing ---------- */

  private select(s: Selected | undefined) {
    if (s) {
      this.selected = s;
      const owner = Object.values(this.tools).find((t) => t.ownsMarking?.(s.mark));
      if (owner) this.lend(owner.name);
    } else this.deselect();
    this.refreshSelection();
  }

  /** Shape typed text and store its glyphs; undefined, having said so, when that fails. */
  private async shaped(font: string, text: string) {
    try {
      const shaped = await shapeWith(font, text);
      await saveGlyphs(font, shaped.paths);
      return shaped;
    } catch (e) {
      console.error(e);
      this.say('Could not place the text.');
      return undefined;
    }
  }

  /** "Ag" shaped in a font, for the ghost; the font it was asked for, to ask once. */
  private ghostText: { font: string; glyphs: { gid: number; x: number; y: number }[]; capHeight: number } | undefined;
  private ghostFont: string | undefined;

  /** Shape "Ag" in the text font, once, so the ghost can show; it shows when this is done. */
  private prepareGhost() {
    const font = this.settings.text.font ?? ACADEMICO;
    if (this.ghostFont === font) return;
    this.ghostFont = font;
    this.ghostText = undefined;
    void (async () => {
      try {
        const [shaped, { capHeight }] = await Promise.all([shapeWith(font, 'Ag'), fontMetrics(font)]);
        await saveGlyphs(font, shaped.paths);
        if (this.ghostFont === font) this.ghostText = { font, glyphs: shaped.glyphs, capHeight };
      } catch (e) { console.error(e); }
    })();
  }

  /** What a press with Text shows under the finger: "Ag" where typing would start, in the text's size, font and background, its colour tinted towards the selection blue. */
  private textGhost(at: [number, number]): PlacedMark | undefined {
    const g = this.ghostText, t = this.settings.text;
    if (!g || g.font !== (t.font ?? ACADEMICO)) return undefined;
    const size = textSizeOf(this.state.score);
    const made = textMark(g.font, 'Ag', g.glyphs, [at[0], at[1] + (g.capHeight / 2) * size], size);
    if (!made) return undefined;
    const background = backgroundOf(t.background, t.backgroundColor);
    return { ...made, color: mix(ownColor(t.color) ?? markColors().color, '#1f6fe0', 0.25), ...(background ? { background } : {}) };
  }

  /** A tap with Text as the tool: start typing a new text marking with the middle of its capitals at `at`. */
  private newText(slot: FrameSlot, at: [number, number]) {
    this.select(undefined);
    const font = this.settings.text.font ?? ACADEMICO, size = textSizeOf(this.state.score);
    void (async () => {
      try {
        const { capHeight } = await fontMetrics(font);
        await this.typing.show({
          slot, font, size, color: ownColor(this.settings.text.color) ?? markColors().color,
          start: [at[0], at[1] + (capHeight / 2) * size],
          text: '',
          done: (text, typed) => void this.placeText(slot, typed, size, text, [at[0], at[1] + (capHeight / 2) * size]),
          cancel: () => {},
        });
      } catch (e) { console.error(e); this.say('Could not place the text.'); }
    })();
  }

  /** Typed text, shaped, stored and placed in the frame of `slot`, then selected. */
  private async placeText(slot: FrameSlot, font: string, size: number, text: string, start: [number, number]) {
    if (!text.trim()) return;
    const shaped = await this.shaped(font, text);
    const made = shaped && textMark(font, text, shaped.glyphs, start, size);
    if (!made) return;
    const t = this.settings.text, color = ownColor(t.color), background = backgroundOf(t.background, t.backgroundColor);
    const mark: PlacedMark = { ...made, ...(color ? { color } : {}), ...(background ? { background } : {}) };
    const claimed = claimMarking(slot.frame, compactMarking(mark), this.aspects);
    if (!claimed) return;
    const { cut, marking } = claimed, state = this.state;
    this.commit(setInk(state, cut.id, [...(state.ink[cut.id] ?? []), marking]), cut.id);
  }

  /** The slot showing the cut of a selected text marking, and the start of its baseline in that frame. */
  private textSite(sel: Selected): { slot: FrameSlot; start: [number, number] } | undefined {
    const slot = this.slots.find((sl) => sl.frame.items.some((i) => i.cut.id === sel.cut));
    const item = slot?.frame.items.find((i) => i.cut.id === sel.cut);
    if (!slot || !item) return undefined;
    const { mark } = sel, size = mark.size;
    const [cx, cy] = centreOnFrame(item, mark, this.aspects[item.cut.page]), [bx, by] = baselineStart(mark);
    return { slot, start: [cx + bx * size, cy + by * size] };
  }

  /** The selected text marking: open its field on it. */
  private editText(sel: Selected) {
    const site = this.textSite(sel);
    if (!site) return;
    const { slot, start } = site, { mark } = sel, size = mark.size;
    void (async () => {
      try {
        const font = (await fontChoices()).some((c) => c.id === mark.font) ? mark.font : ACADEMICO;
        // Without the marking while its field is open.
        this.paintInk(slot, replaceMarking(this.state, sel.cut, sel.mark));
        await this.typing.show({
          slot, font, size, color: mark.color ?? markColors().color, start, text: mark.text,
          done: (text, typed) => void this.retext(sel, typed, text),
          cancel: () => { this.paintInk(slot, this.state); this.select(sel); },
        });
      } catch (e) {
        console.error(e);
        this.say('Could not place the text.');
        this.paintInk(slot, this.state);
        this.select(sel);
      }
    })();
  }

  /** The field on `sel` closed with `text`: change the marking, delete it when there is no ink, or leave it. */
  private async retext(sel: Selected, font: string, text: string) {
    const site = this.textSite(sel);
    if (!site) return;
    const { slot, start } = site;
    const state = this.state, { mark } = sel;
    const restore = () => { this.paintInk(slot, this.state); this.select(sel); };
    if (!state.ink[sel.cut]?.includes(mark)) { this.paintInk(slot, state); return; }
    if (text === mark.text && font === mark.font) { restore(); return; }
    const shaped = text.trim() ? await this.shaped(font, text) : undefined;
    if (text.trim() && !shaped) { restore(); return; }
    const next = shaped && textMark(font, text, shaped.glyphs, start, mark.size);
    if (!next) { this.commit(replaceMarking(state, sel.cut, mark), sel.cut); return; }
    const moved = movedTo(state, slot.frame, sel, next.at, this.aspects, next.size, { text, font, glyphs: next.glyphs });
    this.commit(moved.state, moved.selected.cut, moved.selected);
    this.select(moved.selected);
  }

  /** The selected marking's delete button: take it away, as one undo step. */
  private deleteSelected() {
    const sel = this.selected;
    if (sel) this.commit(replaceMarking(this.state, sel.cut, sel.mark), sel.cut);
  }

  /** Tell the tools what is selected: a selection ends when its marking is gone from the state. */
  private refreshSelection() {
    const sel = this.selected, cur = this.current;
    if (sel && (!cur || !cur.state.ink[sel.cut]?.includes(sel.mark))) this.deselect();
    this.selectionChanged();
    if (cur) this.syncBar();
  }

  /**
   * The Symbols button: the last symbol picked becomes the tool, or, when a symbol is the tool,
   * the tool is put away. The library is made the first time.
   */
  private async symbols() {
    if (this.tool === 'symbol') { this.useTool('hand'); this.syncBar(); return; }
    if (!await this.ensureLibrary()) return;
    const at = lastSymbol(this.symbolLib!, this.group, this.currents, this.adhocCurrent);
    if (at) this.chooseSymbol(at.group, at.index);
    else this.syncBar();
  }

  private currentOf(group: number): number {
    return group < 0 ? this.adhocCurrent : this.currents[group] ?? 0;
  }

  private setCurrent(group: number, index: number) {
    if (group < 0) this.adhocCurrent = index;
    else this.currents[group] = index;
  }

  /** A selected symbol was cycled to `sym`: with Symbols as the tool (not lent by the selection), it is the tool's symbol now. */
  private cycledTo(sym: LibrarySymbol) {
    const at = this.tool === 'symbol' && !this.stack.has('selection') && this.symbolLib && findSymbol(this.symbolLib, sym.font, sym.text);
    if (!at) return;
    this.group = at.group;
    this.setCurrent(at.group, at.index);
    this.syncBar();
  }

  /** A symbol picked in the Symbols panel, or placed through +: current, and the tool. */
  private chooseSymbol(i: number, j: number) {
    this.setCurrent(i, j);
    this.useTool('symbol');
    this.group = i;
    this.syncBar();
  }

  /**
   * Change the library: saved, kept, and shown. Every change goes through here. Each group's current
   * symbol stays in its group (the first when its place is gone), and the last group used, when it
   * is gone or empty, falls to the first group with symbols; the symbol tool goes if there is none.
   */
  setLibrary(lib: SymbolLibrary) {
    this.symbolLib = lib;
    void saveLibrary(lib).catch((e) => { console.error(e); this.say('Could not save the symbols.'); });
    const clamp = (n: number, size: number) => (n < size ? n : 0);
    this.currents = lib.groups.map((g, i) => clamp(this.currents[i] ?? 0, g.symbols.length));
    this.adhocCurrent = clamp(this.adhocCurrent, lib.adhoc.length);
    if (!symbolsOf(lib, this.group).length) {
      const first = [...lib.groups.keys(), -1].find((g) => symbolsOf(lib, g).length);
      if (first === undefined) { if (this.tool === 'symbol') this.stack.equip('hand'); }
      else { this.group = first; this.setCurrent(first, 0); }
    }
    this.syncBar();
  }

  /** + in the second row: pick glyphs, and make them the tool, among the ad-hoc symbols unless the library has them. */
  private addSymbol() {
    const dialog = showDialog('Place a symbol', 'glyph-picker');
    glyphPicker(dialog, {
      font: this.pickerFont,
      text: '',
      okLabel: 'Place',
      cancel: () => closeOverlay(),
      done: (font, text) => {
        closeOverlay();
        this.pickerFont = font;
        void (async () => {
          try {
            const sym = await makeSymbol(font, text, 1);
            const lib = this.symbolLib;
            if (!lib) return;
            const at = findSymbol(lib, font, text);
            if (at && at.group >= 0) this.chooseSymbol(at.group, at.index);
            else {
              this.setLibrary(addAdhoc(lib, sym));
              this.chooseSymbol(-1, 0);
            }
          } catch (e) { console.error(e); this.say('Could not make the symbol.'); }
        })();
      },
    });
  }

  /**
   * A symbol dragged in the Symbols panel. The tool's symbol stays the tool wherever it goes, and
   * each group's current symbol stays current in whichever group it is in now.
   */
  private moveSymbolTo(from: SymbolAt, to: SymbolAt | 'new') {
    const lib = this.symbolLib;
    if (!lib) return;
    const key = (s: LibrarySymbol) => `${s.font}|${s.text}`;
    const tool = this.pickedSymbol();
    const currentKeys = new Set([...lib.groups.keys(), -1].flatMap((g) => { const s = symbolsOf(lib, g)[this.currentOf(g)]; return s ? [key(s)] : []; }));
    const next = moveSymbol(lib, from, to);
    const currentIn = (g: number) => Math.max(0, symbolsOf(next, g).findIndex((s) => currentKeys.has(key(s))));
    this.currents = next.groups.map((_, g) => currentIn(g));
    this.adhocCurrent = currentIn(-1);
    const at = tool && findSymbol(next, tool.font, tool.text);
    if (at) this.group = at.group;
    this.setLibrary(next);
  }

  /** A group of the Symbols panel moved to `to`: each group keeps its current symbol, and the tool its group. */
  private moveGroupTo(from: number, to: number) {
    const lib = this.symbolLib;
    if (!lib || !lib.groups[from] || to < 0 || to >= lib.groups.length) return;
    const r = reorderedCurrents(this.currents, this.group, from, to);
    this.currents = r.currents;
    this.group = r.group;
    this.setLibrary(moveGroup(lib, from, to));
  }

  /** The symbol the Symbols button pictures: the selected symbol's, else the last one picked. */
  private buttonSymbol(): LibrarySymbol | undefined {
    const m = this.selectedOf('symbol')?.mark;
    if (!m) return this.pickedSymbol();
    const lib = this.symbolLib, at = lib && findSymbol(lib, m.font, m.text);
    return lib && at ? symbolsOf(lib, at.group)[at.index] : { font: m.font, text: m.text, scale: 1, glyphs: m.glyphs.map((g) => [...g]) };
  }

  /** The last symbol picked; none before the library has symbols. */
  private pickedSymbol(): LibrarySymbol | undefined {
    const lib = this.symbolLib, at = lib && lastSymbol(lib, this.group, this.currents, this.adhocCurrent);
    return lib && at ? symbolsOf(lib, at.group)[at.index] : undefined;
  }

  private syncBar() {
    const cur = this.current;
    if (this.tool === 'text') this.prepareGhost();
    // Until Text and Symbols set their own, the reader sets their faces.
    this.setFace('text', textFace(this.lookOf('text')));
    this.setFace('symbol', symbolFace(this.buttonSymbol(), this.lookOf('symbol')));
    for (const t of Object.values(this.tools ?? {})) t.onSettingsChanged?.();
    this.showLayers();
    this.toolbar.sync({
      open: !!cur,
      tool: this.tool,
      cuts: this.editor.enabled,
      canUndo: this.undos.canUndo,
      canRedo: this.undos.canRedo,
    });
    this.scope.hidden = this.reading.what.kind === 'score' || !this.editor.enabled;
    this.root.classList.toggle('writing', this.tool !== 'hand');
    this.root.classList.toggle('editing', this.editor.enabled);
    this.root.style.setProperty('--bar-h', this.toolbar.el.offsetHeight + 'px');
    // The toolbar growing lowers the smallest zoom; shrinking it leaves the smallest zoom be.
    if (this.annotating) this.minScale = Math.min(this.minScale, fitScale(this.view()));
  }

  /** The toolbar showing means annotation mode: zooming and writing are available. */
  private get annotating() { return !this.root.classList.contains('chrome-hidden'); }

  private showChrome(show: boolean) {
    this.root.classList.toggle('chrome-hidden', !show);
    if (!show) { this.minScale = 1; this.setZoom(NO_ZOOM); }
    else this.syncBar();
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

  /**
   * Show the screen. `turned`, from a tap that turned to it: a screen that can't be shown at all
   * without access to the scores folder asks for it then. Otherwise only the toolbar asks.
   * `place`: a new screen is placed fresh (see placeFresh); 'keep' leaves the spread where it is.
   */
  private async show({ turned = false, place = 'fresh' }: { turned?: boolean; place?: 'keep' | 'fresh' } = {}) {
    const seq = ++this.seq; // a newer show() (turn, resize, edit) supersedes this one
    this.typing.finish(); // its slot is about to go
    this.ahead.abort();
    this.ahead = new AbortController();
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    if (!W || !H || this.loading) return;
    this.showTitle();
    const it = this.items[this.k];
    if (!this.current?.draw) {
      // A score that can't be opened: say so, and carry on with the next one.
      this.showUnread(it.title, it.needsAccess ? 'access' : 'missing', W, H, turned, place);
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
      if (e instanceof NoAccess || e instanceof NotSaved) { this.showUnread(it.title, it.fileGone ? 'unsaved' : 'access', W, H, turned, place); return; }
      this.toolbar.info.textContent = 'Could not draw this page';
      console.error(e);
      return;
    }
    if (seq !== this.seq) {
      for (const it of drawing) void it.return?.().catch(() => {});
      return;
    }
    if (this.askingAccess) { this.askingAccess = false; this.toast.hide(); }
    // Full screen missed as the reader opened (access took long to allow): asked for again by a turn
    // that shows its screen, not before, as asking for access needs the turn's tap more.
    if (turned && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
    this.pages = new Map([...widths.keys()].map((p, i) => [p, first[i].canvas]));

    // In a setlist each score starts on a fresh screen, so a score's last screen may have room left.
    const extra = this.reading.setlistId && on.length < wanted ? [this.blank()] : [];
    this.slots = placeSlots(on, this.frame, W, H, scale, extra);
    for (const s of this.slots) this.paint(s, this.state);
    this.spreadEl.replaceChildren(...this.slots.map((s) => s.box), ...extra);
    if (place === 'fresh') this.placeFresh();
    this.decorate();
    this.drawChromes();
    this.refreshSelection();
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
   * which Volti may not read until access is allowed, offered from a tap (and asked for at once when
   * `turned` to); or (`unsaved`) a gone file whose saved pages don't include this screen's.
   */
  private showUnread(title: string, why: Unread, W: number, H: number, turned = false, place: 'keep' | 'fresh' = 'fresh') {
    this.slots = [];
    this.shown = 1;
    const boxes = [blankBox(undefined, { title, why }), ...(framesOnScreen(A4, W, H) === 2 ? [this.blank()] : [])];
    placeBoxes(boxes, boxes.map(() => A4), W, H, dpr());
    this.spreadEl.replaceChildren(...boxes);
    if (place === 'fresh') this.placeFresh();
    this.toolbar.info.textContent = { access: 'Needs access', missing: 'Missing', unsaved: 'Not saved' }[why];
    this.showCard();
    // Offered until the screen shows something else, as the page can't be read without it.
    if (why === 'access') {
      this.toast.say('Volti needs access to the scores folder to show this.', ['Allow access', () => void this.allowAccess()], true);
      this.askingAccess = true;
      if (turned) void this.allowAccess();
    } else this.saveSpot(undefined);
  }

  /** Whether the score read can be read from its PDF, or couldn't be as access to the scores folder isn't allowed. */
  private async readable(): Promise<boolean> {
    if (this.items[this.k]?.needsAccess) return false;
    const cur = this.current;
    return !cur?.draw || !!cur.readable;
  }

  /**
   * When the score read couldn't be read from its PDF for want of access to the scores folder, ask
   * for it, from a tap: then read the scores from their PDFs, and show the screen again. False,
   * having said why, when it isn't allowed.
   */
  private async allowAccess(): Promise<boolean> {
    if (this.items[this.k]?.fileGone) {
      this.say('The file for this score is gone, so only its saved pages can be shown.');
      return false;
    }
    if (await this.readable()) return true;
    const at = this.slots[0]?.frame.items[0]?.cut.id;
    await unlockFolder().catch(() => false);
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
    if (t.to !== 'score') this.deselect();
    if (t.to === 'frame') {
      this.frame = t.frame;
      this.syncBar();
      void this.show({ turned: true });
    } else if (t.to === 'item') {
      this.syncBar();
      void this.goTo(t.k, t.at, true);
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
      const { draw, drawProgressive, aspects, readable, close } = await openPages(o.id, o, true, true);
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
      void this.show({ place: 'keep' });
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
   * `selected` is the selected marking as it is in `s`, when the edit replaced it: it stays
   * selected, and a tool it lent stays lent.
   */
  private commit(s: State, focus?: string, selected?: Selected) {
    const cur = this.current!;
    if (selected) this.selected = selected;
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
      this.refreshSelection();
      return;
    }
    const sameScreen = target === this.frame;
    this.frame = Math.min(target, Math.max(0, this.frames.length - 1));
    void this.show({ place: sameScreen ? 'keep' : 'fresh' });
  }

  /** The eraser took strokes away: show and save them gone, but leave the undo step until it lifts. */
  private showState(s: State, slot: FrameSlot) {
    this.current!.state = s;
    this.saver.soon(this.current);
    this.paintInk(slot, s);
  }

  /** One undo step for the whole sweep of the eraser. */
  private undoTo(before: State, slot: FrameSlot) {
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

  /** The part of the stage below the toolbar, which the spread is moved within. */
  private view(): View {
    return { top: this.annotating ? this.toolbar.el.offsetHeight : 0, W: this.stage.clientWidth, H: this.stage.clientHeight };
  }

  /** A new screen: whole below the toolbar and centred while it shows, at full size otherwise. */
  private placeFresh() {
    this.setZoom(this.annotating ? placeFresh(this.view()) : NO_ZOOM);
  }

  private setZoom(z: Zoom) {
    this.zoom = z;
    this.spreadEl.style.transform = !isIdentity(z) ? `translate(${z.x}px, ${z.y}px) scale(${z.s})` : '';
    this.drawChromes();
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
    this.typing.finish();
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
    if (this.themeBefore === undefined) delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = this.themeBefore;
    this.onClose(this.fileChanges);
  }
}
