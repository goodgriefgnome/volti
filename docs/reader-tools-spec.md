# Tools and the reader: spec

What the reader and its tools are once this work is done: which of them does what, how a press on
the score is decided, selecting and lending, and the interfaces between them. Most of it moves code
without changing what the user sees; what does change is listed first. Everything not named here
stays as it is. How to get there is in `reader-tools-plan.md`; where the two disagree, this file
wins.

## What changes for the user

- **Page turns at the sides always win.** A press in the band at each side of the stage
  (`TURN_BAND_PX`) turns the page with every tool, the stylus included. The stylus no longer
  starts a stroke or a sweep in the bands; one started outside them goes on through them and may
  end there, as now. Music under a band is written on after panning it out.
- **Selecting happens on the press.** A press on a marking selects it and lends its tool as the
  finger goes down, not when it lifts: the Text or Symbols button lights up at the start of a drag.
- **Which marking a press selects.** The one whose ink (or background) is nearest the press, within
  12 CSS pixels; where two are as near (both under the press), the one drawn last. Now it is the one
  whose centre is nearest.
- **The stylus's eraser button lends Erase** for the length of the press. The Erase button lights
  up while it is held. A marking selected before it stays selected, its box hidden during the
  press, unless the eraser takes it away; the tool before Erase comes back when the press ends.
- **Cycling a symbol always makes it current.** Tapping a selected symbol again changes it to the
  next of its group, and that symbol becomes its group's current one, whether Symbols was lent or
  equipped by its button. Now it does only when Symbols was equipped by its button.

Nothing else the user does changes: what each tool makes and how, the panels, the toolbar's look,
the cut editor, the typing field, the loupe, undo.

## Who does what

**The reader** has the intrinsic behaviours, the same whatever the tool, which a tool may suppress
(below):

- deciding who gets each press (below);
- the selection: which marking is selected, finding the marking a press is on, ending the
  selection;
- lending, as a stack (below), and the toolbar lighting the tool on top of it;
- a chrome layer for each tool in each frame, shown only for the active tool;
- telling tools when they are equipped and unequipped and when the selection changes, and asking
  them to draw their chrome;
- showing each tool's button face, as the tool sets it;
- committing edits, undo, painting the ink, the loupe, zoom.

**A tool** handles what is its own:

- its button's face, and its long-press panel;
- which markings are its own, so that selecting one lends it;
- what a press does on the music, as its own state machine over the pointer's events: writing,
  erasing, placing, and, for a tool that selects, moving, resizing and the second tap on its
  selected marking;
- its chrome: the selected marking's box, handles and delete button, and the typing field;
- its own state: the symbol library and the current symbols, the text ghost, the typing field.

**The hand tool** is the tool when no other is equipped by its button. It has no button. A press
with it pans; a tap hides the toolbar; a long press opens the cut menu, while Cuts is on.

A tool never looks at whether a press came from a finger or the stylus. Only the reader does, for
palm rejection and the stylus's eraser button.

## Deciding who gets a press

When a pointer goes down on the stage, the reader asks the active tool for its `suppressions()`
once, then goes through these steps in order; the first that takes the press keeps it, with every
event of that pointer until it lifts.

1. **An open menu or panel.** A press while one is open only closes it. The overlay's own layer
   over the reader does this before the stage sees the press; this step is only there in case it
   doesn't.
2. **Chrome that takes its own presses.** A press on an element of the active tool's chrome marked
   `data-own-presses` (the delete button, the typing field) is left to that element: the reader
   neither captures the pointer nor does anything else with it.
3. **All presses suppressed.** While the active tool suppresses `allPresses` (Text while typing),
   the press is the tool's. Text's press only finishes typing.
4. **Palm rejection**, as now: the stylus going down drops what a finger was doing and stops a
   pinch or pan; fingers are ignored while the stylus is down and for 600 ms after.
5. **Pinch.** A second finger starts a pinch, dropping the first finger's press, unless the active
   tool suppresses `pinching` (it holds a marking); then the second finger is ignored until it
   lifts.
6. **Cut tabs**, while Cuts is on: a press on a tab drags it, or opens its menu on a long press.
7. **Page turns.** A press in the band at each side turns the page (the whole left and right
   shares of the stage while the toolbar is hidden).
8. **The toolbar hidden.** Only a tap in the middle counts: it shows the toolbar.
9. **The stylus's eraser button** lends Erase for this press. The steps after this one ask Erase,
   not the tool it covers.
10. **Selecting**, unless the active tool suppresses `selecting`:
    1. With a marking selected, a press the active tool's `isChromeAt` says is on its chrome (box,
       handles) is the tool's, with `on: { what: 'chrome' }`.
    2. A press on a marking selects it, lends the tool that owns it when that isn't the active
       tool, and is that tool's, with `on: { what: 'grabbed', sel }`. The marking is, among those
       some tool owns, the one with the least `hitDistance` within 12 CSS pixels; of those as near,
       the one drawn last (later in its cut's ink, or in a later cut of the frame). The tool moves
       the marking from the first pixel, as now.
    3. With a marking selected, a press anywhere else only ends the selection: it doesn't pan,
       write or place.
11. **The tool.** The active tool's `start` gets the press. When it declines (returns undefined),
    the hand tool gets it. Off the frames, only the hand tool gets presses; with any other tool,
    a press there does nothing, as now.

Right-click, the keys, and the context menu stay as now.

## Selecting and lending

- One marking at a time is selected, as now, found in the ink by identity: an edit that replaces it
  gives the reader the replacement through `commit`'s `selected`.
- The selection ends when its marking is gone from the state (deleted, erased, undone), when a tool
  is equipped by its button, or when the reader goes to another score.
- **The lend stack.** Below it is the tool equipped by its button (the hand tool when none is).
  Selecting a marking whose tool isn't the active one pushes that tool; the stylus's eraser button
  pushes Erase for its press. The active tool is the one on top.
  - Ending the selection takes its lend off the stack, wherever it is in it.
  - The eraser button's press ending takes Erase off.
  - Equipping a tool by its button clears the stack and ends the selection. Tapping the button of
    the active tool, lent or not, unequips it: the hand tool is equipped.
  - A lend of the tool already on top pushes nothing.
  - A tool is equipped when it goes on the stack, and unequipped when it leaves it; being covered
    by a lend is neither. The reader waits for `onEquipped` and `onUnequipped` to finish before the
    next change to the stack.
- The toolbar lights the tool on top of the stack.
- Only the active tool's chrome layer is shown. A tool covered by a lend keeps its state and its
  chrome, unseen.

## The interfaces

In `reader/tools/_tool.ts`. Signatures are as here; doc comments are written in the code's style.

```ts
export type ToolName = 'hand' | 'pen' | 'highlighter' | 'eraser' | 'text' | 'symbol';

/** What a tool's toolbar button shows: `key` changes when the picture does, so the toolbar draws it again only then. */
export interface ButtonFace { key: string; draw(): Node }

/** The reader's intrinsic behaviours a tool can suppress. */
export interface Suppressions {
  /** Every step before the tool's: each press is the tool's (Text while typing). */
  allPresses?: true;
  /** A second finger starting a pinch (a marking held). */
  pinching?: true;
  /** The selecting step (Pen, Highlight, Erase). */
  selecting?: true;
}

/** A press, as the reader hands it to a tool after the steps before it. */
export interface Press {
  /** The frame it is on; undefined off the frames, which only the hand tool gets. */
  slot?: FrameSlot;
  /** Where it is on the frame: x as a fraction of its width, y in frame widths from its top; then pressure. */
  framePoint: Point;
  /** Where it is on the screen, in CSS pixels: for the loupe, panning and menus. */
  screenPoint: { x: number; y: number };
  /** What the selecting step found: the tool's chrome, or a marking it selected for this tool. */
  on?: { what: 'chrome' } | { what: 'grabbed'; sel: Selected };
}

export interface Tool {
  readonly name: ToolName;
  readonly label: string;
  /** Whether `m` is its own: selecting `m` lends it, and its button face and panel show `m`. At most one tool owns a marking. */
  ownsMarking?(m: Marking): boolean;
  /** What it suppresses now; the reader asks once for each pointer going down. */
  suppressions?(): Suppressions;

  /** Show its long-press panel under `anchor`: for the selected marking when it owns it. */
  showPanel?(anchor: HTMLElement): void;

  /** It went on the lend stack: equipped by its button, or lent. */
  onEquipped?(): void | Promise<void>;
  /** It left the lend stack. */
  onUnequipped?(): void | Promise<void>;
  /** The selection changed (`host.selected()`): draw its chrome again, and set its button face again when it shows the selection. Every tool is told. */
  onSelectionChanged?(): void;

  /**
   * Draw all its chrome over the frames, in its layers, from its own state, the selection and the
   * zoom (`host.selected()`, `host.zoom()`): the only place it draws chrome. The reader calls it
   * after `onEquipped`, and when the layout (the layers are then new) or the zoom changes; the tool
   * calls it itself when its own state or the selection changes. The toolbar is not chrome.
   */
  drawChrome?(): void;
  /** Whether a press at `framePoint` on `slot` is on its chrome (box, handles). */
  isChromeAt?(slot: FrameSlot, framePoint: Point): boolean;
  /** A press, after the reader's steps; undefined: declined, the hand tool gets it. */
  start(press: Press): ToolPointer | undefined;
}
```

`ToolPointer` stays as now, without `holds` (the tool's `suppressions` says it), and with `move`'s
points named as `Press`'s: `move(framePoint, screenPoint)`, `moved`, `end(cancelled)`, `drop`.

```ts
/** What a tool may ask of the reader. */
export interface ToolHost extends ReaderView {
  commit(s: State, focus?: string, selected?: Selected): void;
  /** Show a state now, without an undo step: the eraser's sweep so far. */
  show(s: State, slot: FrameSlot): void;
  /** One undo step back to `before`, for what was shown since: the eraser lifted. */
  undoTo(before: State, slot: FrameSlot): void;
  paintInk(slot: FrameSlot, extra?: Marking): void;
  paintState(slot: FrameSlot, s: State): void;

  selected(): Selected | undefined;
  select(s: Selected | undefined): void;
  /** Take the selected marking away, as one undo step; the selection ends. */
  delete(): void;
  /** Unequip it: the hand tool is equipped (the symbol library has no symbols left, or couldn't be made). */
  unequip(): void;
  /** Its button shows `face` from now on: set when the tool is made, and whenever its look changes (its settings, its symbol, the selection it owns). */
  setButtonFace(face: ButtonFace): void;

  /** Its chrome layer in a frame. Elements in it with `data-own-presses` get their presses untouched. */
  layer(slot: FrameSlot): HTMLElement;
  /** Move the music up by `px` CSS pixels, to clear the on-screen keyboard; 0 puts it back. */
  lift(px: number): void;
  loupe(): Loupe;

  settings(): ToolSettings;
  setSettings(change: (s: ToolSettings) => ToolSettings): void;
  say(text: string): void;
}

/** What the hand tool may ask of the reader besides. */
export interface HandHost extends ToolHost {
  setZoom(z: Zoom): void;
  view(): View;
  minScale(): number;
  toggleToolbar(): void;
  /** The cut menu at a point on the screen, while Cuts is on. */
  cutMenu(screenPoint: { x: number; y: number }): void;
}

/** The tools, made for one reader, in the toolbar's order (the hand tool, having no button, anywhere). */
export function makeTools(host: ToolHost, hand: HandHost): Record<ToolName, Tool>;
```

How near a point is to a marking belongs to the marking kinds. In `_KindBehaviour`
(`markings/model.ts`), `hitDistance` takes the place of `hits`, with a function for any marking
beside it; every kind gives it:

```ts
/**
 * How far `p` is from it, in page widths, when within `radius` of it (0 on it); undefined when
 * further. `aspect` is its page's height / width.
 */
hitDistance(m: M, p: Point, radius: number, aspect: number): number | undefined;
```

- A stroke: from `p` to its nearest segment, less half its width (as `_touches` measures now).
- A placed marking: from `p` to its extent, background included (as its `hits` measures now).
- The eraser takes away the markings with a `hitDistance` within its radius.
- Selecting takes it within 12 CSS pixels, among the markings some tool owns. No tool owns strokes
  yet, so they aren't selected; making them selectable later is a tool that owns them.

## The tools

| Tool | `ownsMarking` | `suppressions` | Button / panel | Chrome | `start` |
|---|---|---|---|---|---|
| Hand | | | none | | pan; a tap hides the toolbar; a long press opens the cut menu |
| Pen, Highlight | | `selecting` | icon and colour / colours | | a stroke |
| Erase | | `selecting` | icon / none | | a sweep, one undo step |
| Text | text markings | `allPresses` while typing; `pinching` while a marking is held | T in its look / font, colour, background | box, handles, delete button, typing field | ghost and placing; move, resize; the second tap edits |
| Symbols | symbols | `pinching` while a marking is held | the symbol in its look / library, colour, background | box, handles, delete button | ghost and placing; move, resize; the second tap cycles |

- Text and Symbols share, from one module: the state machine for a press (ghost and placing on
  empty music; moving, resizing and the second tap on the selected marking), and the box with its
  handles and delete button. Each gives what differs: what is placed, its ghost, what the second
  tap does, and what a resize sets on the score (the text scale, or the symbol size).
- What each kind does with the panel's colour and background stays as now: both kinds change the
  selected marking; Text's settings take them; for Symbols, the colour goes to the settings and
  the background to the library symbol.
- Text owns its typing field (`_typing.ts`), its ghost, its font, and editing and placing text.
  The field moves the music up through `lift`, not by moving the stage itself. When the layout
  changes and the field's frame is gone, its `drawChrome` finishes typing, as `show()` does now.
- Symbols owns the library and the current symbols: choosing, adding, arranging, cycling, the
  library editor and the glyph picker it opens. Its settings stay in `ToolSettings`. As now, a
  saved library is loaded when the reader opens, and the starter library is made only when it is
  first needed: in `onEquipped`, or when the panel opens. When making it fails, Symbols says so and
  calls `unequip`.

## What goes

- From `ToolHost`: `penColor`, `highlightColor`, `symbolColor`, `placing`, `library`, `cycled`,
  `textGhost`, `newText`, `editText`, `erased`, `eraseEnded`; and, in the reader, `cycledTo`'s
  check that Symbols isn't lent.
- From `ToolPointer`: `holds`.
- From `_KindBehaviour`: `hits`, and the `hits` function beside it.
- From `Input`: the typing special case (`typing`, `finishTyping`), the `.selection-delete` check,
  `penWrites`, `selectingTool`, `pressesMarking`, and choosing between `symbolTool` and `TOOLS`.
- From the cut editor: `inking`, and its long press on the music (the hand tool's now).
- From `Reader`: every method and field particular to text or symbols, `lookOf`, `panelColor`,
  `panelBackground`, `lentFrom`, `SelectionBox`, and finishing typing in `show()`; `ToolChoice` and
  `placesMarkings` from `_toolbar.ts`.
- From `scores/placing.ts`: `placedAt`, which selecting by `hitDistance` replaces.
- The toolbar's special cases for Text, Symbols, Pen and Highlight: it draws every button from the
  face its tool last set, with a long press when the tool has a panel; `ToolbarView`'s `symbol`,
  `textLook`, `symbolLook`, `penInk` and `highlightInk` go.

## Docs

`ARCHITECTURE.md` says, where it describes the tools and the reader now: who does what, the
steps deciding a press, the suppressions, the lend stack, and how to add a tool (a file in
`reader/tools/`, a line in `makeTools`).
