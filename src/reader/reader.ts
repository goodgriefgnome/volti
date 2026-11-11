// The centre of the score screen: the frames on the screen, turning pages and scores, taking edits
// (commit, undo, redo), and opening and closing. It joins the other reader files together: what is
// read, and how edits carry to setlists, is _reading.ts; the toolbar's menus and dialogs are
// _toolbar-menus.ts. Code that can stand on its own goes in one of them.

import { ends } from '../scores/excerpts';
import { type Marking } from '../markings/model';
import { folderState, unlockFolder } from '../originals/linked-folder';
import { knownTitles } from '../originals/library-files';
import { NoAccess, type SourceFile } from '../originals/types';
import { canvasesOf } from '../page-cache/cache';
import { NotSaved, type Drawn } from '../page-cache/types';
import { titleOf } from '../originals/path-utils';
import { framesOnScreen } from '../render/layout';
import { fitScale, isIdentity, NO_ZOOM, placeFresh, type View, type Zoom } from '../render/zoom';
import { pageWidths, screenAt } from '../render/screen';
import { type Hatches } from '../render/paint';
import { replaceMarking } from '../scores/edits';
import { shows } from '../scores/ownership';
import { setThisTimeOnly, type Selected } from '../scores/placing';
import { A4, type Aspects, type Cut, type NamedExcerpt, type State } from '../scores/model';
import { frameOf, pack, type Frame } from '../scores/frames';
import { loadScore } from '../scores/store';
import { loadSetlists } from '../setlists/store';
import { type Setlist } from '../setlists/model';
import { closeOverlay } from '../ui/overlay';
import { loadToolSettings, saveToolSettings } from '../markings/store';
import { buttonState } from '../face/button-state';
import { openFaceGestures } from '../face/dialog';
import { faceButton, type FaceButton } from '../face/face-button';
import { activeOf, hasGestures, NO_GESTURES, type FaceSettings } from '../face/gestures';
import { loadFaceSettings } from '../face/store';
import { FaceWatcher, type CameraStatus } from '../face/watcher';
import { DEFAULT_TOOL_SETTINGS, type ToolSettings } from '../markings/tool-settings';
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
import { LendStack, type StackChange } from './_lending';
import { blankBox, ScoreCard, showSetlistTitle, type Unread } from './_setlist';
import { paintSlot, paintSlotInk, placeBoxes, placeSlots, type FrameSlot } from './_spread';
import { Loupe } from './_loupe';
import { backIcon, Toolbar, turnIcon } from './_toolbar';
import { ReaderMenus } from './_toolbar-menus';
import { offerScore, turnFrom, type Offer } from './_turning';
import { gateTurn, type TurnGate } from './_turn-gate';
import { nextWatching, type WatchEvent, type Watching } from './_face-watch';
import { makeTools } from './tools/_tools';
import type { ButtonFace, HandHost, Tool, ToolName } from './tools/_tool';
import { resumeAt, type LastRead } from './_last-read';
import { loadLastRead, saveLastRead } from './_store';
import type { ReaderView } from './_view';
import { failed, failedOnce, showFailuresWith } from '../ui/failure';

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
export async function openReader(what: ToRead, onClose: () => void, fullscreen?: Promise<void>): Promise<void> {
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
  /** The gate every page turn goes through (_turn-gate.ts). */
  private turnGate: TurnGate = {};
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
  private stack = new LendStack<ToolName>('hand');
  /** The tools' being told of the stack's changes, in order. */
  private told: Promise<void> = Promise.resolve();
  /** The tools, made for this reader. */
  private tools!: Record<ToolName, Tool>;
  /** What each tool's button shows, as the tool last set it. */
  private faces = new Map<ToolName, ButtonFace>();
  /** The tool in use: the one on top of the stack. */
  private get tool(): ToolName { return this.stack.active; }
  /** Each tool's settings for new markings; kept across restarts. */
  private settings: ToolSettings = DEFAULT_TOOL_SETTINGS;
  /** Face gestures: their settings, whether the camera is being watched, what it says, and the button. */
  private faceSettings: FaceSettings = NO_GESTURES;
  private watching: Watching = 'off';
  private camera: CameraStatus = 'stopped';
  private faceSeen = false;
  private face: FaceWatcher;
  private faceButton: FaceButton;
  /** The placed marking showing its box, while a symbol is the tool. */
  private selected: Selected | undefined;
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
  /** The score offered by turning past this one's end: turning that way again while it is offered opens it. */
  private offered: Offer | null = null;

  constructor(
    items: Item[],
    what: ReadingKind,
    setlists: readonly Setlist[],
    first: OpenScore | null,
    k: number,
    position: string | undefined,
    private onClose: () => void,
    /** The library's scores; in a score's own reader, in the library's order, to turn to. */
    private library: readonly SourceFile[] = [],
    /** Full screen already asked for at the tap, if it was; the first screen is drawn once it settles. */
    fullscreen?: Promise<void>,
  ) {
    this.reading = new Reading(items, what, setlists);
    this.stopShowingFailures = showFailuresWith((t) => this.say(t));
    this.scores = new OpenScores(items, first);
    this.saver = new Saver(() => this.reading.setlists, setlists, (e) => this.say(`${failed('save your changes', e)} Volti keeps trying.`));
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
      paintState: (slot, s) => this.paintInk(slot, s),
      selected: () => this.selected,
      select: (s) => this.select(s),
      delete: () => this.deleteSelected(),
      setThisTimeOnly: (on) => this.setThisTimeOnly(on),
      settings: () => this.settings,
      setSettings: (change) => this.setSettings(change),
      say: (t) => this.say(t),
      setZoom: (z) => this.setZoom(z),
      view: () => this.view(),
      minScale: () => this.minScale,
      annotating: () => this.annotating,
      act: (g) => this.act(g),
      paintInk: (slot, extra) => this.paintInk(slot, this.state, extra),
      commit: (s, focus, selected) => this.commit(s, focus, selected),
      show: (s, slot) => this.showState(s, slot),
      undoTo: (before, slot) => this.undoTo(before, slot),
      lendForPress: (tool) => { this.tell(this.stack.lend(tool, 'press')); this.refreshSelection(); },
      endPressLend: () => { this.tell(this.stack.end('press')); this.refreshSelection(); },
      unequip: () => { this.useTool('hand'); this.syncBar(); },
      lift: (px) => { this.stage.style.translate = px ? `0 -${px}px` : ''; },
      toggleToolbar: () => this.act('toggleChrome'),
      cutsOn: () => this.editor.enabled,
      cutMenu: (p) => this.editor.menuAt(p.x, p.y),
      loupe: () => this.loupe,
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
      tool: (t) => this.setTool(t),
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
    });
    this.syncBar();
    void loadToolSettings().then((s) => { this.settings = s; this.syncBar(); }, (e) => failedOnce("load the tools' settings", e));
    this.stage.append(this.spreadEl);
    this.scope.hidden = true;
    // While the toolbar is hidden, a button at the top right watches the front camera for face gestures.
    this.faceButton = faceButton({
      tap: () => {
        if (hasGestures(this.faceSettings)) this.watchEvent({ kind: 'tap', available: true });
        else this.openFaceSettings();
      },
      longPress: () => this.openFaceSettings(),
    });
    this.face = new FaceWatcher({
      status: (s) => { this.camera = s; this.showFaceButton(); },
      face: (seen) => { this.faceSeen = seen; this.showFaceButton(); },
      progress: (p) => this.faceButton.progress(p),
      turn: (dir) => { if (this.act(dir)) this.faceButton.pulse(); },
      failed: (e) => {
        this.watchEvent({ kind: 'cameraFailed' });
        this.say(failed('start the camera', e));
      },
    }, activeOf(this.faceSettings));
    this.showFaceButton();
    void loadFaceSettings().then((s) => {
      this.faceSettings = s;
      this.face.setGestures(activeOf(s));
      this.showFaceButton();
    }, (e) => failedOnce("load the face gestures' settings", e));
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
    this.root.append(this.stage, ...bands, back, this.faceButton.el, this.toolbar.el, this.scope, this.toast.el);
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
  private useTool(t: ToolName) {
    if (t !== this.tool) {
      this.tell(this.stack.equip(t));
      this.deselect();
    }
  }

  /** Tell the tools what the change to the stack did: each is told in turn, waiting for the one before, and then the new tool draws its chrome. */
  private tell(change: StackChange<ToolName>) {
    if (!change.unequipped.length && !change.equipped.length) return;
    this.told = this.told.then(async () => {
      for (const t of change.unequipped) await this.tools[t].onUnequipped?.();
      for (const t of change.equipped) { await this.tools[t].onEquipped?.(); this.tools[t].drawChrome?.(); }
    }).catch((e) => failedOnce('switch tools', e));
  }

  /** End the selection and hide its box; the tool its marking lent, if any, goes back to what it was. The caller shows the toolbar. */
  private deselect() {
    this.tell(this.stack.end('selection'));
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
    this.tell(this.stack.lend(kind, 'selection'));
  }

  /** A long press on a tool's button makes it the tool, if it isn't; when it is, the press leaves it be. */
  private chooseOnLongPress(tool: ToolName) {
    if (this.tool === tool) return;
    this.useTool(tool);
    this.syncBar();
  }

  /** A long press on a tool's button: it becomes the tool, and its panel shows under the button. */
  private panel(tool: Exclude<ToolName, 'hand'>) {
    this.chooseOnLongPress(tool);
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
    saveToolSettings(this.settings).catch((e) => this.say(failed("save the tools' settings", e)));
    this.syncBar();
  }

  /* ---------- the selection ---------- */

  private select(s: Selected | undefined) {
    if (s) {
      this.selected = s;
      const owner = Object.values(this.tools).find((t) => t.ownsMarking?.(s.mark));
      if (owner) this.lend(owner.name);
    } else this.deselect();
    this.refreshSelection();
  }

  /** The selected marking's delete button: take it away, as one undo step. */
  private deleteSelected() {
    const sel = this.selected;
    if (sel) this.commit(replaceMarking(this.state, sel.page, sel.mark), sel.cut);
  }

  /** The selected marking's "This time only": its cut's pass (on) or none (off), as one undo step; it stays selected. */
  private setThisTimeOnly(on: boolean) {
    const sel = this.selected;
    if (!sel) return;
    const { state, selected } = setThisTimeOnly(this.state, sel, on);
    this.commit(state, sel.cut, selected);
  }

  /**
   * Tell the tools what is selected: a selection ends when its marking is gone from its page's ink,
   * or the cut it was chosen in is no longer played or no longer shows it.
   */
  private refreshSelection() {
    const sel = this.selected, cur = this.current;
    const cut = sel && cur?.state.score.cuts.find((c) => c.id === sel.cut);
    if (sel && (!cur || !cut || !cur.state.ink[sel.page]?.includes(sel.mark) || !shows(cut, sel.mark))) this.deselect();
    this.selectionChanged();
    if (cur) this.syncBar();
  }

  private syncBar() {
    const cur = this.current;
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
    else {
      this.watchEvent({ kind: 'toolbarShown' });
      this.syncBar();
    }
  }

  /** Tell the face watch what happened; start or stop the camera as it says, and show the button. */
  private watchEvent(e: WatchEvent): void {
    const was = this.watching;
    this.watching = nextWatching(was, e);
    if (this.watching !== was) {
      if (this.watching === 'on') void this.face.start();
      else {
        this.face.stop();
        this.faceButton.progress();
      }
    }
    this.showFaceButton();
  }

  private showFaceButton() {
    this.faceButton.show(buttonState({ available: hasGestures(this.faceSettings), watching: this.watching, camera: this.camera, faceSeen: this.faceSeen }));
  }

  /** Open the Face gestures dialog; watching stops while it is open. */
  private openFaceSettings() {
    this.watchEvent({ kind: 'settingsOpened' });
    openFaceGestures(() => {
      void loadFaceSettings().then((s) => {
        this.faceSettings = s;
        this.face.setGestures(activeOf(s));
        this.watchEvent({ kind: 'gesturesChanged', available: hasGestures(s) });
      }, (e) => failedOnce("load the face gestures' settings", e));
    });
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
      this.toolbar.info.textContent = failed('draw this page', e);
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
      this.toolbar.info.textContent = failed('draw this page', e);
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
    if (!(await this.readable())) {
      const folder = await folderState();
      this.say(folder.kind !== 'none' && folder.place === 'drive'
        ? 'Sign in to Google Drive from the library to read this score.'
        : 'Volti can’t read the scores folder without access.');
      return false;
    }
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
    const save = (last: LastRead) => void saveLastRead(last).catch((e) => failedOnce('save where this was read', e));
    if (what.kind === 'setlist') {
      if (item.entryId) save({ kind: 'setlist', id: what.id, entry: item.entryId, cut });
    } else save({ kind: 'excerpt', id: item.scoreId, ...(what.kind === 'excerpt' ? ends(what.excerpt) : {}), cut });
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
      this.say(failed('open', e, titleOf(o.path)));
      return;
    }
    this.scores.adopt(open);
    this.reading.turnTo({ scoreId: o.id, title: titleOf(o.path), original: o });
    this.loading = false;
    await this.goTo(0, dir > 0 ? 'first' : 'last');
  }

  /** Do what a gesture asks; whether a page turn went through the gate (which drops one too soon after the last). */
  private act(g: Gesture): boolean {
    if (g === 'next' || g === 'prev') {
      const { gate, pass } = gateTurn(this.turnGate, performance.now());
      this.turnGate = gate;
      if (!pass) return false;
      this.turn(g === 'next' ? 1 : -1);
      return true;
    }
    this.showChrome(!this.annotating);
    return false;
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
    else {
      this.watchEvent({ kind: 'pageHidden' });
      void this.saver.flush().catch(() => {});
    }
  };

  /** Failures of what happens in the background show through `say` while the reader is open. */
  private stopShowingFailures: () => void;

  private onPop = () => void this.close();

  /** Going back failed to save the changes: the next Back leaves without them. */
  private leaveUnsaved = false;

  private async close() {
    // Every tool on the stack is unequipped: Text finishes typing.
    this.tell(this.stack.equip('hand'));
    await this.told;
    closeOverlay();
    this.editor.dismiss();
    if (!(await this.savedForClosing())) return;
    this.scores.closed = true;
    this.stopShowingFailures();
    window.removeEventListener('popstate', this.onPop);
    this.watchEvent({ kind: 'readerClosed' });
    this.face.stop();
    this.input.detach();
    document.removeEventListener('visibilitychange', this.onVisible);
    this.observer.disconnect();
    this.detail.stop();
    this.seq++;
    this.ahead.abort();
    this.card.stop();
    void this.wake?.release().catch(() => {});
    // Leaving full screen settles before the library is shown, so it doesn't undo the library's scroll.
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    this.scores.destroy();
    this.root.remove();
    document.body.classList.remove('reading');
    if (this.themeBefore === undefined) delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = this.themeBefore;
    this.onClose();
  }

  /**
   * Write the changes before closing. When that fails the reader stays open, Back being put back,
   * and says so: Try again goes back again, and so does Back, which leaves even when that fails too.
   */
  private async savedForClosing(): Promise<boolean> {
    try {
      await this.saver.flush();
      return true;
    } catch {
      if (this.leaveUnsaved) {
        this.saver.stop();
        return true;
      }
      this.leaveUnsaved = true;
      history.pushState({ reader: true }, '');
      this.toast.say('Could not save your changes. Back leaves without them.', ['Try again', () => { this.leaveUnsaved = false; history.back(); }], true);
      return false;
    }
  }
}
