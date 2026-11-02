# The reader's toolbar: plan

How to build what `toolbar-spec.md` describes. **Where this plan and the spec disagree, the spec
wins**: build what the spec says and note the disagreement in the commit message.

Work through the stages in order. Each stage is one commit (or a few), and every commit leaves
`npm test` and `npm run build` passing. Each stage also updates `README.md` (the "Using it"
bullets about the reader) and `ARCHITECTURE.md` where they describe what the stage changes, and
adds its manual checks (at the end of this file) to `TODO.manual.md` as a group of its own.

Nothing stored changes, so no data is dropped and nothing is migrated.

Files named below are under `src/`. Line numbers are as of this plan's writing; search for the
names if they have moved.

## Stage 1: the zoom rules, on their own

Pure functions in `render/zoom.ts`, with tests in `render/zoom.test.ts`. Nothing in the app uses
them yet.

Add:

```ts
/** The part of the stage the spread can be seen in: below `top`, the toolbar's height (0 when hidden). */
export interface View { top: number; W: number; H: number }

/** The largest scale at which the whole spread (the W x H stage) fits in the view. */
export function fitScale(v: View): number; // (H - top) / H, and 1 when top is 0

/** A new screen while the toolbar shows: the spread at fitScale, centred in the view both ways. */
export function placeFresh(v: View): Zoom; // s = fitScale(v), x = (W - W*s)/2, y = top + (H - top - H*s)/2

/**
 * Move one edge-pair along one axis by d: the spread covers [pos, pos + len], the view [v0, v1].
 * The move may keep or increase how much of the spread is in the view, never decrease it; what
 * goes past that is lost (the spread sticks).
 */
export function _slide(pos: number, len: number, v0: number, v1: number, d: number): number;

/** A one-finger drag by (dx, dy) from `start`, by `_slide` in each direction. */
export function drag(start: Zoom, dx: number, dy: number, v: View): Zoom;

/**
 * Two fingers that went down `d0` apart around `c0` are now `d` apart around `c`: the scale goes
 * by d / d0, between `minScale` and _MAX_ZOOM, keeping the point under c0 under the fingers'
 * centre, then each direction is settled and slid as below.
 */
export function pinch(start: Zoom, c0: Pt, d0: number, c: Pt, d: number, v: View, minScale: number): Zoom;
```

`_slide`, in words: let `lo = min(v0, v1 - len)` and `hi = max(v0, v1 - len)`, the positions the
rules allow. Moving forward (`d > 0`) it may go up to `max(pos, hi)`; moving back (`d < 0`) down to
`min(pos, lo)`. So `d > 0` gives `min(pos + d, max(pos, hi))`, and `d < 0` gives
`max(pos + d, min(pos, lo))`. This one formula covers all three cases in the spec: the spread
fitting, the spread bigger than the view, and the spread already where the rules don't allow it.

`pinch`, step by step, for each direction:

1. `s = clamp(start.s * d / d0, minScale, _MAX_ZOOM)`.
2. Scale about `c0` without the fingers' travel: `x = c0.x - (c0.x - start.x) / start.s * s`.
3. Settle: if `start` was inside the allowed range for its own size (`lo ≤ pos ≤ hi` at the old
   length), clamp the new position into the allowed range at the new length. This keeps an edge
   that was at the view's edge there. If `start` was outside it, clamp the new position to lie
   between the old position and the allowed range, so it never gets further out.
4. Slide by the fingers' travel `c.x - c0.x` with `_slide`.

Remove `_clamp` and `pan` (replaced by `drag`). Keep `NO_ZOOM`, `_MAX_ZOOM`, `isZoomed` (still
"zoomed in past full size", which `_detail.ts` uses for the close-up), `visiblePart` and
`scrollForPinch`. Add:

```ts
/** Whether z leaves the spread as it is laid out: no transform needed. */
export const isIdentity = (z: Zoom) => Math.abs(z.s - 1) < 0.001 && Math.abs(z.x) < 0.5 && Math.abs(z.y) < 0.5;
```

Until stage 2, `_input.ts` must still compile: change its two calls to use
`drag(start, dx, dy, { top: 0, W, H })` and `pinch(..., { top: 0, W, H }, 1)`. With `top: 0` and
`minScale: 1` these behave as `pan` and `pinch` did.

Tests (replace the `clamp and pan` and `pinch` blocks; keep the others):

- `fitScale`: 1 with `top: 0`; `(800 - 113) / 800` for `{ top: 113, W: 1000, H: 800 }`.
- `placeFresh`: for that view, `s` is `fitScale`, the spread's top is at 113, its bottom at 800,
  and it is centred across (`x * 2 + W * s === W`).
- `_slide`, each case:
  - fits (`len < v1 - v0`): moves freely inside, and stops with an edge at `v0` or `v1`;
  - bigger: moves until an edge meets `v0` or `v1`, and no further;
  - already out (a gap at the bottom, top under the view's top): moving to show more is allowed,
    moving to show less leaves it where it is;
  - `d = 0` returns `pos`.
- `drag` at full size with `top: 113`: dragging down by 200 stops at `y = 113`; dragging up does
  nothing.
- `pinch`:
  - keeps the point between the fingers under them (as the current test);
  - stays between `minScale` and `_MAX_ZOOM`;
  - pinching in with the left edge at the view's left edge keeps it there;
  - pinching in below the view's size leaves the spread inside the view;
  - with `{ top: 0 }` and `minScale: 1`, the results match what the old `pinch` gave for the old
    tests' inputs.

## Stage 2: the pages under the toolbar

The reader uses stage 1. **Fit page** and the button that hides the toolbar go.

`reader/reader.ts`:

- Add `private minScale = 1;` beside `zoom`.
- Add `private view(): View`: `top` is `this.annotating ? this.toolbar.el.offsetHeight : 0`, and
  `W`, `H` are the stage's `clientWidth` and `clientHeight`.
- In `syncBar` (around line 720), after `--bar-h` is set: while `annotating`,
  `this.minScale = Math.min(this.minScale, fitScale(this.view()))`. The zoom itself doesn't
  change.
- `showChrome(show)` (line 726): when hiding, `setZoom(NO_ZOOM)` as now and `minScale = 1`. When
  showing, nothing moves; call `syncBar()` so `minScale` follows the toolbar's height.
- `setZoom` (line 1119): apply the transform whenever `!isIdentity(z)` (not only when zoomed in),
  and `''` otherwise.
- Add `private placeFresh()`: `this.setZoom(this.annotating ? placeFresh(this.view()) : NO_ZOOM)`.
- `show(turned = false)` becomes
  `show(o: { turned?: boolean; place?: 'keep' | 'fresh' } = {})`, with `place` defaulting to
  `'fresh'`. In `show` and `showUnread`, replace `this.setZoom(NO_ZOOM)` with
  `if (place === 'fresh') this.placeFresh()`; pass `place` to `showUnread`. Update the callers:
  - `goTo` passes `{ turned }`, fresh.
  - `turn` (line 982) passes `{ turned: true }`, fresh.
  - `replay`, `playExcerpt` (lines 264–281), the `ResizeObserver` (line 183) and `turnToScore`'s
    failure (line 1028): fresh, except `turnToScore`'s failure, which is `'keep'` (you stay where
    you were).
  - `relisted` (line 387) when still reading the same entry: `'keep'`.
  - `setState` (line 1080): `'keep'` when `target === this.frame` before it changes, otherwise
    fresh.
- Remove the `fit` action and `zoomed` from `syncBar`.

`reader/_input.ts`:

- `InputHost` gains `view(): View` and `minScale(): number`; the reader passes them where it
  builds the `Input` (around line 314).
- `onDown` (line 178): with no tool in use and the toolbar showing, a finger starts `panning`
  whether or not zoomed in (remove the `isZoomed` test). The tap that hides the toolbar is still
  detected in `onUp` from `panning`, as now.
- `onMove`: call `pinch(..., host.view(), host.minScale())` and `drag(pn.start, dx, dy, host.view())`.

`reader/_toolbar.ts`:

- Remove the `fit` button, `ToolbarActions.fit`, `ToolbarView.zoomed` and the lines in `sync` that
  use them.
- Remove the `hide` button, `ToolbarActions.hide`, and `hideIcon()`. The reader's `hide` action
  (line 236) goes.

No new unit tests here: the rules are tested in stage 1. Check it in the app (manual checks).

## Stage 3: Cuts as a show/hide toggle

- `styles/cuts.css`: remove `.editing:not(.chrome-hidden) .stage { top: … }` and its comment.
  The pages no longer move when the cuts show.
- `reader/_toolbar.ts`: the `edit` button becomes `cuts`, labelled **Cuts**, pressed while the
  cuts show. Rename `ToolbarActions.toggleEditing` to `toggleCuts` and `ToolbarView.editing` to
  `cuts`. Remove the `archived` button, `ToolbarActions.openArchive` and `ToolbarView.archived`.
- `reader/reader.ts`: rename at the call sites (lines 254–255, 710–711). Remove `openArchive`.
- `reader/cuts/_editor.ts`: remove the `openArchive()` method (line 209) and its import if nothing
  else uses it; `_insert-picker.ts` keeps its own **Delete archived cuts…**.
- The editor already lets a tab take a press before a tool (`_input.ts`, `editor.onDown` before
  the tool), does nothing on a tap on a tab (`_editor.ts:178`), and opens the cut menu on a press
  and hold only with no tool (`_editor.ts:137`). Leave those as they are.
- Rename the root class `editing` to `cuts` only if it reads better; the `.scope` line still shows
  while the cuts show in a setlist or a named excerpt (line 716).

## Stage 4a: the title menu, for getting around

A new module `reader/_title-menu.ts`, starting with a comment saying what belongs in it: the menu
under the reader's title, listing what can be read next to what is read, and (from stage 4b) the
controls that change that list.

`reader/_toolbar.ts`:

- The title becomes a button: `readonly titleButton` (class `title-button`, `aria-haspopup="menu"`)
  holding the existing `title` span and a chevron icon. Its click calls a new
  `ToolbarActions.titleMenu()`.
- Remove the `scores` button and `ToolbarActions.scores`; `anchor()` takes `'title' | 'more'`.
- Keep **Excerpt** and **Excerpts** in this stage; stage 4b removes them.

`reader/_reading.ts`:

- Add `readWhole()`: `this.what = { kind: 'score' }`. Only for a reader that isn't a setlist.
  Test in `_reading.test.ts`: after `play(0, x)` on a score's reading, `readWhole()` makes
  `what.kind` `'score'` and `excerpt(0)` undefined.

`reader/_toolbar-menus.ts`, `MenusHost`: add `readWhole(): void`. The reader implements it as it
does `playExcerpt` (lines 275–281), calling `this.reading.readWhole()`.

`reader/_title-menu.ts`:

```ts
/** One row of the title menu. */
export interface TitleRow { label: string; current: boolean; go(): void }

/** The rows: a setlist's entries, or Whole score and the score's named excerpts. */
export function _titleRows(h: MenusHost): TitleRow[];

/** Show the title menu below the title. */
export function showTitleMenu(h: MenusHost): void;
```

- In a setlist: a row per item, labelled as `scores()` labels it now (number, title, excerpt
  name, `itemSuffix`), `current` for `h.k()`, `go` is `h.goTo(k)`.
- In a score or a named excerpt: **Whole score** (`current` when `what.kind === 'score'`, `go` is
  `h.readWhole()`), then `sortedExcerpts(score)` (`current` when it is the excerpt read, by
  `sameExcerpt`; `go` is `h.playExcerpt(ends(x))`). Before the score is open, only **Whole
  score**.
- `showTitleMenu` builds each row as an `HTMLElement` (a `.title-row` holding a `.go` button) and
  passes them to `showMenu(h.toolbar.anchor('title'), heading, rows)`. The heading is the setlist's
  title or the score's. The current row gets the class `current` and `aria-current="true"`.
- Move `itemSuffix` here from `_toolbar-menus.ts`; remove `scores()` there.

`styles/reader.css` (or `overlay.css`, where `.menu` is): `.menu .title-row` is a flex row;
`.current` has the accent-soft background and a bolder name, as on board 5.

Tests in `reader/_title-menu.test.ts` for `_titleRows`, with a fake `MenusHost` (only the fields
`_titleRows` reads): a setlist gives a row per item with the current one marked; a score gives
**Whole score** first and its excerpts in library order; a named excerpt marks its own row.

## Stage 4b: the controls in the title menu

### Sharing drag to reorder

Move the library's `dragToReorder` (`library/_setlists-section.ts:157`) to a new module
`ui/drag-reorder.ts` (comment: dragging a row of a list by its handle to another place in the
list), as

```ts
export function dragToReorder(handle: HTMLElement, row: HTMLElement, list: HTMLElement, i: number, move: (to: number) => void): void;
```

with the same body, calling `move(to)` where it called `lib.update(moveEntry(s, i, to))`. The
library calls it with `(to) => void this.lib.update(moveEntry(s, i, to))`. No change in behaviour:
do this in its own commit first.

### The menu's +

`ui/overlay.ts`: `showMenu` gains an optional last parameter `action?: HTMLElement`, shown at the
right of the menu's first label (wrap the label and the action in a `.menu-head` row). Nothing else
passes it.

### Rows and buttons

`reader/_title-menu.ts`:

- `TitleRow` gains `change?(): void` and `remove?(): void`; setlist rows also get `index`.
- Setlist rows: a grip button (class `grip`, `aria-label="Move …"`, using `dragToReorder` with
  `move: (to) => { change(moveEntry(s, i, to)); h.relisted(currentEntryId); showTitleMenu(h); }`),
  the `.go` button, a swap button (`aria-label="Change excerpt of …"`), a bin
  (`aria-label="Remove … from setlist"`).
- Score rows: **Whole score** has only `.go`. Each named excerpt has `.go`, swap
  (`aria-label="Change …"`) and bin (`aria-label="Delete …"`).
- The heading's `+`: **Add scores…** in a setlist (`addScores()`, moved from `_toolbar-menus.ts`),
  **Add excerpt…** otherwise (`addExcerpt` from `dialogs/excerpts.ts`, as `excerpts()` calls it
  now).
- Icons: the swap is two passing arrows (`M4 8h15l-4-4M20 16H5l4 4`), the bin and the grip as on
  boards 5 and 6.

### The menu coming back

```ts
/** Open the title menu again once the dialog opened now closes, unless another took its place. */
function reopenAfter(h: MenusHost): void;
```

It calls `whenOverlayCloses(() => setTimeout(() => { if (!overlayOpen()) showTitleMenu(h); }))`.
Call it right after opening each dialog from the menu (the excerpt picker, the confirmations, Add
scores, Add excerpt). A dialog that opens another in its place (Add scores' preview) doesn't bring
the menu back; that is accepted.

### What the buttons do

- **Setlist swap**: `async changeEntry(h, k)`. Add `ensure(k): Promise<OpenScore | null>` to
  `MenusHost` (the reader: `this.scores.ensure(k, true)`). With the score open, open the excerpt
  picker as `excerpt()` does for an entry now (lines 365–374), for entry `k`. On done:
  `reading.play(k, excerpt)`, `saver.soon(cur)`, then `h.replay()` when `k` is the item read,
  otherwise `h.relisted(entry read's id)` so the titles update.
- **Setlist bin**: `confirmRemove(h, k)`: a dialog "Remove “title” from “setlist”?" with
  **Cancel** and **Remove** (`danger`). **Remove** does what `removeEntry` does now, for entry `k`
  (move `removeEntry` here and give it `k`): when `k` is the item read, `h.relisted(undefined, k)`
  as now; otherwise `h.relisted(entry read's id)`. Keep the Undo toast.
- **Excerpt swap**: a new `changeExcerpt(src, x, h, moved?)` in `dialogs/excerpts.ts` (comment:
  "Change a named excerpt's name and cuts together"), replacing `renameExcerpt` and
  `changeExcerptCuts` for the reader. It opens the picker with `name: now.name`, `problem` as
  `changeExcerptCuts` has it but passing the typed name, and on done saves
  `moveExcerpt(score, h.setlists, now, excerpt, name)`. Keep `renameExcerpt` and
  `changeExcerptCuts` for the library.
- `setlists/model.ts`: `moveExcerpt` gains an optional last parameter `rename?: string`, used in
  place of `name.name`. Tests in `setlists/model.test.ts`: renaming and moving at once updates the
  name, the cuts and every entry that played it; renaming alone leaves the cuts.
- When the excerpt read is changed, follow it as `excerpt()` does now (`play`). When the reading is
  of the excerpt that is deleted, `deleteExcerpt` from `_toolbar-menus.ts` (line 166) does it; move
  it here.

### Removing what the menu replaces

- `_toolbar.ts`: remove the `excerpt` and `excerpts` buttons and their actions.
- `_toolbar-menus.ts`: remove `excerpt()`, `excerpts()`; in `more()`, remove the named excerpt's
  **Rename…** and **Delete…**; in `setlistMenu`, remove **Add scores…** and the entry's items
  (the `e && …` lines). Update the module's top comment.
- `styles`: remove `.excerpt-list` rules if nothing else uses them.

Tests: extend `_title-menu.test.ts` so rows carry `change` and `remove` where the spec says, and
**Whole score** carries neither.

## Stage 5: Symbols as a tool

`reader/_symbols.ts`, a pure helper:

```ts
/**
 * The symbol the Symbols button shows and picks: the current symbol of `group` (-1 for the
 * ad-hoc group); when that group is gone or empty, the first symbol of the first group with
 * symbols; null when the library has none.
 */
export function lastSymbol(lib: SymbolLibrary, group: number, currents: readonly number[], adhocCurrent: number): { group: number; index: number } | null;
```

Tests in `reader/_symbols.test.ts`: the current symbol of a group; the ad-hoc group's; a group
index past the end falls to the first group with symbols; an empty first group is skipped; an
empty library gives null.

`reader/reader.ts`:

- Remove `groupsShown` and `toggleGroups()` (lines 601–608).
- Add `private async symbols()`: load the library if needed (as `toggleGroups` does); if
  `this.tool === 'symbol'`, `useTool('none')`; otherwise take `lastSymbol(...)`, and if there is
  one, set `this.group` to its group and `useTool('symbol')`. Then `syncBar()`.
- `setLibrary` (line 642): move `this.group` to the fallback whether or not Symbols is the tool;
  turn the tool off only when the library has no symbols.
- `syncBar`: pass `tool === 'symbol'` where `groupsShown && tool !== 'text'` was passed to
  `symbolRow.show`.

`reader/_toolbar.ts`:

- `ToolbarActions.symbols` keeps its name, now meaning "use the Symbols tool".
- `ToolbarView.groupsShown` becomes `symbol?: LibrarySymbol`, the symbol to draw on the button
  (undefined: the generic *pp*). `sync` draws it with `symbolPicture` (`_symbol-picture.ts`) in
  the button's colour, and marks the button pressed when `tool === 'symbol'`. Its `aria-label` is
  "Symbols".

## Stage 6: the second row per tool, and colours

`reader/_toolbar.ts`:

- The top row's swatches show only while Pen is the tool: replace `.writing .bar .swatches`
  (`reader.css:47`) with a class the toolbar sets, `pen`. Remove the Default swatch from the top
  row.
- `sync`: a swatch is pressed when `tool === 'pen'` and it is the pen's colour.

`reader/_symbol-row.ts`:

- `show` gains `colors: ColorsView | undefined`:
  `export interface ColorsView { pressed?: string | 'default'; enabled: boolean }`. When defined,
  it shows a `Colour` label, a **Default** button and the three pen colours, after the groups or
  the fonts and before the backgrounds. Add `color(c: string | 'default'): void` to
  `SymbolRowActions`.
- Label the fonts **Font** and the backgrounds **Background** (small grey labels, as on board 2).

`reader/reader.ts`:

- Split `swatch(c)` (line 411) in two: `penColor(c)` sets the pen's colour (no switching tools;
  the swatches only show with Pen), and `markColor(c: string | 'default')` changes the selected
  marking's colour (`'default'` does what `defaultColor()` does now).
- `syncBar`: pass `colors` when Text or Symbols is the tool: `pressed` is the selected marking's
  colour, or `'default'` when it has none; `enabled` is whether a marking is selected.

## Stage 7: the look

Make the toolbar look like boards 1–6 of the mocks.

`reader/_toolbar.ts`:

- Layout: one row, `[back][title button][page info] — tools — [⋯]`, with flexible space on both
  sides of the tools.
- Tools as icons: add `const TOOL_ICONS: Record<ToolName, string>` (SVG path data) for pen,
  highlighter, eraser, text, and a helper `icon(d: string): SVGSVGElement` like `backIcon()`. Each
  tool button gets `aria-label` and `title` from `TOOLS[t].label`. Paths: pen
  `M4 20l4-1 11-11-3-3L5 16z`, highlight `M5 20h7M7 16l9-9 3 3-9 9H7z`, erase
  `M8 20h12M5 15l8-8 5 5-6 6H9z`, text `M5 6h14M12 6v13`.
- **Cuts** keeps its label, with a scissors icon before it.
- **Undo** and **Redo** as icons with `aria-label`s. **⋯** as three dots.
- Thin separators (`.rule`) between the drawing tools, the placing tools, Cuts, and Undo/Redo.

`styles/reader.css`:

- `.bar`: one row; buttons 44 px high, no border, 10 px corners; pressed buttons as now (light
  background, dark icon). The second row (`.symbol-row`) on a slightly lighter background with a
  hairline above.
- The title: the brand font as now; it shortens with an ellipsis before anything wraps. On a
  screen too narrow for the row, the row wraps as now.

`ARCHITECTURE.md` ("A new tool", line 100): a new tool also needs its icon in `TOOL_ICONS`.

## Manual checks

Run these on the tablet after each stage that touches them (in brackets), and add each stage's to
`TODO.manual.md`.

- **The pages under the toolbar** (2):
  - Open a score; tap the middle: the toolbar shows and the pages don't move.
  - With no tool, drag down: the top of the page comes out from under the toolbar and stops when
    its top meets the toolbar. Drag up: it goes back, and stops at the screen's bottom edge.
  - Pinch out: the pages shrink until they fit below the toolbar, and no further. Pinch in, then
    drag: nothing moves past the screen's edges.
  - Turn the page with a side band: the next page shows whole below the toolbar, centred. Turn
    back: the same.
  - Tap the middle with no tool: the toolbar hides and the page is at full size again.
  - In a setlist, turn past the end of a score: the next score's first page shows whole below the
    toolbar.
  - Rotate the tablet with the toolbar showing: the page shows whole below it.
  - There is no **Fit page** and no hide button.
- **Cuts** (3):
  - Tap **Cuts**: the tabs show and the pages don't move. Drag down to reach the top tabs; drag one:
    the cut changes. Tap a tab: nothing happens. Press and hold the music with no tool: the cut menu.
  - With Pen on and the cuts showing: drawing works; a press on a tab drags the tab.
  - Remove a cut with markings, then press and hold: **Insert** lists it, and has **Delete archived
    cuts…**. There is no **Archived** on the toolbar.
- **The title menu** (4a, 4b):
  - In a setlist, tap the title: its entries, the current one highlighted. Tap another: it opens.
  - Drag an entry by its grip: it moves; the menu stays open with the new order.
  - Swap on another entry: the excerpt picker for it; choose cuts; the menu comes back with its
    excerpt's name.
  - Bin on the current entry: asked first; **Remove** goes on to the next entry, and the menu
    comes back; **Undo** in the toast puts it back.
  - **+**: Add scores; the added ones are at the end, and the menu comes back.
  - In a score: **Whole score** highlighted, then its excerpts. Tap one: it reads that excerpt; tap
    the title again: that excerpt is highlighted; **Whole score** goes back to the whole score.
  - Swap on an excerpt: the picker with its name; change the name and the cuts: both change, and a
    setlist that played it plays the new cuts.
  - Bin on the excerpt being read: asked first; then the next excerpt is read.
  - **+**: Add excerpt.
  - The ⋯ menu has no Add scores, Move up, Move down, Remove from setlist, Rename (of an excerpt)
    or Delete (of an excerpt). There is no **Scores**, **Excerpt** or **Excerpts** button.
- **Symbols** (5):
  - Open a score: the Symbols button shows the first symbol of the first group. Tap it: it is the
    tool, its group pressed in the second row. Tap it again: the tool is put away and the second
    row goes.
  - Pick *pp* in its group, put the tool away, tap Text, then Symbols: *pp* is the tool again, and
    the button showed *pp* meanwhile.
  - Delete *pp* in **Edit library…**: the button shows its group's first symbol.
  - Close the reader and open it again: the button shows the first symbol of the first group.
- **Colours** (6):
  - Pen: three colours in the top row. Highlight and Erase: none.
  - Text or Symbols with nothing selected: Colour and Background are greyed out. Select a marking:
    they change it; **Default** gives it the default colour.
- **The look** (7): the toolbar matches the mocks in landscape; in portrait the title shortens
  before anything wraps.

## Decisions made in this plan

These weren't discussed; overrule any of them.

- "The spread" is the whole stage the pages are laid out in, not only the pages.
- Rotating the tablet, going to an entry or excerpt from the title menu, and an edit that shows
  another screen all place the screen as a turn does.
- A dialog from the title menu that hands over to another dialog doesn't bring the menu back.
- **Remove from setlist** asks first and also keeps its Undo toast.
- In a score, tapping a named excerpt in the title menu reads that excerpt (as from the library),
  rather than going to its first page in the whole score as **Excerpts** does now.
- Colour in the second row changes only the selected marking, as now; it doesn't set the colour of
  new markings.
- The title shortens with an ellipsis on a narrow screen before the row wraps.
- Before the symbol library loads, or when it has no symbols, the Symbols button shows a generic
  *pp*.
