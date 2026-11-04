# Ink on the page, passes on the cuts: plan

How to get to what `page-ink-spec.md` describes. Where the two disagree, the spec wins. Read the
spec first.

Every push to `main` deploys the app (`.github/workflows/deploy.yml`), so every stage must leave a
working app that loses no one's markings. That is why stage 3 is one large stage: the conversion of
stored scores and the code that reads the new form go out together.

Each stage is one commit unless it says otherwise. Before each commit run `npm test` and
`npm run build`; both must pass. Match the code's style: short comments in full sentences saying
what a thing is or why, names spelled out, no comment that only repeats the code. New modules start
with a comment saying what belongs in them.

## Stage 1: The version of the stored data

Nothing the user sees changes: the app's data version is 1, and there is no step yet.

**`src/storage/keys.ts`**: add

```ts
/** The version of the stored data, a number; none is version 1 (src/stored-data.ts). */
dataVersion: 'data-version',
```

and add `src/stored-data.ts` to the modules the header comment says may use the kv store.

**New `src/stored-data.ts`**, starting with a comment such as: "Bringing the stored data up to the
app's version at start-up: the version kept in the kv store, and the steps from each version to
the next. A change to what is stored adds a step here and raises DATA_VERSION."

```ts
/** The version of the stored data this app reads and writes. */
export const DATA_VERSION = 1;

/** A step brings the whole store from one version to the next. Run again after failing partway, it finishes what is left. */
export type Step = () => Promise<void>;

/** Each step, by the version it starts from. */
const STEPS: Record<number, Step> = {};

/** Where the version is kept: the kv store, or a stand-in in tests. */
export interface VersionStore { get(): Promise<number | undefined>; set(version: number): Promise<void> }

/**
 * Run each step from the stored version up to `target`, in order, raising the stored version after
 * each; `starting` is called once, before the first step, when there is one. 'newer' when the
 * stored version is above `target`: nothing runs. A step's error is thrown on, after the versions
 * of the steps before it are stored.
 */
export async function _upgrade(store: VersionStore, steps: Record<number, Step>, target: number, starting: () => void): Promise<'done' | 'newer'>;

/** _upgrade on the kv store, with STEPS, to DATA_VERSION. */
export const upgradeStoredData = (starting: () => void) => _upgrade(kvVersion, STEPS, DATA_VERSION, starting);
```

`kvVersion` is a private `VersionStore` over `kv.get(keys.dataVersion)` and `kv.set(...)`; a
missing version reads as 1.

**`src/main.ts`**, in `start()`: after `await takeUpdate(...)`, and before `splash.remove()`, bring
the data up to date on the start screen:

- call `upgradeStoredData(() => { note.textContent = 'Updating your scores…'; })`;
- on `'newer'`: set the note to "These scores were saved by a newer version of Volti. Open Volti
  again to update it." and stop: never remove the splash, never go on;
- on an error: `console.error` it, set the note to "Could not update your scores.", and add a
  "Try again" button (`button` from `ui/dom.ts`) under the note. Its click removes the button and
  runs `upgradeStoredData` again, the same way. Write this as a small loop (a promise resolved by
  the button's click), so it can fail and be retried any number of times.
- only once it resolves `'done'`, `splash.remove()` and go on as now.

If the start screen's note or a button needs a style, add it next to `.start-note` in the
stylesheets (`grep -rn start-note src/styles`).

**Tests**, new `src/stored-data.test.ts`, with a `VersionStore` over a variable and steps that
record their calls:

- no stored version and target 1: no step runs, `starting` is not called, `'done'`;
- stored 1, target 3, steps 1 and 2: both run, in order; `starting` called once, before step 1;
  the stored version is 3;
- stored 2, target 3: only step 2 runs;
- step 2 throws: the error comes out, and the stored version is 2 (step 1's was kept);
- run again after that: only step 2 runs;
- stored 4, target 3: `'newer'`, no step runs, `starting` not called, version still 4.

## Stage 2: The new fields, and converting a version 1 score

Nothing the user sees changes. Add the new optional fields (unused yet), and the pure conversion
with its tests; it is not run yet.

**`src/scores/model.ts`**:

- In `Cut`, add
  ```ts
  /** Which pass of its page this cut plays, from 1; none is pass 1. */
  pass?: number;
  ```
- Add `export const passOf = (c: Cut) => c.pass ?? 1;`

**`src/markings/stroke.ts`** (`Stroke`) and **`src/markings/placed.ts`** (`PlacedMark`): add

```ts
/** The one pass of its page it belongs to (see Cut.pass); none: every pass. */
pass?: number;
```

`compact` and `copy` of both kinds spread the marking, so they keep it; a test below checks that.

**New `src/scores/_version1.ts`**, starting with a comment such as: "Scores as stored before
version 2 of the stored data, when each cut had its own ink and removed cuts with ink were
archived, and converting one to version 2. Only stored-data steps use it." Its types are a frozen
copy of the old form, so later changes to `Score` don't change them:

```ts
/** A cut as stored in version 1. */
export interface V1Cut { id: string; page: number; y0: number; y1: number; pad?: number; ownInk?: boolean }

/** A score as stored in version 1 (without its id, which is its key). Other fields are carried over as they are. */
export interface V1Score { cuts: V1Cut[]; archived?: V1Cut[]; [other: string]: unknown }

/** A score's ink as stored in version 1: markings by cut id. */
export type V1Ink = Record<string, Marking[]>;

/** The same score and ink in version 2: no archived cuts and no `ownInk`; markings by page. */
export interface V2Stored { score: { cuts: Cut[]; [other: string]: unknown }; ink: Record<number, Marking[]> }

/** Whether a stored score is still in version 1: it has `archived` (every version 1 score had it), or ink kept under a cut id. */
export function _isVersion1(score: V1Score, ink: V1Ink | undefined): boolean;

/**
 * Convert a version 1 score and its ink, as the spec's "From version 1 to 2" says: every cut pass 1
 * (no `pass` stored) and without `ownInk`; each cut's markings, played cuts in order then archived
 * ones, on the cut's page, without a pass; of markings on a page equal as JSON, the first kept;
 * ink under a cut id no cut has dropped; `archived` dropped. Pages with no markings have no entry.
 */
export function _fromVersion1(score: V1Score, ink: V1Ink | undefined): V2Stored;
```

`_isVersion1` is true when `'archived' in score`, or when any key of `ink` is not a whole number
(`!/^\d+$/.test(key)`).

**Tests**, new `src/scores/_version1.test.ts` (use `_line` and `_mark` from `scores/testing.ts`):

- two played cuts of page 0 with a marking each, and one of page 1: page 0 has both markings, in
  played order; page 1 its one;
- an archived cut's markings come after the played cuts' on its page;
- two cuts with equal copies of a marking (as `insertPages` with copying made them): one is kept;
  two that differ in one point: both kept;
- ink under an id that no cut has: dropped;
- the result has no `archived`, its cuts no `ownInk` and no `pass`; other score fields
  (`excerpts`, `symbolSize`, `key`) are carried over;
- no ink at all (`undefined`): ink `{}`;
- `_isVersion1`: true with `archived: []`; true with ink keyed by `'c1'`; false with no `archived`
  and ink keyed by `'0'`, `'12'`; false with no `archived` and no ink.

In `src/markings/placed.test.ts` (or the stroke tests): `compactMarking` and `copyMarking` keep
`pass` on a symbol and on a stroke.

## Stage 3: Ink on the page

The switch: ink is kept by page, cuts show markings by the spec's rule, cut edits stop touching
ink, archived cuts go, and the step from version 1 to 2 runs at start-up. Passes exist in the data
but every cut is pass 1 and no marking has one yet; nothing in the interface sets them until
stages 4 and 5.

This is one commit: the conversion and the code that reads its result must ship together. Work
through it in the order below; `npm run typecheck` will point at every place still left.

### The model

**`src/scores/model.ts`**:

- Header comment: "its cuts in played order and its ink" (no archived cuts).
- `Cut`: remove `ownInk`.
- `Score`: remove `archived`.
- `ScoreInk`: `export type ScoreInk = Record<number, Marking[]>;` with the comment "A score's ink:
  its markings by original page (0-based), in the coordinates of that page."
- `newScore`: no `archived`. `_forPages`: no `archived` filter. Ink of pages the original no
  longer has stays (the spec keeps it).

**`src/markings/model.ts`**: the header's "kept per cut" becomes "kept per page of the original".
`share`'s comment: "so the cut that holds most of it gets it, when it is made or moved". `anchor`'s
comment: "Where it is: the cuts whose music holds this point show it; and, when it lies in no cut,
the nearest cut gets it."

**`src/scores/ownership.ts`**: rewrite the header: "Which cut a marking is on: the page a marking
made or moved on a frame goes on, and which cuts show a marking. Works for every kind of marking,
through markings/model.ts. Pure." Remove `visible`, `_splitMarkings` and `_claimFirstPass`. Keep
`claimMarking` as it is. Add:

```ts
/** Whether cut `c` shows `m`, a marking of its page: its anchor between the cut's top and bottom (ends included), and no pass or the cut's. */
export function shows(c: Cut, m: Marking): boolean;

/** The markings `c` shows, in their order in its page's ink. */
export const shownBy = (c: Cut, ink: ScoreInk): Marking[] => (ink[c.page] ?? []).filter((m) => shows(c, m));
```

`anchorOf(m)[1]` is a fraction of the page's height, the same as `y0` and `y1`.

### Edits

**`src/scores/edits.ts`**:

- `remove`: take the cut out of `cuts` (never the last); the ink is untouched. Its comment: "Take a
  cut out of the played order. Its page's ink stays."
- `release`: the comment loses "so its ink is archived whole".
- Remove `hasOwnInk`, `deleteArchived` and `insertArchived`.
- `joinNext`: the merged cut is `{ ...a, y1: b.y1 }`; no ink is moved.
- `split`: no ink is moved; drop the `aspects` parameter if nothing else in it needs it, and update
  its callers (`cutAt`). Its comment loses the sentence about markings.
- `insertPages(s, at, from, to, aspects)`: drop `copyInk` and the copying (and `aspects` if it is
  then unused). Its comment loses the copying.
- `setInk(s: State, page: number, markings: Marking[])`: sets the page's markings (no entry when
  none); no `ownInk`. Comment: "Set the markings of a page of the original."
- `replaceMarking(s: State, page: number, old: Marking, next?: Marking)`: the same, by page.
- `textResized`: its comment loses "archived ones included" (it already reads every page's ink).

### Where cuts show their markings

- **`src/render/paint.ts`**: `shownOn(p: Placed, ink: ScoreInk)` becomes `shownBy(p.cut, ink)`
  (drop `aspects`); the comment: "The markings a cut shows (ownership.ts's `shows`), drawn whole."
  Update `drawFrameInk` and `src/export/pdf.ts:109`.
- **`src/scores/placing.ts`**:
  - `Selected` becomes
    ```ts
    /** A placed marking chosen on the music: the page whose ink holds it, the marking itself (found there by identity), and the cut it was chosen in, which shows it. */
    export interface Selected { page: number; cut: string; mark: PlacedMark }
    ```
  - `markingAt`: for each item, look through `shownBy(cut, ink)` instead of `ink[cut.id]` and
    `visible`.
  - `movedTo`: the cut it lands on (`claimed.cut`) gives the page. If the marking has a `pass`, it
    takes the landed cut's (`passOf(claimed.cut)`); without one it stays without (the spec's
    "Making, moving and erasing"). On the same page, `replaceMarking(s, page, from.mark, mark)`;
    on another, take it from `from.page` and add it to the new page's list. The result's
    `selected` is `{ page, cut: claimed.cut.id, mark }`.
- **`src/reader/_input.ts:222`**: `{ page: found.cut.page, cut: found.cut.id, mark: ... }`.
- **`src/reader/tools/_eraser.ts`**: for each cut on the frame, the list is `s.ink[cut.page]`, and
  a marking goes when `shows(cut, m)` and it is within reach; `setInk(s, cut.page, keep)`. Read
  `s.ink` afresh for each cut, since two cuts of a frame can be on one page.
- **`src/reader/tools/_pen.ts`**, **`_symbol.ts`** (`place`), **`_text.ts`** (placing): add the new
  marking to `state.ink[cut.page]` with `setInk(state, cut.page, ...)`; the focus stays `cut.id`.
- Every `replaceMarking(host.state(), sel.cut, ...)` in `_symbol.ts`, `_text.ts` and `reader.ts`
  becomes `replaceMarking(host.state(), sel.page, ...)`, with `sel.cut` as the focus; every
  `{ cut, mark }` built from a selection becomes `{ ...sel, mark }`. `_text.ts:143`
  (`state.ink[sel.cut]`) becomes `state.ink[sel.page]`.
- **`src/reader/reader.ts`**, `refreshSelection`: the selection ends when its marking is not in
  `state.ink[sel.page]` (by identity), or its cut is no longer among the played cuts, or that cut
  no longer `shows` it.

### Archived cuts go

- Delete `src/reader/cuts/_archive.ts`.
- **`src/reader/cuts/_insert-picker.ts`**: remove the archived cuts row, the "Copy markings" box,
  "Delete archived cuts…", `pick.archived` and the hint's archived text; call `insertPages` without
  `copyInk`. Its header: "The dialog for inserting pages of the original, one or a range, into the
  played order."
- **`src/reader/cuts/_host.ts`**: remove `sayArchived`. **`_menus.ts`** (`apply`) and
  **`_editor.ts`**: remove its uses and the check of `archived` around them.
- **`src/scores/testing.ts`**: `state()` without `archived`.

### The step from version 1 to 2

- **`src/scores/store.ts`**: add
  ```ts
  /**
   * The step from version 1 to 2 of the stored data: each score still in version 1 (every `score:`
   * key) is converted with its ink, both written in one transaction.
   */
  export async function scoresToVersion2(): Promise<void>;
  ```
  It walks `kv.entries<V1Score>('score:')`; for each, reads `kv.get<V1Ink>(keys.ink(id))`; skips it
  unless `_isVersion1`; otherwise writes `_fromVersion1`'s score and ink with
  `kv.setMany([[keys.score(id), score], [keys.ink(id), ink]])`. Scores whose original is gone are
  converted too; nothing here opens an original.
- **`src/stored-data.ts`**: `DATA_VERSION = 2`; `STEPS = { 1: scoresToVersion2 }`.
- **`src/storage/keys.ts`**: the `ink` comment: "ScoreInk: markings by original page."

### Tests

`npm run typecheck` and the tests will show what to change in `edits.test.ts`, `ownership.test.ts`,
`placing.test.ts`, `model.test.ts`, `export/_annotations.test.ts` and any others.

- Remove the tests of archiving, `deleteArchived`, `insertArchived`, `_splitMarkings`,
  `_claimFirstPass`, copying ink on insert, and markings moving on split and join.
- `edits.test.ts`, new: removing, splitting, joining, moving an edge (`setEdge` then `release`)
  and inserting pages leave `s.ink` the same object or deep-equal to before; `setInk` and
  `replaceMarking` work by page; `setInk` with no markings leaves no entry.
- `ownership.test.ts`, new, for `shows`: a symbol whose centre is inside, on the top edge, on the
  bottom edge (all shown), and just outside (not shown) though most of it is inside; a stroke
  shown by the cut holding its first point; a marking with `pass: 2` shown by a pass 2 cut, not a
  pass 1 one (a cut without `pass`); a marking without a pass shown by both. `shownBy` keeps the
  page's order.
- `placing.test.ts`, new: `markingAt` finds a marking on the second of two cuts of one page, and
  `selected.page` is that page; `movedTo` onto a cut of another page moves the marking to that
  page's ink; a marking with `pass: 2` moved onto a cut without `pass` gets `pass: 1`; one without
  a pass stays without.
- The sarabande fixture (`testing.ts`): a marking on page 2 shows on both cuts of page 2 whose
  band holds it, once each (page 2 is played twice).

## Stage 4: Passes of cuts

**`src/scores/edits.ts`**:

- `inOrder(a, b)` also needs `passOf(a) === passOf(b)`, so cuts of different passes are unrelated
  (`edgeKind`, `edgeRange` and the menus follow).
- `split` and `joinNext` already spread the cut, so the halves and the joined cut keep the pass;
  check, and add tests.
- `insertPages(s, at, from, to, pass: number)`: each new cut has `pass` when it is above 1 (none
  stored for pass 1).
- Add
  ```ts
  /** Each pass the score's cuts of `pages` have, in order. */
  export function passesOf(score: Score, pages: readonly number[]): number[];

  /** The passes offered for cuts of `pages`: each they have, and one more (the highest plus 1); [1] when they have none. The last is the one chosen at first. */
  export function passChoices(score: Score, pages: readonly number[]): number[];

  /** A cut given pass `pass` (none stored for pass 1). */
  export function setPass(s: State, id: string, pass: number): State;
  ```

**`src/reader/cuts/_host.ts`**: `pageLabel(c: Cut, score: Score)` adds ", pass N" (`original page
3, pass 2`) when `passesOf(score, [c.page])` has more than one pass; update its callers.

**`src/reader/cuts/_insert-picker.ts`**: under the page strip, a row "Pass" with one button per
`passChoices(score, picked pages)`, labelled "1", "2", … and the last, when it is new, "3 (new)";
one is pressed (`aria-pressed`). Whenever the picked pages change, the choices are worked out again
and the last is pressed. Insert calls `insertPages(..., chosen)`. Style the row like the dialog's
other button rows; look at `src/styles` for the existing dialog styles.

**`src/reader/cuts/_menus.ts`**, `cutMenu`: after the Insert items, **Pass…**, opening a menu at
the same place titled `Pass of this cut (${pageLabel(c, score)})`, with one item per
`passChoices(score, [c.page])` labelled "Pass N" (the new one "Pass N (new)"), the cut's own pass
`checked` (`MenuItem.checked`). Choosing one commits `setPass(s, c.id, n)` with focus `c.id`;
choosing the cut's own pass does nothing.

**`src/reader/cuts/_editor.ts`**, `tab()`: a cut's top tab shows "Pass N" when its page's cuts have
more than one pass, in a `span.tab-pass`; its `aria-label` uses `pageLabel` (which then has the
pass). Style `.tab-pass` in `src/styles/cuts.css`: small text on the tab, readable over the music
(look at `.tab`'s styles there). Tabs show only while Cuts is on, so nothing shows while reading.

**Tests** (`edits.test.ts`):

- `inOrder` through `edgeKind`: two cuts of a page, the second below the first, with the same
  pass: `'split'` or `'cutOut'` as now; with different passes: `'trimmed'` or `'whole'`;
  `edgeRange` does not stop at the other's edge.
- `split` of a pass 2 cut: both halves pass 2. `joinNext` keeps the upper cut's pass.
- `insertPages` with pass 1 stores no `pass`; with 2 stores 2.
- `passChoices`: pages with no cuts: `[1]`; a page with cuts of pass 1: `[1, 2]`; pages with
  passes 1 and 3: `[1, 3, 4]`. `passesOf` for several pages joins their passes.
- `setPass` to 1 removes `pass`; to 2 sets it; the ink is untouched.

## Stage 5: "This time only"

**`src/scores/placing.ts`**: add

```ts
/**
 * The "This time only" toggle for a selection: 'on' when its marking has a pass, 'off' when not;
 * undefined (hidden) when its page's cuts all have one pass and the marking has none.
 */
export function thisTimeOnly(score: Score, sel: Selected): 'on' | 'off' | undefined;

/** The state with the selected marking given its cut's pass (on) or none (off), and the marking as it is then. */
export function setThisTimeOnly(s: State, sel: Selected, on: boolean): { state: State; selected: Selected };
```

**`src/reader/tools/_tool.ts`**, `ToolHost`: add

```ts
/** The selected marking given its cut's pass (on) or none (off): one edit; it stays selected. */
setThisTimeOnly(on: boolean): void;
```

and implement it in `reader.ts` beside `deleteSelected`: `setThisTimeOnly` from `placing.ts`, then
`commit(state, sel.cut, selected)`. Give it to each tool's host where `delete` is given (look for
`delete: () => this.deleteSelected()` near `reader.ts:228`).

**`src/reader/tools/_selection.ts`**, `SelectionBox`:

- The constructor takes `onThisTimeOnly: (on: boolean) => void` after `onDelete`.
- A `button.selection-pass` with the text "This time only", `data-own-presses`, `aria-pressed`
  saying whether it is on; a click calls `onThisTimeOnly(!on)`.
- `show(layer, slot, ext, s, pass: 'on' | 'off' | undefined)`: the button is hidden when `pass` is
  undefined, and otherwise shows its state.
- The header comment adds the button.

**`src/styles/reader.css`**: `.selection-pass` beside `.selection-delete` (to its right, on the
same line above the box), the same height, a pill with the text, white on `#1f6fe0` when on and
`#1f6fe0` on white with a border when off. It keeps its size inside the zoomed spread the same way
the delete button does (the TODO about the delete button's size covers both).

**`src/reader/tools/_placing.ts`**: make the box with `new SelectionBox(() => host.delete(), (on)
=> host.setThisTimeOnly(on))`, and pass `thisTimeOnly(host.state().score, sel)` to `show`.

**Keep the pass through replacements**: `_symbol.ts`'s `replaceWith` builds a new marking from
`placed(...)`; give it the old marking's `pass` (`...(mark.pass !== undefined ? { pass: mark.pass }
: {})`). Check that every other replacement of a selected marking spreads the old one (the panel's
colour and background in `_symbol.ts` and `_text.ts`, retyping text through `movedTo`).

**Tests** (`placing.test.ts`):

- `thisTimeOnly`: a page with one pass and a marking without one: undefined; the same marking with
  `pass: 1`: `'on'`; a page with passes 1 and 2: `'off'` without, `'on'` with.
- `setThisTimeOnly` on, selected in a pass 2 cut: the marking has `pass: 2`, and is still in its
  page's ink at the same place in the list; off: no `pass`. The returned selection's mark is the
  new marking.

## Stage 6: Docs, and the manual checks

- **`ARCHITECTURE.md`**: the glossary's **cut** gains "and which pass of its page it plays"; **ink,
  marking** becomes "a score's ink is its markings by page of the original; a marking may belong
  to one pass"; add **pass** ("which time a page's music is played: each cut has one, from 1, and
  a marking may be limited to one"). The `scores/` row names `ownership` as "which cut a marking is
  on and which cuts show it". Add a line on the stored data's version and its steps
  (`src/stored-data.ts`, with "a change to what is stored adds a step"). Remove every mention of
  archived cuts and of copying ink on insert. Update "A new edit to the cuts" if it mentions ink.
- **`TODO.md`**: remove or rewrite items this work settles or makes wrong (search for "archiv",
  "cut's ink", "copy").
- **`TODO.manual.md`**: add a group "**Ink on the page and passes**":
  - Open the app for the first time after updating: "Updating your scores…" shows briefly, then the
    library. Each score's markings are where they were; on a page played twice, markings drawn on
    only one of its cuts now show on both.
  - Pages inserted earlier with their markings copied show each marking once, not twice.
  - Drag a cut's bottom edge up past a symbol: it disappears; drag it back: it is there again. Do
    it with two cuts of one page (shrink one, grow the next): the symbol shows on the other cut.
  - Remove a cut with markings: no "archived" message; insert the page again: the markings are
    there.
  - Insert a page that is already played: the pass row offers 1 and 2 (new), 2 chosen. With Cuts
    on, both cuts' top tabs say their pass; with Cuts off, nothing does.
  - Change a cut's pass with Pass…: the tab and the markings it shows change.
  - Select a symbol on a page played twice: "This time only" shows, off. Turn it on: the symbol
    goes from the other pass's cut. Undo: it is back. On a page played once it does not show.
  - Move a "this time only" symbol onto a cut of the other pass: it now belongs to that pass.
  - Export the score as a PDF: each cut has the markings it shows on screen.
- Delete `docs/page-ink-spec.md` and `docs/page-ink-plan.md`.

## Data dropped

By the spec: archived cuts (their markings are kept, on their pages), `ownInk`, markings kept under
a cut id that no cut had, and exact duplicate markings on a page.
