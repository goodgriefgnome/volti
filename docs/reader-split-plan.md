# Splitting the reader: plan

How to get to what `reader-split-spec.md` describes. Read the spec first; where the two disagree,
the spec wins. Each stage is one commit, or a few, and every commit leaves `npm test` and
`npm run build` passing. Before each push, also try the stage in the running app (`npm run dev`)
with the checks it lists. Commit and push each stage before starting the next.

This is a move of code, not a rewrite. Move each method's body as it is, changing only how it
reaches state that is now another part's (`this.k` becomes `this.pager.k`, say). When a body seems
to need changing beyond that, stop: the stage is wrong, not the code.

The tests run in Node, without a DOM. Logic worth testing goes in pure functions (`_landing.ts`),
and the tests call those.

Code style: match what is there. Each new module starts with a comment saying what belongs in it.
Comments say what something is or why, in the same tone as the code around them. Line numbers below
are `reader.ts` as it is before stage 1; they drift as the stages go, so find each method by name.

## The shape at the end

`Reader` makes the parts in this order, each given its host, and then the parts the reader already
joins (`CutEditor`, `Detail`, `Loupe`, `Input`, `Toolbar`, `ReaderMenus`):

```ts
this.zoomer = new StageZoom({ ... });
this.desk = new ToolDesk(base, { ... });
this.screen = new Screen({ ... }, this.zoomer);
this.pager = new Pager({ ... }, this.screen, this.desk);
this.changes = new Changes({ ... }, this.pager, this.screen);
this.access = new FolderAccess({ ... }, this.pager, this.screen);
```

Some of these need things made later (the toolbar, the cut editor). Their hosts reach those
through arrow functions (`() => this.toolbar`), as the reader's hosts do now, so nothing is called
before it exists. Keep the `!` definite-assignment fields where TypeScript needs them.

## Stage 1: `_landing.ts`, pure

A new module, `src/reader/_landing.ts`:

```ts
// Where the reader goes after what it reads changes: whether an edit moved the music, which
// screen then shows, where a score's last screen starts, and which entry a changed setlist reads.
// Pure: the reader's parts act on the answers.

import { framesOnScreen } from '../render/layout';
import { frameOf, type Frame } from '../scores/frames';
import type { Cut } from '../scores/model';
import type { Item } from './_open-scores';

/** Whether two played orders put the same music in the same places. */
export function sameLayout(a: readonly Cut[], b: readonly Cut[]): boolean;

/** What to show after an edit: only the ink again, or the screen starting at `frame`, kept where it is or placed fresh. */
export type AfterEdit = { kind: 'repaint' } | { kind: 'show'; frame: number; place: 'keep' | 'fresh' };

/**
 * After an edit: `before` is every cut of the item's frames before it, `frames` the item's frames
 * after it, `frame` and `shown` the screen's first frame and how many it shows, and `focus` the cut
 * the edit was made at.
 */
export function afterEdit(before: readonly Cut[], frames: readonly Frame[], frame: number, shown: number, focus?: string): AfterEdit;

/** Where a score's last screen starts: at its last two frames when the one before last shows two on a W × H stage. */
export function lastScreenStart(frames: readonly Frame[], W: number, H: number): number;

/**
 * A setlist relisted: the item to read. `entryId` is the entry to read, `was` the entry read
 * before, `at` the place to fall back to. `same`: it is still the entry read, only elsewhere.
 */
export function relistTarget(items: readonly Item[], entryId: string | undefined, was: string | undefined, at: number): { k: number; same: boolean };
```

Bodies, from `reader.ts`:

- `sameLayout`: the arrow at line 70, as it is.
- `afterEdit`: the second half of `setState` (lines 885–909). `moved` is
  `!sameLayout(frames.flatMap((f) => f.items.map((p) => p.cut)), before)`; `f`, `target` as there;
  `!moved && target === frame` gives `repaint`; otherwise `frame` is
  `Math.min(target, Math.max(0, frames.length - 1))` and `place` is `'keep'` when `target === frame`
  (the frame before the edit), else `'fresh'`.
- `lastScreenStart`: the body of `lastScreen` (line 579), with `W` and `H` as parameters.
- `relistTarget`: from `relisted` (line 376): `k` is the index of `entryId` (−1 when there is none);
  with `k >= 0 && entryId === was` it is `{ k, same: true }`; otherwise
  `{ k: k >= 0 ? k : Math.min(at, items.length - 1), same: false }`.

In `reader.ts`, use them: `setState` calls `afterEdit` and acts on its answer; `lastScreen` calls
`lastScreenStart(frames, this.stage.clientWidth, this.stage.clientHeight)`; `relisted` calls
`relistTarget`; the `sameLayout` arrow goes.

Tests, `src/reader/_landing.test.ts` (use `cut` and `state` from `scores/testing.ts`, and `pack`
from `scores/frames.ts` with `aspects` to make frames):

- `sameLayout`: true for the same cuts; false when one cut's `y1`, `page` or `pad` differs, when the
  ids differ, and when the lengths differ; true when only a `pass` differs (as now).
- `afterEdit`: an edit that changes nothing (same cuts) with no focus gives `repaint`; a focus on a
  frame on the screen gives `repaint`; a focus on a frame after the screen gives
  `show` at that frame, `fresh`; a cut removed before the screen (layout moved) gives `show` at the
  same frame, `keep`; a frame past the new end is brought back to the last frame.
- `lastScreenStart`: portrait frames on a landscape stage (two to a screen) start at `n - 2`;
  landscape frames on a landscape stage at `n - 1`; one frame at 0.
- `relistTarget`: the entry still there and read before gives `same`; the entry moved gives its new
  index and `same: false` when it wasn't the one read; an entry gone falls back to `at`, and to the
  last item when `at` is past the end.

No change in the app. Check: cut a frame in two on the screen (the screen stays put); remove a cut
on an earlier screen (the screen keeps its place); turn to a score's last screen from the next
setlist entry going back (it starts at the last two frames when two show).

## Stage 2: `StageZoom`

A new module, `src/reader/_stage-zoom.ts`:

```ts
// The zoom of the reader's spread: where it is, the smallest it may be, the view below the
// toolbar it is moved within, and placing a new screen. The moves themselves are render/zoom.ts.

export interface StageZoomHost {
  stage: HTMLElement;
  /** The element the zoom transforms. */
  spread: HTMLElement;
  /** The toolbar shows: annotation mode. */
  annotating(): boolean;
  /** The toolbar's height in CSS pixels. */
  barHeight(): number;
  /** The zoom changed: the tools' chrome, the toolbar's state and the close-up follow. */
  changed(): void;
}

export class StageZoom {
  constructor(host: StageZoomHost);
  get zoom(): Zoom;
  /** The smallest zoom: the spread fits below the toolbar at its tallest since it showed. */
  get minScale(): number;
  /** The part of the stage below the toolbar, which the spread is moved within. */
  view(): View;
  set(z: Zoom): void;
  /** A new screen: whole below the toolbar and centred while it shows, at full size otherwise. */
  placeFresh(): void;
  /** The toolbar hid: the smallest zoom is 1 again, and the spread at full size. */
  reset(): void;
  /** The toolbar showed or changed: the smallest zoom lowers to fit below it, never rises. */
  barChanged(): void;
}
```

Move from `reader.ts`: the fields `zoom` and `minScale`; `view()` (line 947) with
`this.toolbar.el.offsetHeight` as `host.barHeight()`; `placeFresh()` (952); `setZoom()` (956) as
`set`, its `drawChromes(); syncBar(); detail.update()` becoming `host.changed()`, after the
transform is set; from `showChrome` (546), `minScale = 1; setZoom(NO_ZOOM)` as `reset`; from
`syncBar` (524), its last line as `barChanged`.

In `reader.ts`: a field `zoomer: StageZoom`, made in the constructor before the `view` object, with
`changed: () => { this.drawChromes(); this.syncBar(); this.detail.update(); }` (stage 3 makes the
first `this.desk.drawChromes()`). Every `this.zoom` becomes `this.zoomer.zoom`, `this.minScale`
`this.zoomer.minScale`, `this.setZoom(z)` `this.zoomer.set(z)`, `this.view()` `this.zoomer.view()`,
`this.placeFresh()` `this.zoomer.placeFresh()`. `syncBar` ends with `this.zoomer.barChanged()`.

Check in the app: show the toolbar, pinch in and out and pan; the spread can't be made smaller than
fits below the toolbar. Hide the toolbar: the spread goes back to full size. Turn a page zoomed in:
the new screen is placed whole below the toolbar. The close-up sharpens after a pinch.

## Stage 3: `ToolDesk`

A new module, `src/reader/_tool-desk.ts`:

```ts
// The reader's tools: the lend stack (the tool equipped by its button, with tools lent on top by
// a selection or for one press), telling tools when they are equipped and unequipped, the
// selection, each tool's chrome layers, the tools' settings, and each tool's host. What a tool
// does is in tools/.

/** What the tools get from the reader that isn't the desk's to give. */
export type DeskBase = Omit<InputHost & HandHost,
  'tool' | 'selected' | 'select' | 'delete' | 'setThisTimeOnly' | 'settings' | 'setSettings'
  | 'lendForPress' | 'endPressLend' | 'unequip' | 'layer' | 'setButtonFace'>;

export interface ToolDeskHost {
  /** The toolbar, once it is made. */
  toolbar(): Toolbar | undefined;
  /** The frames on the screen. */
  slots(): FrameSlot[];
  /** The current item's score, once open. */
  current(): OpenScore | undefined;
  /** What the toolbar shows may have changed. */
  changed(): void;
  say(text: string): void;
}

export class ToolDesk {
  readonly tools: Record<ToolName, Tool>;
  /** The hand tool's host, which pointer input is given too. */
  readonly handHost: InputHost & HandHost;
  constructor(base: DeskBase, host: ToolDeskHost);
  /** The tool in use: the one on top of the stack. */
  get active(): ToolName;
  get selected(): Selected | undefined;
  get settings(): ToolSettings;
  /** A tool's button tapped: it is equipped, or put away when it is the active one. */
  setTool(t: ToolName): void;
  /** Equip `t`; the selection ends with it. */
  useTool(t: ToolName): void;
  /** A long press on a tool's button: it becomes the tool, and its panel shows under the button. */
  panel(tool: Exclude<ToolName, 'hand'>): void;
  select(s: Selected | undefined): void;
  /** An edit replaced the selected marking with `s`: it stays selected, lending nothing new. */
  keepSelected(s: Selected): void;
  deselect(): void;
  refreshSelection(): void;
  deleteSelected(): void;
  setThisTimeOnly(on: boolean): void;
  showLayers(): void;
  drawChromes(): void;
  /** The toolbar is being synced: the tools set their faces again, and only the active tool's layers show. */
  sync(): void;
  /** Show on the toolbar the faces the tools set before it was made. */
  showFaces(toolbar: Toolbar): void;
  /** Every tool on the stack is unequipped (Text finishes typing); resolves once they all have been told. */
  finish(): Promise<void>;
}
```

`deleteSelected` and `setThisTimeOnly` commit through `base.commit` and read the state through
`base.state()`.

Move from `reader.ts`: the fields `stack`, `told`, `tools`, `faces`, `settings`, `selected` and the
`tool` getter (as `active`); `setTool`, `useTool`, `tell`, `deselect`, `selectionChanged`, `lend`,
`chooseOnLongPress`, `panel`, `setFace`, `layerFor`, `showLayers`, `drawChromes`, `setSettings`,
`select`, `deleteSelected`, `setThisTimeOnly`, `refreshSelection` (lines 397–522), as they are;
`loadToolSettings()` from the constructor (line 307); `hostFor`, `host` and `makeTools` from the
constructor (lines 252–259), the base's desk keys (`tool`, `selected`, `select`, `delete`,
`setThisTimeOnly`, `settings`, `setSettings`, `lendForPress`, `endPressLend`, `unequip`) moving
into the desk's own part of each host. `refreshSelection` ends with `host.changed()` when there is a
current score, as now with `syncBar`. `setTool`, `useTool`'s callers and `chooseOnLongPress` that
called `this.syncBar()` call `host.changed()`.

In `reader.ts`: `syncBar` calls `this.desk.sync()` in place of its first two lines, and reads the
active tool from `this.desk.active`. `commit`'s `if (selected) this.selected = selected` becomes
`if (selected) this.desk.keepSelected(selected)`. `close` starts with `await this.desk.finish()`.
After the toolbar is made, `this.desk.showFaces(this.toolbar)`. `Input` is given
`this.desk.handHost` and `this.desk.tools`; the toolbar `this.desk.tools`. Everything else that
used the moved fields calls the desk.

Check in the app: each tool's button equips it and a second tap puts it away; a long press opens
its panel; a colour chosen there is kept after closing and opening the reader. Select a symbol
with the pen equipped: Symbols lights up, the box shows, and taking the pen back ends the
selection. The stylus's eraser button erases and gives the tool back. Delete and "This time only"
on a selected marking, then undo each. Type text and go back while typing: the text is placed.

## Stage 4: `Screen`

A new module, `src/reader/_screen.ts`:

```ts
// What is on the reader's screen: the frames shown as slots, drawn from their pages (stand-ins
// first, then sharp), the screen of a score that can't be shown, painting frames and their ink, the
// frozen layout while a cut is dragged, and drawing the next screens ahead. Which screen to show is
// the Pager's.

export interface ScreenHost {
  stage: HTMLElement;
  spread: HTMLElement;
  toast: Toast;
  /** The item read, its score once open, its frames, and the first frame on the screen. */
  item(): Item;
  current(): OpenScore | undefined;
  frames(): Frame[];
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
  /** A screen of the score's frames shows, its first cut `first`: the cut editor, the tools' chrome, the selection, the score card and the place read follow. */
  showed(first: string | undefined): void;
  /** A score that can't be shown shows: the score card follows. */
  showedUnread(): void;
  /** Ask for access to the scores folder, from a tap. */
  allowAccess(): Promise<boolean>;
}

export class Screen {
  constructor(host: ScreenHost, zoom: StageZoom);
  /** The frames on the screen. */
  get slots(): FrameSlot[];
  /** How many frames the screen shows. */
  get shown(): number;
  /** Show the screen: as `show` in reader.ts now. */
  show(options?: { turned?: boolean; place?: 'keep' | 'fresh' }): Promise<void>;
  paint(slot: FrameSlot, s: State, hatches?: Hatches, extra?: Marking): void;
  paintInk(slot: FrameSlot, s: State, extra?: Marking): void;
  /** Each slot takes its frame of `frames` (by its index) and its ink is painted from `s`. */
  reframe(frames: Frame[], s: State): void;
  /** Each slot takes its frame of `frames`, where there is one, and is painted from `s`: a cut dragged. */
  repaint(frames: Frame[], s: State, hatches?: Hatches): void;
  /** The reader is closing, or the screen is going: no screen being drawn shows, and drawing ahead stops. */
  stop(): void;
}
```

Move from `reader.ts`: the fields `shown`, `seq`, `ahead`, `slots`, `pages`, `askingAccess`;
`screenAt` (574), `blank` (585), `show` (594), `sharpen` (664), `showUnread` (684), `paint` (748),
`paintInk` (752) and `predraw` (772), as they are, with:

- `this.frame` read through `host.frame()`, and the clamp at the top of `show` through
  `host.setFrame(...)`; `this.frames` through `host.frames()`; `this.current`, `this.items[this.k]`,
  `this.loading` through the host.
- `this.reading.setlistId` through `host.inSetlist()`; `this.items[this.k + 1]?.title` through
  `host.nextTitle()`.
- `this.toolbar.info.textContent = ...` through `host.info(...)`; `this.showTitle()` through
  `host.title()`.
- `this.placeFresh()` through the `StageZoom` given.
- In `show`, the lines from `this.decorate()` through `this.saveSpot(...)` become, in this order:
  `host.info(...)` with the page text, then `host.showed(on[0]?.items[0]?.cut.id)`. In
  `showUnread`, `this.showCard()` becomes `host.showedUnread()`, and the `else this.saveSpot(undefined)`
  goes: `saveSpot` does nothing without a cut.
- In `predraw`, the part after `if (seq !== this.seq) return;` becomes: return unless
  `host.inSetlist()` and this is the item's last screen; `const next = await host.next()`; return
  when the screen has moved on or `next` is null; draw `next.frames`' first screen with `next.draw`.
- `reframe`: the loop in `setState`'s repaint-only path (`slot.frame = frames[slot.index]` and
  `paintInk`), and `undoTo`'s `slot.frame = this.frames[slot.index]` uses it for that one slot.
- `repaint`: the loop in `preview` (761).
- `stop`: `this.seq++` and `this.ahead.abort()` from `close`.

In `reader.ts`: `showed` does `this.decorate(); this.desk.drawChromes(); this.desk.refreshSelection();
this.showCard(); this.saveSpot(first)`. `showedUnread()` does `this.showCard()`. `next` does what `predraw` did: `ensure(this.k + 1)`, returning
`{ draw: cur.draw, frames: this.framesFor(this.k + 1) }` when it opened with a `draw`. `preview`
becomes `this.detail.drop(); this.screen.repaint(frames ?? this.frames, s ?? this.state, hatches);
this.editor.decorate(this.screen.slots, frames ?? this.frames, !!frames)`. The view's `slots()`
reads `this.screen.slots`. Every other call of a moved method calls the screen.

Check in the app: open a score; the screen shows soft, then sharp. Turn forward and back; rotate
the tablet (or resize the window): the music at the top stays. In a setlist, turn past a score's
end into the next (its first screen shows at once). Lock the folder (restart the app without
allowing access) and open a setlist whose next score isn't saved: the "Needs access" screen and
toast show, and Allow access shows the page. Drag a cut's tab: the music being cut away is
hatched.

## Stage 5: `Pager`

A new module, `src/reader/_pager.ts`:

```ts
// Where the reader is: the item read, its frames and the first one on the screen, going to an
// item and a screen, turning, offering the library's next score past a score's end, a setlist's
// entries changed, where to go after an edit, and remembering where it was read.

export interface PagerHost {
  reading: Reading;
  scores: OpenScores;
  stage: HTMLElement;
  /** The library's scores; in a score's own reader, in the library's order, to turn to. */
  library: readonly SourceFile[];
  /** Put away the cut editor's menus and dialogs. */
  dismissEditor(): void;
  info(text: string): void;
  say(text: string): void;
  hideToast(): void;
  /** What the toolbar shows may have changed. */
  changed(): void;
  /** Back to the library. */
  leave(): void;
}

export class Pager {
  constructor(host: PagerHost, screen: Screen, desk: ToolDesk);
  get items(): Item[];
  get k(): number;
  get frames(): Frame[];
  get frame(): number;
  set frame(f: number);  // only Screen's host uses it, to clamp
  get loading(): boolean;
  /** The current item's score, once open. */
  get current(): OpenScore | undefined;
  framesFor(k: number): Frame[];
  /** Go to item k: its first or last screen, or the screen holding a cut; `turned` as Screen.show says. */
  goTo(k: number, at?: string | 'first' | 'last', turned?: boolean): Promise<void>;
  turn(dir: 1 | -1): void;
  relisted(entryId?: string, at?: number): Promise<void>;
  /** What the current item plays changed: show it from its start. */
  replay(): void;
  /** The current score's state changed (already set): reflow, and show the frame holding `focus`. */
  relayout(s: State, focus?: string): void;
  /** Remember what is read and its first cut on the screen. */
  saveSpot(cut: string | undefined): void;
  /** The reader is closing: an item that finishes opening now isn't shown. */
  stop(): void;
}
```

Move from `reader.ts`: the fields `k`, `frame`, `frames`, `goSeq`, `loading`, `offered`, and
`OFFER_MS`; the getters `items` and `current`; `framesFor` (348), `goTo` (354), `relisted` (376),
`lastScreen` (579), `saveSpot` (738), `turn` (796), `offerScore` (818), `turnToScore` (832), as they
are, with:

- `this.deselect()` as `desk.deselect()`, `this.editor.dismiss()` as `host.dismissEditor()`,
  `this.syncBar()` as `host.changed()`, `this.toolbar.info.textContent =` as `host.info`,
  `this.toast.hide()` as `host.hideToast()`, `history.back()` as `host.leave()`.
- `this.show(...)` as `screen.show(...)`, `this.shown` as `screen.shown`.
- In `turn`, the two `if (t.to !== 'score')` lines become one.
- `replay`: the body the reader's menus host has three times now (lines 279–283, 290–295 and 296–301,
  after the `reading` call in the last two): `frames = framesFor(k); frame = 0; screen.show()`.
- `relayout`: what `setState` does after `this.syncBar()`, through `afterEdit`: on `repaint`,
  `screen.reframe(frames, s)`, then `host.changed()`'s decoration (see below) and
  `desk.refreshSelection()`; on `show`, set `frame` and `screen.show({ place })`. `before` is the
  cuts of the frames before `frames` is recomputed, so read it first.
- `stop`: `this.scores.closed = true` from `close`, with `screen.stop()`.

The repaint-only path called `this.decorate()` (the cut editor). Give `PagerHost` one more
callback, `decorate(): void`, and call it there.

In `reader.ts`: a field `pager: Pager`; the view's `frames()` and `state()`, the screen's host and
the menus' host (`k`, `goTo`, `relisted`, `replay`, `readWhole`, `playExcerpt`) read and call it.
`act` calls `this.pager.turn`. The resize observer calls `this.screen.show()`. The constructor's
last line calls `this.pager.goTo(k, position)`. `close` calls `this.pager.stop()` in place of
`this.scores.closed = true` and `this.screen.stop()`.

Check in the app: open a score and turn through it; turn past its end ("Tap again for …") and
again: the next score opens; back from its start to the one before, at its last screen. Open a
setlist from an entry, and from the library's play button (it opens where it was last read). In
the title menu, move the entry being read, remove another, and remove the one read: the reader
follows each. Read a named excerpt and change its cuts from the title menu.

## Stage 6: `Changes`

A new module, `src/reader/_changes.ts`:

```ts
// The reader's edits: taking one (its undo step, carrying it through the Reading to the setlists
// and named excerpts, saving, showing it), the eraser's sweep as one undo step, undo and redo
// across the scores read, and saving.

/**
 * An undo entry holds a whole state: a score's state before an edit, what was read with the
 * setlists, the item it was made in, and the cut to show.
 */
interface Undo { open: OpenScore; state: State; reading: ReadingSnapshot; k: number; focus?: string }

export interface ChangesHost {
  reading: Reading;
  /** What the toolbar shows may have changed. */
  changed(): void;
  /** A save failed: say so. */
  saveFailed(): void;
}

export class Changes {
  readonly saver: Saver;
  /** `setlists` are the setlists as loaded, as last written. */
  constructor(host: ChangesHost, pager: Pager, screen: Screen, setlists: readonly Setlist[]);
  get canUndo(): boolean;
  get canRedo(): boolean;
  /** Take a new state from an edit, as `commit` in reader.ts now (without the selection, which the caller keeps). */
  commit(s: State, focus?: string): void;
  /** The eraser took markings away: show and save them gone, without an undo step. */
  showSweep(s: State, slot: FrameSlot): void;
  /** One undo step back to `before` for the whole sweep. */
  endSweep(before: State, slot: FrameSlot): void;
  undo(): void;
  redo(): void;
}
```

Move from `reader.ts`: the `Undo` interface, the fields `undos` and `saver` (the `Saver` made here,
its failure callback `host.saveFailed`); `commit` (876), `setState` (885), `showState` (911) as
`showSweep`, `undoTo` (918) as `endSweep`, `undo` (925), `redo` (930), `restore` (936), as they
are, with `setState`'s layout half as `pager.relayout(s, focus)` after `host.changed()`, and
`this.goTo` as `pager.goTo`.

In `reader.ts`: the base host's `commit` is
`(s, focus, selected) => { if (selected) this.desk.keepSelected(selected); this.changes.commit(s, focus); }`;
`show` and `undoTo` call `showSweep` and `endSweep`; the cut editor's `commit` calls
`this.changes.commit`. The toolbar's undo and redo call the changes; `syncBar` reads
`this.changes.canUndo` and `canRedo`. The menus' host gets `saver: this.changes.saver`.
`onVisible` and `savedForClosing` use `this.changes.saver`.

Check in the app: draw, erase with one sweep across three strokes, and undo: the three come back
in one step. Cut a frame, insert pages, and undo and redo each. In a setlist with two entries of
one score, edit the cuts in the second and undo from the first: the reader goes back to the
second. Close and open the reader: the edits are there.

## Stage 7: `FolderAccess`

A new module, `src/reader/_access.ts`:

```ts
// Access to the scores folder from the reader: whether what is read can be read from its files,
// and asking for access from a tap, then reading the scores from their files and showing the
// screen again.

export interface FolderAccessHost {
  scores: OpenScores;
  say(text: string): void;
  hideToast(): void;
}

export class FolderAccess {
  constructor(host: FolderAccessHost, pager: Pager, screen: Screen);
  /** Whether the score read can be read from its file; false when access isn't allowed. */
  readable(): boolean;
  /** As `allowAccess` in reader.ts now. */
  allow(): Promise<boolean>;
  /** Do something that needs the files, asking for access first if need be. */
  withAccess(f: () => void): Promise<void>;
}
```

Move from `reader.ts`: `readable` (702, no longer `async`: it awaits nothing), `allowAccess` (713)
as `allow`, `withAccess` (730), as they are. `allow` awaits `this.readable()` now; make those two
plain calls.

In `reader.ts`: the screen's host's `allowAccess`, the menus' `access` and the toolbar's
`toggleCuts` call the access.

Check in the app: restart the app without allowing access to the folder; open a setlist whose
pages are saved: it plays. Tap Cuts: access is asked for, and once allowed, Cuts turns on. Turn to
a page not saved: the toast asks, and Allow access shows it. A score whose file is gone says its
saved pages are all that can be shown.

## Stage 8: what is left, and the docs

`reader.ts` now has `openReader`, `ToRead`, and `Reader` with: the fields for the DOM (`root`,
`stage`, `spreadEl`, `scope`, `toast`, `toolbar`, `card`), `themeBefore`, `wake`, `resizeTimer`,
`observer`, `fileChanges`, `leaveUnsaved`, and the parts; the constructor, which makes and joins
them; `syncBar`, `annotating`, `showChrome`, `say`, `showTitle`, `showCard`, `act`, `decorate`,
`preview`; and the lifecycle (`requestWake`, `onVisible`, `onPop`, `close`, `savedForClosing`).

- Go through it for anything left that is a part's (a field read straight from a part's state, a
  helper used only by one part) and move it.
- Take out imports no longer used (`tsc` with `noUnusedLocals` finds them).
- Check the sizes the spec sets: `wc -l src/reader/reader.ts src/reader/_*.ts`.
- `ARCHITECTURE.md`, "The two screens": replace the bullet on the reader (`reader.ts`, `_input.ts`)
  with one per part, saying what it owns and does as the spec's table does, and the rows of who may
  call whom. Keep the other bullets, changing the names they use (`commit` is `Changes.commit`; the
  selection is the `ToolDesk`'s). The recipe "A toolbar button" says the action goes in `reader.ts`
  or the part it is about.
- Delete `docs/reader-split-spec.md` and `docs/reader-split-plan.md` in the last commit.

Check in the app: everything in the manual checks below, once more.

## Manual checks for the whole

On the tablet (or Chrome's device mode, with touch), after the last stage:

1. Open a score: it shows soft then sharp, full screen, the toolbar hidden. Tap the sides to turn;
   tap the middle for the toolbar.
2. Turn past its end, then again: the next score opens. Back from its start: the one before, at its
   end.
3. Open a setlist; turn through two entries; the score card names each. Go back and open it again:
   it opens where it was.
4. Pen, Highlight, Erase (a sweep is one undo), Text (type, move, resize), Symbols (place, cycle,
   panel): each as before. Select a symbol with the pen on: Symbols lends, and the pen comes back.
5. Pinch and pan with the toolbar showing; hide it: full size again.
6. Cuts: cut, join, trim, pad, insert pages of another pass; undo and redo each; in a setlist, the
   other entries of the score follow.
7. Title menu: move, change and remove entries; add and change named excerpts.
8. ⋯ menu: rename, move to folder, export PDF, add to setlist.
9. Restart without access: the access flows of stage 7.
10. Rotate the tablet on a two-page screen: the music at the top stays.
11. Go back with text being typed: it is placed, and the edits are saved (open again to check).
