// The centre of the score screen: the frames on the screen, turning pages and scores, taking edits
// (commit, undo, redo), and opening and closing. It joins the other reader files together: what is
// read, and how edits carry to setlists, is _reading.ts; the toolbar's menus and dialogs are
// _toolbar-menus.ts. Code that can stand on its own goes in one of them.

import { ends } from '../scores/excerpts';
import { folderStatus, unlockFolder } from '../originals/linked-folder';
import { knownTitles } from '../originals/library-files';
import type { SourceFile } from '../originals/types';
import { canvasesOf } from '../page-cache/cache';
import { titleOf } from '../originals/path-utils';
import { type Hatches } from '../render/draw';
import { type Aspects, type NamedExcerpt, type State } from '../scores/model';
import type { Frame } from '../scores/frames';
import { loadScore } from '../scores/store';
import { loadSetlists } from '../setlists/store';
import { type Setlist } from '../setlists/model';
import { closeOverlay } from '../ui/overlay';
import { buttonStatus } from '../face/button-status';
import { openFaceGestures } from '../dialogs/face-gestures';
import { faceButton, type FaceButton } from '../face/face-button';
import { activeOf, hasGestures, NO_GESTURES, type FaceSettings } from '../face/gestures';
import { loadFaceSettings } from '../face/store';
import { FaceWatcher, type CameraStatus } from '../face/watcher';
import { BACK, dpr, el, icon } from '../ui/dom';
import { Toast } from '../ui/toast';
import { CutEditor } from './_cuts/_editor';
import { CloseUp } from './_close-up';
import type { Gesture } from './_gestures';
import { Input } from './_input';
import { OpenScores, openPages, type DrawPage, type DrawProgressive, type Item, type OpenScore } from './_open-scores';
import { Reading, setlistItems, type ReadingKind } from './_reading';
import { Changes } from './_changes';
import { Pager } from './_pager';
import { Screen } from './_screen';
import { StageZoom } from './_stage-zoom';
import { ToolDesk, type DeskBase } from './_tool-desk';
import { ScoreCard, showSetlistTitle } from './_setlist';
import { Loupe } from './_loupe';
import { Toolbar, turnIcon } from './_toolbar';
import { ReaderMenus } from './_toolbar-menus';
import { gateTurn, type TurnGate } from './_turn-gate';
import { nextWatching, type WatchEvent, type Watching } from './_face-watch';
import { resumeAt } from './_last-read';
import { loadLastRead } from './_store';
import type { ReaderView } from './_view';
import { failed, failedOnce, showFailuresWith } from '../ui/failure';

/** What the reader opens: a score on its own, a named excerpt of one, or a setlist. */
export type ToRead =
  /** A score, with the library's scores in its order, to turn to past this one's ends. */
  | { kind: 'score'; original: SourceFile; library: readonly SourceFile[] }
  | { kind: 'excerpt'; original: SourceFile; excerpt: NamedExcerpt }
  | { kind: 'setlist'; setlistId: string; originals: readonly SourceFile[]; startEntry?: string };

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
  private screenEl = el('div', 'screen');
  private scope = el('p', 'note scope', 'Cuts changed here change the score, in every setlist');
  private toast = new Toast();
  /** The gate every page turn goes through (_turn-gate.ts). */
  private turnGate: TurnGate = {};
  private toolbar: Toolbar;

  private scores: OpenScores;
  private card = new ScoreCard(this.root);
  private screen: Screen;
  private pager: Pager;

  private zoomer: StageZoom;
  private closeUp: CloseUp;

  private desk: ToolDesk;
  /** Face gestures: their settings, whether the camera is being watched, what it says, and the button. */
  private faceSettings: FaceSettings = NO_GESTURES;
  private watching: Watching = 'off';
  private camera: CameraStatus = 'stopped';
  private faceSeen = false;
  private face: FaceWatcher;
  private faceButton: FaceButton;
  private loupe: Loupe;
  private changes: Changes;
  private editor: CutEditor;
  private input: Input;

  private wake: WakeLockSentinel | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;
  private observer = new ResizeObserver(() => {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => void this.screen.show(), 150);
  });

  private barObserver = new ResizeObserver(() => this.barResized());

  private reading: Reading;
  private menus: ReaderMenus;
  /** Scores' files renamed, moved or removed here, for the library to show on going back. */

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
    this.zoomer = new StageZoom({
      stage: this.stage,
      screen: this.screenEl,
      annotating: () => this.annotating,
      barHeight: () => this.toolbar.el.offsetHeight,
      changed: () => { this.desk.drawChromes(); this.syncBar(); this.closeUp.update(); },
    });
    this.screen = new Screen({
      stage: this.stage,
      screen: this.screenEl,
      toast: this.toast,
      item: () => this.items[this.pager.k],
      current: () => this.current,
      frames: () => this.pager.frames,
      frame: () => this.pager.frame,
      setFrame: (f) => { this.pager.frame = f; },
      loading: () => this.pager.loading,
      inSetlist: () => !!this.reading.setlistId,
      nextTitle: () => this.items[this.pager.k + 1]?.title,
      next: async () => {
        if (this.pager.k + 1 >= this.items.length) return null;
        const cur = await this.scores.ensure(this.pager.k + 1);
        return cur?.draw ? { draw: cur.draw, frames: this.pager.framesFor(this.pager.k + 1) } : null;
      },
      info: (text) => { this.toolbar.info.textContent = text; },
      title: () => this.showTitle(),
      showed: (first, info) => {
        this.decorate();
        this.desk.drawChromes();
        this.desk.refreshSelection();
        this.toolbar.info.textContent = info;
        this.showCard();
        this.pager.saveSpot(first);
      },
      showedUnread: (info) => {
        this.toolbar.info.textContent = info;
        this.showCard();
      },
      allowAccess: () => this.allowAccess(),
    }, this.zoomer);
    const view: ReaderView = {
      stage: this.stage,
      aspects: () => this.aspects,
      draw: () => this.draw,
      drawProgressive: () => this.drawProgressive,
      state: () => this.state,
      frames: () => this.pager.frames,
      slots: () => this.screen.slots,
      zoom: () => this.zoomer.zoom,
    };
    this.editor = new CutEditor({
      ...view,
      commit: (s, focus) => this.changes.commit(s, focus),
      preview: (s, frames, hatches) => this.preview(s, frames, hatches),
      thumbnails: (page, w) => canvasesOf(this.drawProgressive(page + 1, Math.round(w * dpr()))),
      cancelGesture: () => this.input.cancelGesture(),
      say: (t) => this.say(t),
      changed: () => this.syncBar(),
    });
    this.closeUp = new CloseUp(view);
    this.loupe = new Loupe(this.root, view);
    const base: DeskBase = {
      ...view,
      editor: this.editor,
      drawState: (slot, s) => this.screen.drawInk(slot, s),
      say: (t) => this.say(t),
      setZoom: (z) => this.zoomer.set(z),
      view: () => this.zoomer.view(),
      minScale: () => this.zoomer.minScale,
      annotating: () => this.annotating,
      act: (g) => this.act(g),
      drawInk: (slot, extra) => this.screen.drawInk(slot, this.state, extra),
      commit: (s, focus, selected) => {
        if (selected) this.desk.keepSelected(selected);
        this.changes.commit(s, focus);
      },
      show: (s, slot) => this.changes.showSweep(s, slot),
      undoTo: (before, slot) => this.changes.endSweep(before, slot),
      lift: (px) => { this.stage.style.translate = px ? `0 -${px}px` : ''; },
      toggleToolbar: () => this.act('toggleChrome'),
      cutsOn: () => this.editor.enabled,
      cutMenu: (p) => this.editor.menuAt(p.x, p.y),
      loupe: () => this.loupe,
    };
    this.desk = new ToolDesk(base, {
      toolbar: () => this.toolbar,
      slots: () => this.screen.slots,
      current: () => this.current,
      changed: () => this.syncBar(),
      say: (t) => this.say(t),
    });
    this.pager = new Pager({
      reading: this.reading,
      scores: this.scores,
      stage: this.stage,
      library: this.library,
      dismissEditor: () => this.editor.dismiss(),
      decorate: () => this.decorate(),
      info: (text) => { this.toolbar.info.textContent = text; },
      say: (t) => this.say(t),
      hideToast: () => this.toast.hide(),
      changed: () => this.syncBar(),
      leave: () => history.back(),
    }, this.screen, this.desk);
    this.changes = new Changes({
      reading: this.reading,
      changed: () => this.syncBar(),
      saveFailed: (e) => this.say(`${failed('save your changes', e)} Volti keeps trying.`),
    }, this.pager, this.screen, setlists);
    this.toolbar = new Toolbar(what.kind, {
      close: () => history.back(),
      titleMenu: () => this.menus.titleMenu(),
      more: () => void this.menus.more(),
      tool: (t) => this.desk.setTool(t),
      panel: (t) => this.desk.panel(t),
      undo: () => this.changes.undo(),
      redo: () => this.changes.redo(),
      toggleCuts: () => void this.withAccess(() => { this.editor.setEnabled(!this.editor.enabled); this.syncBar(); this.decorate(); }),
    }, this.desk.tools);
    // Faces the tools set before the toolbar was there.
    this.desk.showFaces(this.toolbar);
    this.menus = new ReaderMenus({
      reading: this.reading,
      toolbar: this.toolbar,
      saver: this.changes.saver,
      k: () => this.pager.k,
      open: (k) => this.scores.get(this.items[k].scoreId),
      goTo: (k, at) => void this.pager.goTo(k, at, true),
      replay: () => this.pager.replay(),
      retitle: () => this.showTitle(),
      dismiss: () => this.editor.dismiss(),
      say: (t, action) => this.toast.say(t, action),
      library: this.library,
      relisted: (entryId, at) => this.pager.relisted(entryId, at),
      ensure: (k) => this.scores.ensure(k, true),
      readWhole: () => {
        this.reading.readWhole();
        this.pager.replay();
      },
      playExcerpt: (excerpt) => {
        this.reading.play(this.pager.k, excerpt);
        this.pager.replay();
      },
      leave: () => history.back(),
      access: () => this.allowAccess(),
    });
    this.syncBar();
    this.stage.append(this.screenEl);
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
    const back = el('button', 'back float-button');
    back.type = 'button';
    back.append(icon(BACK));
    back.setAttribute('aria-label', 'Library');
    back.addEventListener('click', () => history.back());
    // While the toolbar shows, a scrim with a triangle marks the band at each side that turns the page.
    const bands = [el('div', 'turn-band left'), el('div', 'turn-band right')];
    bands[0].append(turnIcon('prev'));
    bands[1].append(turnIcon('next'));
    this.root.append(this.stage, ...bands, back, this.faceButton.el, this.toolbar.el, this.scope, this.toast.el);
    this.barObserver.observe(this.toolbar.el);
    document.body.append(this.root);
    document.body.classList.add('reading');
    document.documentElement.dataset.theme = 'light';

    this.input = new Input(this.desk.handHost, this.desk.tools);
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('popstate', this.onPop);
    history.pushState({ reader: true }, '');

    // The first screen waits for full screen, to be drawn once at full size; the observer too, as
    // its first report would show the screen before `goTo` has set it.
    const full = fullscreen ?? document.documentElement.requestFullscreen?.().catch(() => {}) ?? Promise.resolve();
    void this.requestWake();
    void full.then(() => { void this.pager.goTo(k, position); this.observer.observe(this.stage); });
  }

  /* ---------- the scores read ---------- */

  private get items() { return this.reading.items; }

  /** The current item's score, once open; undefined while it opens or when it can't be. */
  private get current(): OpenScore | undefined { return this.pager.current; }
  private get state(): State { return this.current!.state; }
  private get aspects(): Aspects { return this.current!.aspects; }
  private get draw(): DrawPage { return this.current!.draw!; }
  private get drawProgressive(): DrawProgressive { return this.current!.drawProgressive!; }

  private syncBar() {
    const cur = this.current;
    this.desk.sync();
    this.toolbar.sync({
      open: !!cur,
      tool: this.desk.active,
      cuts: this.editor.enabled,
      canUndo: this.changes.canUndo,
      canRedo: this.changes.canRedo,
    });
    this.scope.hidden = this.reading.what.kind === 'score' || !this.editor.enabled;
    this.root.classList.toggle('writing', this.desk.active !== 'hand');
    this.root.classList.toggle('editing', this.editor.enabled);
    this.barResized();
  }

  /** Where the toolbar ends, for what is placed under it; it changes with its rows, so also when it is resized. */
  private barResized() {
    this.root.style.setProperty('--bar-h', this.toolbar.el.offsetHeight + 'px');
    this.zoomer.barChanged();
  }

  /** The toolbar showing means annotation mode: zooming and writing are available. */
  private get annotating() { return !this.root.classList.contains('chrome-hidden'); }

  private showChrome(show: boolean) {
    this.root.classList.toggle('chrome-hidden', !show);
    if (!show) this.zoomer.reset();
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
    this.faceButton.show(buttonStatus({ available: hasGestures(this.faceSettings), watching: this.watching, camera: this.camera, faceSeen: this.faceSeen }));
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
    const it = this.items[this.pager.k], cur = this.current;
    if (this.reading.what.kind === 'excerpt' && cur) this.toolbar.title.textContent = `${this.reading.excerptName(this.pager.k, cur.state.score, cur.aspects)} · ${it.title}`;
    else if (!this.reading.setlistId) this.toolbar.title.textContent = it.title;
    else showSetlistTitle(this.toolbar.title, this.pager.k, this.items.length, it.title);
  }

  private showCard() {
    if (this.reading.setlistId) this.card.show(this.pager.k, this.items.length, this.items[this.pager.k].title);
  }

  /** Whether the score read can be read from its PDF, or couldn't be as access to the scores folder isn't allowed. */
  private async readable(): Promise<boolean> {
    if (this.items[this.pager.k]?.needsAccess) return false;
    const cur = this.current;
    return !cur?.draw || !!cur.readable;
  }

  /**
   * When the score read couldn't be read from its PDF for want of access to the scores folder, ask
   * for it, from a tap: then read the scores from their PDFs, and show the screen again. False,
   * having said why, when it isn't allowed.
   */
  private async allowAccess(): Promise<boolean> {
    if (this.items[this.pager.k]?.fileGone) {
      this.say('The file for this score is gone, so only its saved pages can be shown.');
      return false;
    }
    if (await this.readable()) return true;
    const at = this.screen.slots[0]?.frame.items[0]?.cut.id;
    await unlockFolder().catch(() => false);
    this.scores.accessAllowed();
    await this.scores.ensure(this.pager.k, true);
    if (!(await this.readable())) {
      const folder = await folderStatus();
      this.say(folder.kind !== 'none' && folder.place === 'drive'
        ? 'Sign in to Google Drive from the library to read this score.'
        : 'Volti can’t read the scores folder without access.');
      return false;
    }
    this.toast.hide();
    void this.pager.goTo(this.pager.k, at);
    return true;
  }

  /** Do something that needs the PDFs (editing cuts, picking an excerpt), asking for access first if need be. */
  private async withAccess(f: () => void) {
    if (await this.allowAccess()) f();
  }

  private decorate() {
    this.editor.decorate(this.screen.slots, this.pager.frames);
  }

  /** While a cut is dragged: show it with the layout frozen, the music being cut away hatched. */
  private preview(s: State | null, frames: Frame[] | null, hatches?: Hatches) {
    const all = frames ?? this.pager.frames;
    this.closeUp.drop();
    this.screen.redraw(all, s ?? this.state, hatches);
    this.editor.decorate(this.screen.slots, all, !!frames);
  }

  /** Do what a gesture asks; whether a page turn went through the gate (which drops one too soon after the last). */
  private act(g: Gesture): boolean {
    if (g === 'next' || g === 'prev') {
      const { gate, pass } = gateTurn(this.turnGate, performance.now());
      this.turnGate = gate;
      if (!pass) return false;
      this.pager.turn(g === 'next' ? 1 : -1);
      return true;
    }
    this.showChrome(!this.annotating);
    return false;
  }

  /* ---------- lifecycle ---------- */

  private async requestWake() {
    try { this.wake = await navigator.wakeLock?.request('screen'); } catch { /* not allowed now; try again when visible */ }
  }

  private onVisible = () => {
    if (document.visibilityState === 'visible') void this.requestWake();
    else {
      this.watchEvent({ kind: 'pageHidden' });
      void this.changes.saver.flush().catch(() => {});
    }
  };

  /** Failures of what happens in the background show through `say` while the reader is open. */
  private stopShowingFailures: () => void;

  private onPop = () => void this.close();

  /** Going back failed to save the changes: the next Back leaves without them. */
  private leaveUnsaved = false;

  private async close() {
    // Every tool on the stack is unequipped: Text finishes typing.
    await this.desk.finish();
    closeOverlay();
    this.editor.dismiss();
    if (!(await this.savedForClosing())) return;
    this.pager.stop();
    this.stopShowingFailures();
    window.removeEventListener('popstate', this.onPop);
    this.watchEvent({ kind: 'readerClosed' });
    this.face.stop();
    this.input.detach();
    document.removeEventListener('visibilitychange', this.onVisible);
    this.observer.disconnect();
    this.toolbar.dispose();
    this.barObserver.disconnect();
    this.closeUp.stop();
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
      await this.changes.saver.flush();
      return true;
    } catch {
      if (this.leaveUnsaved) {
        this.changes.saver.stop();
        return true;
      }
      this.leaveUnsaved = true;
      history.pushState({ reader: true }, '');
      this.toast.say('Could not save your changes. Back leaves without them.', ['Try again', () => { this.leaveUnsaved = false; history.back(); }], true);
      return false;
    }
  }
}
