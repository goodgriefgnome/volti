# Text and symbol markings, plan 1: placing symbols from the starter library

How to build the first part of `text-and-symbol-markings.md` (the spec). Read the spec first: it
says what the result must be, and this plan only how to get there. **Where the two disagree, the
spec wins**; stop and say so rather than follow the plan.

Read `ARCHITECTURE.md` too: the layers, the underscore rule, and the recipes for a new kind of
marking and a new tool are followed here.

## What this plan delivers

Symbols, placed from the starter library (fingerings 1 to 5, and *pp* to *ff*), on the music:

- the Symbols button, and the groups row under the toolbar;
- placing, selecting, cycling, recolouring with the swatches, moving, resizing, deleting;
- each symbol drawn with its halo, on screen and in exported PDFs (as a Stamp annotation);
- the score's symbol size, set by resizing and cycling.

Left for later plans, and not to be started here: text, backgrounds, the library editor, the glyph
picker and SMuFL names, ad-hoc symbols and **+**, imported fonts, the default-colours dialog, the
**Default** swatch. Until plan 2 bundles the SMuFL names, a Stamp's `/Contents` holds the symbol's
characters as they are.

Nothing stored is dropped: strokes, scores and ink stay as they are. `Score.symbolSize` is new and
optional.

## Stages

Each stage is one commit (or a few), pushed to `main`, and leaves `npm test` and `npm run build`
passing. Do them in order.

---

### Stage 1: fontkit reads Bravura

This stage checks the one thing the rest rests on: that fontkit, in the browser build, reads
Bravura's WOFF2 file and gives its glyph outlines. If its tests can't be made to pass, stop here.

**Files to add**

- `public/fonts/Bravura.woff2`: Steinberg's latest release, from
  `https://raw.githubusercontent.com/steinbergmedia/bravura/master/redist/woff/Bravura.woff2`.
  The copy committed here is the app's Bravura: it changes only when someone replaces it on
  purpose (see *Updating Bravura* below).
- `public/fonts/OFL.txt`: Bravura's licence, from the same repository (`LICENSE.txt` there).
- `src/fonts/` — a new directory, layer 1. Add `fonts: 1` to `LAYERS` in `src/layers.test.ts`, and
  a row to the layers table in `ARCHITECTURE.md`: "Fonts: the bundled fonts, reading them and
  shaping text into glyphs (fontkit); nothing about markings".

**Dependencies**: `fontkit` at exactly `2.0.4` and `@types/fontkit` at exactly `2.0.9` (dev), as
`package.json` pins every version.

**`vite.config.ts`**: add `woff2` to `globPatterns`, so the font is cached for offline use.

**`src/fonts/_shape.ts`** (Pure; starts with a comment saying it shapes text with a font read by
fontkit, and turns outlines into path data):

```ts
import type { Font } from 'fontkit';

/** Text shaped with a font: its glyphs from the start of the baseline, and their outlines. Em units, y downwards. */
export interface Shaped {
  glyphs: { gid: number; x: number; y: number }[];
  /** Each glyph's outline as SVG path data (absolute M, L, C, Z only), from its origin; '' when it has none. */
  paths: Map<number, string>;
}

/** Shape `text` with the font's default features (kerning and ligatures included). */
export function _shape(font: Font, text: string): Shaped;

/** fontkit's path commands as path data: divided by unitsPerEm, y turned downwards, quadratic curves made cubic, numbers rounded to 1/10000. */
export function _pathData(commands: { command: string; args: number[] }[], unitsPerEm: number): string;

/** A font's id: the first 8 hex digits of the SHA-256 of its file. */
export async function fontId(bytes: Uint8Array): Promise<string>;
```

`_shape` uses `font.layout(text)`: each glyph's `x` is the pen position plus its `xOffset`, `y`
is `-yOffset`, both divided by `unitsPerEm`; the pen moves by each position's `xAdvance`.

**`src/fonts/fonts.ts`** (starts with a comment: the bundled fonts, and reading them once a run):

```ts
/** Bravura's id: the first 8 hex digits of the SHA-256 of public/fonts/Bravura.woff2. */
export const BRAVURA = '…';

/** Shape `text` with a bundled font, loading fontkit and the font the first time. */
export async function shapeWith(font: string, text: string): Promise<Shaped>;
```

Set `BRAVURA` to the committed file's id (`sha256sum public/fonts/Bravura.woff2`, first 8 hex
digits). It fetches `import.meta.env.BASE_URL + 'fonts/Bravura.woff2'`, and loads fontkit with
`await import('fontkit')` (so it isn't in the app's first download), and `fontkit.create` on the
bytes. A collection (TTC) or an unknown id throws.

**The one-off check, before committing**: that fontkit reads the WOFF2 file to the same outlines
as Bravura's OTF file of the same release. Download `redist/otf/Bravura.otf` from the same
repository at the same commit into a scratch folder (not the repository), and with a throwaway
script, or a test you don't commit, compare every glyph's path data from the two files: they must
be the same. Say in the commit message which Bravura version was compared, and that it matched. If
they differ, stop and say so.

**Tests**, `src/fonts/_shape.test.ts`, reading `public/fonts/Bravura.woff2` with `node:fs`. They
must not depend on which Bravura release is committed, only on what SMuFL fixes:

- `fontId` of the file is `BRAVURA`, so replacing the font without changing the id fails.
- Shaping `'\uED14'` (fingering 4) gives one glyph, at x 0, y 0, whose path data has at least one
  `M`, and whose points are within 0…1 em across and between 0 and -1 em (above the baseline).
- Shaping `'\uE52D'` (*mf*) gives one glyph wider than fingering 4's.
- Shaping `'\uED14\uED22\uED15'` gives three glyphs, left to right.
- Shaping a code point Bravura hasn't got gives its `.notdef` glyph (index 0), not an error.
- `_pathData` of a quadratic curve gives the equivalent cubic (control points at 2/3).

**Updating Bravura**, later: replace the file, set `BRAVURA` to its id, and do the one-off check
again. The new file is a new font with a new id: markings and library symbols made with the old
one keep their stored glyphs and look as they did; only what is shaped from then on uses the new
one. Nothing else needs doing.

**Check**: `npm run build` passes and the build has the font in `dist/fonts/`.

---

### Stage 2: drawing shapes, and the glyph table

**`src/markings/draw.ts`**: add

```ts
/** A path of lines and cubic curves, in the drawing's units. */
export type PathCmd =
  | readonly ['M', number, number] | readonly ['L', number, number]
  | readonly ['C', number, number, number, number, number, number] | readonly ['Z'];

/** Filled (nonzero), or stroked `width` wide with round joins and ends. */
export type Paint = { fill: Look } | { stroke: Look; width: number };

export interface Drawing {
  path(...): void;   // as now
  shape(cmds: readonly PathCmd[], paint: Paint): void;
}
```

`canvasDrawing` draws it with a `Path2D`, `globalAlpha` and, for `multiply`, the composite
operation, as `path` does. `PdfDrawing` (`export/_annotations.ts`) writes `m`, `l`, `c`, `h`, then
`f` or (with width, round cap and join) `S`, in a pushed graphics state with its `gs` when
see-through, and widens its box by each point (plus half the width when stroked).

**`src/markings/glyphs.ts`** (new; comment: the glyph table, shared by the app, of the glyphs
loaded so far; what is stored is in `store.ts`):

```ts
export interface Glyph { cmds: PathCmd[]; bounds?: [x0: number, y0: number, x1: number, y1: number] }
export const glyphKey = (font: string, gid: number) => `${font}:${gid}`;
/** Add a glyph from its path data, working out its bounds; one already there is left. */
export function addGlyph(key: string, d: string): void;
export function glyphOf(key: string): Glyph | undefined;
export function _parsePath(d: string): PathCmd[];
/** The tightest box around the path, to the extremes of its curves; undefined for no path. */
export function _pathBounds(cmds: readonly PathCmd[]): Glyph['bounds'];
```

`_pathBounds` takes each cubic's extremes where its derivative is zero (a quadratic in t, per axis),
not its control points.

**Tests**: `src/markings/glyphs.test.ts`: `_parsePath` reads what `_pathData` writes;
`_pathBounds` of `M 0 0 C 0 1 1 1 1 0` is 0…1 by 0…0.75; of `''` is undefined.
`export/_annotations.test.ts`: a filled shape writes `f`, a stroked one `S` with its width, and
a half-opaque one a `gs`.

---

### Stage 3: placed markings in the model, the store and exports

**`src/markings/placed.ts`** (new; comment: symbols and text, placed whole at a point; only what is
particular to them, as `stroke.ts` is to strokes):

```ts
export interface PlacedMark {
  kind: 'symbol' | 'text';
  text: string;
  font: string;
  /** Glyph index, then origin in em from the centre of its extent, y downwards. */
  glyphs: [gid: number, x: number, y: number][];
  /** The centre of its extent, as fractions of the page's width and height. */
  at: [x: number, y: number];
  /** Its em size, in page widths. */
  size: number;
  color?: string;
}

/** The colour of a marking without its own, until the default colours can be set (plan 4). */
export const PLACED_COLOR = '#1c1f26';

/** Its extent in em, from its centre; undefined when none of its glyphs has an outline (or is loaded). */
export function emExtent(m: PlacedMark): [x0: number, y0: number, x1: number, y1: number] | undefined;

/** The glyph keys a score's ink needs. */
export function glyphKeysIn(ink: Record<string, readonly Marking[]>): Set<string>;

export const _placed: _KindBehaviour<PlacedMark>;
```

The behaviour, as the spec's *Placed markings* says:

- `share`: 1 when `at[1]` is within lo…hi, else 0. `anchor`: `[at[0], at[1], 0]`.
- `map`: `at` moved through `f` (pressure 0, dropped after).
- `hits`: the point (y × aspect) is within the extent, in page widths (em × size, around `at`
  with its y × aspect), grown by the radius.
- `draw`: every glyph's commands placed (centre `at` on the target, em × `size × t.w`), as one
  list; then `shape(all, { stroke: white at 0.5 opacity, width: 0.04 × size × t.w })`, then
  `shape(all, { fill: its colour })`. A glyph not in the table is left out.
- `annotation`: `{ subtype: 'Stamp', contents: m.text, color }`.
- `compact`: `at` and `size` rounded to 1/10000, as stroke points are (`compact`, `stroke.ts`). `copy`: copies of `at` and `glyphs`.

**`src/markings/model.ts`**: `type Marking = Stroke | PlacedMark`; `behaviour(m)` is `_placed`
when `'kind' in m`, else `_strokes`. `_Annotation` becomes
`{ subtype: 'Ink'; paths; color; width } | { subtype: 'Stamp'; contents: string; color: string }`.
Update the top comment, and fix what `tsc` then finds assumed a `Marking` is a `Stroke`.

**`src/export/_annotations.ts`**: `annotate` writes an Ink annotation's fields as now, and a Stamp's
`Contents` (`PDFHexString.fromText`, as symbols are in the Private Use Area) and `C`.

**`src/markings/store.ts`** (new; comment: glyph records and the symbol library in the kv store):

```ts
/** Load into the glyph table those of `keys` it hasn't got. */
export async function loadGlyphs(keys: Iterable<string>): Promise<void>;
/** Store a font's glyphs, and add them to the table. */
export async function saveGlyphs(font: string, paths: Map<number, string>): Promise<void>;
```

**`src/storage/keys.ts`**: `glyph: (key: string) => 'glyph:' + key` (owner `markings/store.ts`).

**`src/scores/model.ts`**: `Score.symbolSize?: number`, and
`export const DEFAULT_SYMBOL_SIZE = 0.035` with `symbolSizeOf(score)`.
**`src/scores/edits.ts`**: `setSymbolSize(s: State, size: number): State`, and
`replaceMarking(s: State, cutId: string, old: Marking, next?: Marking): State` (through `setInk`;
no `next` removes it).

**`src/scores/store.ts`**: `loadScore` calls `loadGlyphs(glyphKeysIn(ink))` before it returns, so
every reader of a score (the reader, thumbnails, exports, the offline job) can draw it.

**`STORAGE.md`**: the `glyph:` key in the table and a section for it; `Marking` and `PlacedMark` in
the `ink:` section; `symbolSize` in `score:`.

**Tests**:

- `src/markings/placed.test.ts`, with two glyphs added to the table from hand-written path data:
  `share`, `anchor`, `map`, `hits` (inside, outside, within the radius, with an aspect other
  than 1), `emExtent`, `compact`, `copy`; `draw` on a recording `Drawing` makes a stroked
  white half-opaque shape 0.04 × size × w wide, then a filled one in `PLACED_COLOR`.
- `src/scores/ownership.test.ts`: `claimMarking` gives a placed marking to the cut holding its
  centre, with `at` converted to that page; `_splitMarkings` keeps it whole.
- `src/scores/edits.test.ts`: `replaceMarking` replaces, removes, and marks the cut `ownInk`;
  `setSymbolSize`.
- `src/export/_annotations.test.ts`: a placed marking exports as one Stamp with its `Contents`
  and an appearance.

---

### Stage 4: the symbol library, and the groups row

**`src/markings/library.ts`** (new, Pure; comment: the symbol library's types and what is worked
out from it):

```ts
export interface SymbolLibrary { groups: SymbolGroup[]; adhoc: LibrarySymbol[] }
export interface SymbolGroup { symbols: LibrarySymbol[] }
export interface LibrarySymbol { font: string; text: string; scale: number; glyphs: [number, number, number][] }

/** A symbol from shaped text: its glyphs moved so the centre of their ink is the origin. */
export function symbolFrom(font: string, text: string, scale: number, glyphs: { gid: number; x: number; y: number }[]): LibrarySymbol;
/** Where the symbol with this font and text is: its group (-1 for adhoc) and place. */
export function findSymbol(lib: SymbolLibrary, font: string, text: string): { group: number; index: number } | undefined;
/** The symbol after it in its group, wrapping round; undefined when it isn't in the library. */
export function nextSymbol(lib: SymbolLibrary, font: string, text: string): LibrarySymbol | undefined;
/** Its scale in the library; 1 when it isn't there. */
export function scaleOf(lib: SymbolLibrary | undefined, font: string, text: string): number;
```

`symbolFrom` reads the glyphs' bounds from the glyph table, so they must be added first.

**`src/markings/store.ts`**: `loadLibrary(): Promise<SymbolLibrary | undefined>` (and its glyphs
into the table) and `saveLibrary(lib)`. **`keys.ts`**: `symbols`. **`STORAGE.md`**: the key and
its types.

**`src/reader/_symbols.ts`** (new; comment: the symbol library as the reader gets it, made from
the starter the first time it is needed):

```ts
/** The starter library: fingerings 1 to 5, and pp to ff, all Bravura at scale 1. */
const STARTER = [['\uED11', '\uED12', '\uED13', '\uED14', '\uED15'], ['\uE52B', '\uE520', '\uE52C', '\uE52D', '\uE522', '\uE52F']];
/** The library, if one has been made. */
export function savedLibrary(): Promise<SymbolLibrary | undefined>;
/** The library, made from the starter (shaping with Bravura, storing its glyphs) when there is none. */
export function symbolLibrary(): Promise<SymbolLibrary>;
```

**The toolbar** (`reader/_toolbar.ts`, `reader/reader.ts`):

- `ToolChoice` becomes `'none' | ToolName | 'symbol'`.
- A **Symbols** button after the tools, pressed while the groups show. `ToolbarActions.symbols()`;
  `ToolbarView.groupsShown`.
- The second row: an element at the end of `.bar`, full width (`flex-basis: 100%`), so the bar's
  measured height (`--bar-h`) includes it. In `styles/reader.css`.
- **`src/reader/_symbol-row.ts`** (new): the groups as buttons.

  ```ts
  export interface SymbolRowActions { pick(group: number): void; choose(group: number, index: number): void }
  export class SymbolRow {
    readonly el: HTMLElement;
    constructor(act: SymbolRowActions);
    show(lib: SymbolLibrary | undefined, current: readonly number[], active: number | undefined): void;
  }
  ```

  Each button shows its group's current symbol, drawn on a canvas with `drawMarkings` (a
  `PlacedMark` made from the library symbol, centred, sized to fit); the active group's is
  pressed. A press held 500 ms opens `showMenu` with the group's symbols as buttons; choosing
  one calls `choose`.
- `Reader` keeps: `library?: SymbolLibrary` (from `savedLibrary()` as the reader opens);
  `groupsShown`; `group` (the group whose symbol is the tool); `current: number[]` (each group's
  current symbol, starting at 0).
  - **Symbols** pressed: the first time, `await symbolLibrary()`; then show or hide the row. The
    tool stays as it is.
  - `pick(i)`: if a symbol is the tool and `group === i`, `current[i]` moves on, wrapping round;
    else the tool becomes `'symbol'` and `group = i`.
  - `choose(i, j)`: `current[i] = j`, the tool `'symbol'`, `group = i`.
  - The row shows while the groups are shown or a symbol is the tool (spec, *The toolbar*).
- `reader/_input.ts` treats the tool `'symbol'` as no tool until stage 5 gives it one.

**Tests**: `src/markings/library.test.ts`: `symbolFrom` centres the ink; `findSymbol`,
`nextSymbol` (wrapping, adhoc, not found) and `scaleOf`.

**Check in the app**: the Symbols button shows two groups, 1 and *pp*; tapping a group's button
twice moves to 2; a long press shows all five fingerings. Tapping the music does nothing yet.

---

### Stage 5: placing, selecting, cycling, recolouring

**`src/scores/placing.ts`** (new, Pure; comment: placed markings on a frame: where they are, which
one is at a point, and moving them):

```ts
/** A placed marking's extent on a frame: x in frame widths, y in frame widths from its top. */
export function extentOnFrame(item: Placed, m: PlacedMark, aspect: number): [number, number, number, number] | undefined;
/** The placed marking shown on the frame whose extent, grown by `margin`, holds p: the one drawn last first. */
export function placedAt(frame: Frame, ink: ScoreInk, aspects: Aspects, p: readonly [number, number], margin: number): { cut: Cut; mark: PlacedMark } | undefined;
```

**`src/reader/tools/_symbol.ts`** (new): `symbolTool: Tool`. On a tap (`isTap`, `_gestures.ts`):

- on a placed marking that isn't selected: select it;
- on the selected marking, a symbol: replace it with `nextSymbol` (same `at` and `color`, its
  glyphs, size = its size / its old scale × the next's scale), set the score's symbol size to
  the new size / the next's scale, select it, one `commit`;
- on music with no placed marking: place `placing()` centred there, at
  `symbolSizeOf(score) × scale`, through `claimMarking`, select it, one `commit`.

The tap margin round a marking is 12 CSS pixels, divided by the slot's width and the zoom.

**`ToolHost`** (`tools/_tool.ts`) gains `placing(): LibrarySymbol | undefined`,
`library(): SymbolLibrary | undefined`, `selected(): Selected | undefined` and
`select(s: Selected | undefined): void`, where `Selected = { cut: string; mark: PlacedMark }`.

**`reader/_input.ts`**: the tool `'symbol'` starts `symbolTool`; and with it the pen acts as a
finger (it isn't `penWrites`, so the side bands turn the page for it too).

**`src/reader/_selection.ts`** (new): the selected marking's box over its frame.

```ts
export class SelectionBox {
  constructor(onDelete: () => void);
  /** Show it over `slot` at `ext` (frame coordinates, as extentOnFrame gives), or hide it. */
  show(slot: FrameSlot | undefined, ext?: [number, number, number, number]): void;
}
```

An outlined box at the extent, a handle at each corner, a delete button above it (wired in stage
6). Appended to the slot's `box`, so it zooms with the frame. CSS in `styles/reader.css`.

**`Reader`**: keeps `selected`; shows the box after painting, `setState` and undo; drops it when
its marking is no longer in the state (by identity), when the tool changes, and on turning.

**Swatches**: while a symbol is the tool, a swatch gives the selected marking that colour (one
`commit` through `replaceMarking`) and leaves the tool; the pressed swatch is the selected
marking's colour. Otherwise as now (`reader.ts`, `penColor`).

**Tests**: `src/scores/placing.test.ts`: `extentOnFrame` for a cut that starts mid-page;
`placedAt` finds the top one where two overlap, finds one within the margin, and misses outside.

**Check in the app**: place fingerings, tap one to select, tap again to cycle; recolour; undo.

---

### Stage 6: moving, resizing, deleting

**`src/scores/placing.ts`**:

```ts
/** Its centre and size after a corner of its extent is dragged to p, the opposite corner staying; never under 1/4 of its size. */
export function resizedFrom(ext: [number, number, number, number], corner: 0 | 1 | 2 | 3, p: readonly [number, number], at: readonly [number, number], size: number): { at: [number, number]; size: number };
/** The state with a placed marking moved to `at` on the frame (frame coordinates), given to the cut holding its centre. */
export function movedTo(s: State, frame: Frame, from: Selected, at: readonly [number, number], aspects: Aspects): { state: State; selected: Selected };
```

`resizedFrom` scales by the drag's projection onto the line from the fixed corner to the dragged
one.

**`symbolTool`**: a pointer going down on a handle of the selected marking (24 CSS pixels round
it) resizes; on a placed marking, a move beyond the tap distance drags it. While either goes on,
`host.paintState(slot, preview)` (a new `ToolHost` method: `paintSlotInk` with that state) shows
it, and the selection box hides. On lifting, one `commit`: a move through `movedTo`, selecting
it; a resize through `replaceMarking`, setting the score's symbol size to the new size / its
scale (`scaleOf`).

**The delete button**: `replaceMarking` without `next`, one `commit`. `reader/_input.ts` lets a
pointer that goes down on the selection's button through (no pointer capture), so its click
works.

**Tests**: `resizedFrom` (each corner, the opposite corner staying, the minimum); `movedTo` (to
another cut on the frame, and within the same cut).

**Check in the app**: drag a fingering into the next system; resize from each corner; delete;
erase one with the eraser.

---

### Stage 7: docs and the TODO

- `ARCHITECTURE.md`: in *Words*, a marking now includes symbols; the recipe for a new kind of
  marking names `placed.ts` beside `stroke.ts`.
- `TODO.md`: in the *Text and symbol markings* entry, say plan 1 is done and the next is plan 2.
- `TODO.manual.md`: a group of its own with the manual checks below.

## Manual checks, in the app

On the tablet, with a score open and the toolbar showing:

1. Tap **Symbols**: a second row shows two groups, 1 and *pp*. The toolbar's height grows with it
   and the page-turn bands start below it.
2. Tap the 1 button: it is pressed. Tap the music: a 1 appears where you tapped, with its box and
   handles. Tap the 1 button again: it shows 2. Tap the music elsewhere: a 2 appears, and the 1
   loses its box.
3. Tap the 2 on the music: it turns into 3, then 4, 5, 1. Undo steps back through each.
4. Long-press the *pp* button: all six dynamics show; choose *mf* and place it. It is bigger than
   the fingerings in proportion to Bravura's own sizes (both at scale 1).
5. Resize a fingering by a corner, then place another: it comes at the new size. Resize from each
   corner: the opposite one stays put.
6. Drag a symbol into another cut and to another system; cut edits (split, merge, archive) keep it
   with its music.
7. Choose the red swatch with a symbol selected: it turns red, and the tool is still the symbol.
8. Zoom in: symbols are sharp in the close-up, and their halo shows where they cross staff lines.
9. Use the pen: in the side bands it turns the page while a symbol is the tool; with Pen it
   writes as before.
10. Erase a symbol with the eraser; delete one with its button.
11. Export the score as a PDF and open it in another PDF app: each symbol is a Stamp annotation,
    looks as it did in Volti, and can be hidden or deleted.
12. Airplane mode, the app reopened: the Symbols row still works, and placing still works (the font
    and fontkit came from the offline copy).
13. Hide the groups with **Symbols** while a symbol is the tool: the row still shows (the spec's
    second row), and placing still works.

## Decisions made here that the spec doesn't make

- Bravura is committed to the repository, Steinberg's latest release when stage 1 is done;
  its WOFF2 is checked against its OTF once, by hand, not by a lasting test.
- `@types/fontkit` for fontkit's types.
- fontkit is loaded with a dynamic `import()`, only when something is shaped.
- The library's stored glyphs are written when the starter is made, before the library itself.
- The selection box, its handles and its delete button are DOM elements over the frame, not drawn
  on the ink canvas.
- While a marking is dragged or resized, its selection box hides, and shows again after.
- The tap margin (12 CSS pixels), the handle reach (24) and the smallest resize (1/4 of the size).
- A press held 500 ms is a long press on a group button.
- Placing goes through `claimMarking`, as strokes do, so a symbol placed between cuts goes to the
  nearest.
