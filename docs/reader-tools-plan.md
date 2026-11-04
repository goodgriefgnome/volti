# Tools and the reader: plan

How to get to what `reader-tools-spec.md` describes. Read the spec first; where the two disagree,
the spec wins. Each stage is one commit, or a few, and every commit leaves `npm test` and
`npm run build` passing. Before each push, also try the stage in the running app (`npm run dev`)
with the checks it lists. Commit and push each stage before starting the next.

The tests run in Node, without a DOM. Logic worth testing goes in pure functions next to the code
that uses them, as `_tapAction` and `_lifted` are now (`reader/tools/_placing.ts`), and the tests
call those.

Code style: match what is there. Each new module starts with a comment saying what belongs in it.
Comments say what something is or why, in the same tone as the code around them.

## Stage 1: `hitDistance` in place of `hits`

In `markings/model.ts`:

- In `_KindBehaviour<M>`, replace `hits` with:

  ```ts
  /**
   * How far `p` is from it, in page widths, when within `radius` of it (0 on it); undefined when
   * further. `aspect` is its page's height / width.
   */
  hitDistance(m: M, p: Point, radius: number, aspect: number): number | undefined;
  ```

- Replace the exported `hits` with
  `export const hitDistance = (m: Marking, p: Point, radius: number, aspect: number) => behaviour(m).hitDistance(m, p, radius, aspect);`

In `markings/stroke.ts`:

- Replace `_touches` with `_hitDistance(stroke, p, radius, aspect)`: the least `segDist` over the
  segments (or the distance to the one point), less half the stroke's width (`stroke.size / 2`),
  and never below 0; undefined when that is more than `radius`. `y` is scaled by `aspect`, as now.
- `_strokes.hitDistance` is `_hitDistance`.

In `markings/placed.ts`:

- `_placed.hitDistance`: with `e = markExtent(m)` (undefined when there is no ink: give
  undefined), the box `e * m.size` round `m.at`, and `dx`, `dy` (scaled by `aspect`) from `m.at`
  to `p` as in `hits` now: the distance from `p` to that box,
  `Math.hypot(Math.max(e[0] * m.size - dx, 0, dx - e[2] * m.size), Math.max(e[1] * m.size - dy, 0, dy - e[3] * m.size))`;
  undefined when more than `radius`.

In `reader/tools/_eraser.ts`, `eraseAt` keeps a marking unless
`hitDistance(m, q, ERASER_RADIUS / host.zoom().s, aspect) !== undefined`.

Tests:

- `markings/stroke.test.ts`: the `touches` cases become `_hitDistance` cases (a number where they
  were true, undefined where false). Add: a point on the line gives 0; a point 0.01 page widths off
  a line of width 0.004 gives 0.008.
- `markings/placed.test.ts`: the "are hit within their extent" and "are hit by a point in their
  padding" cases become `hitDistance` cases. Add: 0 inside the extent; the distance to the nearest
  edge outside it, and to the corner diagonally; undefined beyond the radius.

No change in the app. Check: the eraser still takes away strokes, text and symbols it touches,
zoomed in and out.

## Stage 2: selecting by `hitDistance`

In `scores/placing.ts`, replace `placedAt` with:

```ts
/**
 * The marking shown on the frame with the least `hitDistance` from p (frame coordinates) within
 * `radius` (frame widths), among those `owned`; of those as near, the one drawn last.
 */
export function markingAt(
  frame: Frame, ink: ScoreInk, aspects: Aspects, p: readonly [number, number], radius: number, owned: (m: Marking) => boolean,
): { cut: Cut; mark: Marking } | undefined
```

- Go through `frame.items` in order and each cut's ink in order, skipping markings that aren't
  `visible` (`scores/ownership.ts`) or not `owned`. Turn `p` into a point on the cut's page as
  `eraseAt` does: `[p[0], cut.y0 + (p[1] - item.top) / aspect, 0]`. Keep the marking when its
  distance is less than or equal to the best so far, so the last drawn wins a tie.
- A frame is a page wide, so page widths are frame widths: `radius` needs no conversion.

Until stage 6 every caller passes `owned: (m) => 'kind' in m` (placed markings only) and casts the
result's `mark` to `PlacedMark`: `pressesMarking` and `placingTool` in `reader/tools/_placing.ts`.

Tests (`scores/placing.test.ts`): replace the `placedAt` tests. Check: the nearest of two by their
edges, not their centres (a small marking beside a big one, the press nearer the small one's edge
but the big one's centre); the one drawn last where two are both under the press; one in a later
cut beats one in an earlier cut at the same distance; a press on a background beyond the ink; none
beyond the radius; a marking `owned` refuses is skipped.

Check in the app: tapping between two symbols close together selects the nearer by its ink; where
two overlap, the one on top.

## Stage 3: the lend stack

A new module, `reader/_lending.ts`, pure:

```ts
// The lend stack: the tool equipped by its button at the bottom, and the tools lent on top of it,
// by a selection or for one press. Pure: what equipping and unequipping does is the reader's.

/** Why a tool is on the stack above the bottom. */
export type LendReason = 'selection' | 'press';

/** What a change to the stack did, for the reader to tell the tools: in the order to tell them. */
export interface StackChange<T> { unequipped: T[]; equipped: T[] }

export class LendStack<T> {
  constructor(bottom: T);
  /** The tool on top. */
  get active(): T;
  /** The tool equipped by its button. */
  get bottom(): T;
  /** Whether `reason` has a lend on the stack. */
  has(reason: LendReason): boolean;
  /** A tool equipped by its button: the stack is only it. */
  equip(tool: T): StackChange<T>;
  /** Lend `tool` for `reason`, replacing a lend for that reason already there; nothing when it is already on top. */
  lend(tool: T, reason: LendReason): StackChange<T>;
  /** Take the lend for `reason` off, wherever it is. */
  end(reason: LendReason): StackChange<T>;
}
```

- A tool is equipped when it goes on the stack and unequipped when it leaves it; the same tool can
  be on the stack only once (a lend of a tool already on the stack, but not on top, moves nothing
  and returns an empty change).
- `StackChange` lists what left the stack, then what came on.

Tests (`reader/_lending.test.ts`): equipping clears every lend; a selection's lend on top of the
bottom; a press's lend on top of a selection's lend, and ending the selection's lend under it
leaves the press's on top, then ending that gives the bottom; a second selection's lend replaces
the first; lending the tool on top changes nothing; the changes list the right tools in order.

In `reader/reader.ts`, `tool` and `lentFrom` become one `LendStack<ToolChoice>` (bottom `'none'`):
`useTool` is `equip`, `lend` is `lend(kind, 'selection')`, `deselect`'s giving back is
`end('selection')`. `this.tool` reads become `this.stack.active`. Nothing else changes yet.

Check in the app: every check under "Selecting a marking lends its tool" in `TODO.manual.md`.

## Stage 4: the new `Tool` interface

In `reader/tools/_tool.ts`, add `Press`, `Suppressions`, the new `Tool` and the new `ToolPointer`
exactly as the spec gives them, and change `ToolHost`:

- `erased` and `eraseEnded` become `show(s, slot)` and `undoTo(before, slot)` (the reader's
  `erased` and `eraseEnded`, renamed).
- Add `setButtonFace(face: ButtonFace)`, `unequip()`, `layer(slot)` and `lift(px)`, implemented in
  the reader as no-ops for now, except `unequip`, which is `useTool('none')`.

Make every tool an object made for one reader:

- `reader/tools/_tools.ts` exports `makeTools(host: ToolHost, hand: HandHost): Record<ToolName, Tool>`
  in place of `TOOLS`, and `TOOLBAR: ToolName[][] = [['pen', 'highlighter', 'eraser'], ['text', 'symbol']]`,
  the toolbar's groups in order. `HandHost` is declared now; the hand tool comes in stage 5, so
  until then `makeTools` leaves it out and `ToolName` is without `'hand'`.
- Pen, Highlight and Erase: `start(press)` is what `start(host, slot, p)` is now, with
  `press.slot!` and `press.framePoint`; `suppressions()` gives `{ selecting: true }`.
- `placingTool` takes the host when it is made and gives the new `Tool`; its pointer's `holds`
  becomes the tool's `suppressions()` giving `{ pinching: true }` while one of its pointers holds a
  marking. `selectingTool` stays as it is, made the same way.
- `ToolPointer.move(p, client)` is renamed `move(framePoint, screenPoint)` everywhere.

In `reader/_input.ts`, `Input` takes the tools, builds a `Press` and calls
`tools[tool].start(press)`; the `symbolTool` and `TOOLS` choice goes. Where it asks
`this.active?.use.holds?.()`, it asks `tools[active tool].suppressions?.().pinching`.

Tests: `_placing.test.ts` builds its tool with the host and presses with a `Press`; the "holds a
second finger off" case asks `suppressions()`.

No change in the app. Check: every tool as before, and a second finger while moving a symbol.

## Stage 5: the hand tool

A new module, `reader/tools/_hand.ts`: the tool when no other is equipped, with no button. It
starts with the module comment from the spec's description of the hand tool.

- `start(press)`: a pan from `press.screenPoint`, as `Input`'s `panning` is now (`drag` from
  `render/zoom.ts`, through `HandHost.setZoom`). On lifting, a tap (`isTap` from `_gestures.ts`)
  calls `toggleToolbar()`. While Cuts is on and the press hasn't moved more than 6 px, after
  `LONG_PRESS_MS` it calls `cutMenu(press.screenPoint)` and drops the pan.
- `ToolName` gains `'hand'`; `ToolChoice` in `_toolbar.ts` becomes `ToolName`, with `'hand'` where
  it was `'none'` (in `LendStack`'s bottom too).

The reader implements `HandHost`: `cutMenu` opens the cut editor's context menu
(`openContext` in `cuts/_menus.ts`).

Out of the cut editor (`cuts/_editor.ts`): `inking` from its host, and the long press it starts on
the music in `onDown`; its long press on a tab stays.

Out of `Input`: `panning`, and the hand's tap. With the hand tool, a press on a marking still goes
to `selectingTool`, as now, until stage 7.

Check in the app: with no tool, a drag pans, a tap hides and shows the toolbar, a long press with
Cuts on opens the cut menu (and doesn't with Cuts off), a long press on a tab opens its menu; with a
tool, none of these happen on the music.

## Stage 6: deciding who gets a press

Put the steps of the spec's "Deciding who gets a press" in `Input.onDown`, in that order.

- Step 1: when `overlayOpen()`, close it and stop (the cut editor's own check goes).
- Step 2: a press whose target is inside an element with `data-own-presses` is left alone: no
  capture. The `.selection-delete` check goes; the delete button gets `data-own-presses` (in
  `_selection.ts`, until stage 8 moves it).
- Step 3: `suppressions().allPresses`: the press goes to the active tool's `start`. Until stage 9,
  Text's `suppressions()` gives `allPresses` while the reader's typing field is open (through a
  temporary `typing(): boolean` on its host), and its `start` finishes typing and declines. The
  typing field gets `data-own-presses`. `Input`'s `typing` and `finishTyping` go.
- Step 7: page turns no longer look at the tool: `penWrites` goes.
- Step 11: when `start` gives undefined, the hand tool's `start` gets the press.

To test the order, add a pure function in `_input.ts` for the steps after the pointer is known to
be a single press on the stage (steps 6 to 11):

```ts
/** What a press goes to, from what is known of it as it goes down. */
export function _route(f: {
  onTab: boolean; turn: 'next' | 'prev' | null; toolbarShown: boolean; eraserButton: boolean;
  onFrame: boolean; selecting: boolean;
}): 'tab' | 'turn' | 'toolbar-tap' | 'select' | 'tool' | 'hand'
```

Tests (`reader/_input.test.ts`): a tab wins over a turn; a turn wins with every tool and the
eraser button; with the toolbar hidden only the middle tap; off the frames, the hand; selecting
before the tool unless suppressed.

Check in the app: with Pen, the stylus turns the page at each side and writes elsewhere, and a
stroke started outside a band goes on into it; the delete button and the typing field work as
before; a press elsewhere while typing only finishes typing.

## Stage 7: selecting in the reader

- `Tool` gains `ownsMarking` and `isChromeAt` (spec). Text owns `m.kind === 'text'`, Symbols
  `m.kind === 'symbol'`. `isChromeAt` is `pressOnSelection` on the box and handles worked out by
  `selectionOn` (`_placing.ts`), moved into the tool.
- Step 10 in `Input`, unless `suppressions().selecting`:
  1. With a marking selected and `isChromeAt` true: the active tool's `start` with
     `on: { what: 'chrome' }`.
  2. `markingAt(…, 12 / (slot.w * zoom.s), (m) => some tool owns m)`: the reader selects it,
     lends its owner (`lend(owner, 'selection')`), and calls the owner's `start` with
     `on: { what: 'grabbed', sel }`.
  3. With a marking selected: the reader ends the selection; nothing else.
- `placingTool`'s `start` reads `press.on` instead of testing the press itself: `'grabbed'` and
  `'chrome'` on the box are a move, `'chrome'` on a handle a resize (the tool still works out which
  handle), none is empty music. `_tapAction` loses its `'deselect'` (the reader does that). The
  second tap is `'again'` when the grabbed marking was already the selected one before this press.
- Step 9: the eraser button calls `lend('eraser', 'press')`, and the pointer lifting `end('press')`.
  The selection ends only when its marking is gone (`refreshSelection` no longer deselects for a
  tool that doesn't place).
- Out: `selectingTool`, `pressesMarking`, and `Input`'s test for a press on a marking.

Tests: `_tapAction`'s cases without `'deselect'`; `_placing.test.ts`'s press cases with `press.on`
in place of the hit test.

Check in the app: with no tool, a press on a symbol lights Symbols at once and a drag moves it; the
same with Text as the tool; with Pen, a press on a symbol writes; a press on empty music with a
marking selected only deselects, with every tool; the stylus's eraser button while a symbol is
selected lights Erase, hides the box, erases, and gives the symbol's selection and Symbols back on
lifting; erasing the selected symbol with it ends the selection and gives back the tool from
before the selection.

## Stage 8: chrome, faces and the selection's notifications

- The reader makes, for each tool, a chrome layer in each slot's box (an absolutely positioned
  `div` covering it, class `tool-layer`, `pointer-events: none` with `data-own-presses` children
  set to `auto`), new each time the slots are, and shows only the active tool's (`hidden` on the
  others). `ToolHost.layer(slot)` gives it.
- `SelectionBox` (`reader/_selection.ts`) moves to the module Text and Symbols share (stage 7's
  `_placing.ts`), and each of the two has its own, drawing into its own layers. `drawChrome()` and
  `onSelectionChanged()` are as the spec says. The reader calls `drawChrome()` after `onEquipped`,
  after `show()` lays out the slots, and in `setZoom`; it calls every tool's `onSelectionChanged()`
  wherever `refreshSelection` shows or hides the box now. A drag hides the box through the tool's
  own state (out of the reader's `paintState`).
- `delete()` on the host is the reader's `deleteSelected`; the delete button calls it.
- `setButtonFace(face)`: the toolbar keeps each tool's last face and draws it when its `key`
  changes. `Toolbar` builds a button for every tool in `TOOLBAR`, with a rule between groups, its
  label as `aria-label` and `title`, and a long press when the tool has `showPanel`. Each tool sets
  its face when made and whenever its look changes:
  - Pen and Highlight: the icon (the path moves from `TOOL_ICONS` into the tool) and the colour bar;
    on `setSettings` changes.
  - Erase: the icon.
  - Text and Symbols: what `textButton` and `symbolButton` draw now, for the selected marking when
    it owns it, else its settings (what `lookOf` and `buttonSymbol` work out now).
  - The toolbar's `symbol`, `textLook`, `symbolLook`, `penInk`, `highlightInk`, `TOOL_ICONS`,
    `textButton` and `symbolButton` go; `ToolbarActions`' `symbols`, `textPanel`, `symbolPanel` and
    `colors` become one `panel(name: ToolName)`.

Check in the app: the box and its handles while zooming; the box hidden during a drag; the buttons'
faces for the selected marking and after deselecting; long presses on every tool's button.

## Stage 9: Text owns its state

Move into `reader/tools/_text.ts` (or a new `reader/tools/_text-tool.ts` if it grows past what
reads well in one file): `prepareGhost`, `ghostText`, `ghostFont`, `textGhost`, `newText`,
`placeText`, `textSite`, `editText`, `retext`, `shaped`, `setFont`, `textPanel`, the text half of
`lookOf`, `panelColor` and `panelBackground`, and the `TypingField`.

- `TypingField` takes a `lift: (px: number) => void` in place of the stage, and calls it where it
  sets `stage.style.translate` now. The reader's `lift` sets that translate.
- Text's `suppressions()` gives `allPresses` while its field is open; the temporary `typing()` from
  stage 6 goes.
- Text's `drawChrome()` finishes typing when the field's slot is no longer among `host.slots()`;
  the reader's `show()` no longer calls `typing.finish()`. `useTool` and `lend` no longer finish
  typing: Text's `onUnequipped` does.
- The reader's `close()` unequips every tool on the stack.
- `onEquipped` prepares the ghost (in place of `syncBar`'s `prepareGhost`).

Check in the app: every text check in `TODO.manual.md`: typing, the keyboard not covering the
field, editing a text marking, its font, colour and background from the panel.

## Stage 10: Symbols owns its state

Move into `reader/tools/_symbol.ts`: `symbolLib`, `group`, `currents`, `adhocCurrent`, `pickerFont`,
`ensureLibrary`, `symbols` (as its `onEquipped`), `currentOf`, `setCurrent`, `cycledTo`,
`chooseSymbol`, `setLibrary`, `addSymbol`, `moveSymbolTo`, `moveGroupTo`, `buttonSymbol`,
`pickedSymbol`, `symbolPanel`, and the symbol half of `lookOf`, `panelColor` and `panelBackground`.

- Cycling always makes the new symbol its group's current one; `cycled` leaves the host.
- When `ensureLibrary` fails in `onEquipped`, the tool says so and calls `host.unequip()`. When the
  library has no symbols left, it calls `host.unequip()` in place of setting the reader's tool.
- The reader keeps loading the saved library at start-up only by making the tool, which starts
  `savedLibrary()` itself.

Check in the app: every symbols check in `TODO.manual.md`: picking, arranging, adding with +, the
library editor, cycling, colour and background from the panel.

## Stage 11: tidying and docs

- Remove what the spec's "What goes" lists and anything else no longer used (`npm run build` shows
  unused imports; search for each removed name).
- `ARCHITECTURE.md`: as the spec's "Docs" says, replacing what it says now about tools, `lookOf`,
  `panelColor`, `panelBackground` and `placingTool`.
- `TODO.manual.md`: a group for this work with the manual checks below.
- Delete `docs/reader-tools-spec.md` and `docs/reader-tools-plan.md`.

## Manual checks at the end

On the tablet, with the stylus and with fingers:

- Pen, Highlight, Erase: writing, highlighting, erasing; the stylus turning the page at each side
  with each; a stroke from the music into a band; the eraser button with every tool.
- Text: placing, typing (keyboard clear of the field), editing, moving, resizing, the panel.
- Symbols: placing, cycling (the cycled symbol is the one the button places next, lent or not),
  moving, resizing, the panel and library.
- Selecting with no tool, with Text, with Symbols; a press on empty music with a selection; the
  delete button; the box at several zooms.
- Lending: every check under "Selecting a marking lends its tool" in `TODO.manual.md`.
- No tool: pan, tap to hide the toolbar, long press for the cut menu with Cuts on; cut tabs.
- Pinch: with every tool; not while moving or resizing a marking.
