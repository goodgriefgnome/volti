# Text and symbol markings, plan 2: the library editor and the glyph picker

How to build the second part of `text-and-symbol-markings.md` (the spec). Read the spec first: it
says what the result must be, and this plan only how to get there. **Where the two disagree, the
spec wins**; stop and say so rather than follow the plan.

Plan 1 (`text-and-symbol-markings-plan-1.md`) is done: symbols are placed from the starter library,
selected, cycled, moved, resized, recoloured and deleted. Read `ARCHITECTURE.md` too: the layers
and the underscore rule are followed here.

## What this plan delivers

- **SMuFL names**, bundled: the glyph picker searches them, and a Stamp's `/Contents` writes each
  Private Use Area character as its name.
- **The glyph picker**: a grid of a font's glyphs with a search by SMuFL name.
- **Ad-hoc symbols**: **+** at the end of the groups opens the picker; what is picked becomes the
  tool and goes at the front of the ad-hoc group, shown after the groups. From the ad-hoc group's
  long press a symbol can be moved into a group.
- **The library editor**, from **Edit library…** after **+**: groups (add, reorder, delete), their
  symbols (add, reorder, move to another group, delete), a symbol's font, characters and scale.

Left for later plans, and not to be started here: text and the Text tool, Academico (plan 3);
backgrounds, in the editor or anywhere else, the default-colours dialog and the **Default** swatch
(plan 4); imported fonts (a later plan). Until fonts can be imported, Bravura is the only font the
editor and the picker offer, but both take their fonts from one list (`fontChoices`, stage 2), so
adding fonts later changes that list and not them.

Nothing stored is dropped, and nothing new is stored: the `symbols` record keeps its shape.

## Stages

Each stage is one commit (or a few), pushed to `main`, and leaves `npm test` and `npm run build`
passing. Do them in order.

---

### Stage 1: SMuFL names

**`scripts/smufl-names.mjs`** (new; comment: makes `src/fonts/smufl-names.json` from SMuFL's
`glyphnames.json`; run by hand when SMuFL publishes a new one). It fetches
`https://raw.githubusercontent.com/w3c/smufl/gh-pages/metadata/glyphnames.json` and writes an
object from each name to its code point as a number (`"fingering4": 60692`), with no spaces: about
2940 names, 85 KB (20 KB gzipped). Leave out the `alternateCodepoint`s. Run it once and commit the
JSON beside it. Add `"smufl-names": "node scripts/smufl-names.mjs"` to `package.json`'s scripts.

**`src/fonts/smufl.ts`** (new; comment: SMuFL's glyph names, loaded the first time they are needed,
and writing characters as names):

```ts
export interface SmuflNames {
  /** The code point a name is at; undefined for a name SMuFL hasn't got. */
  codePoint(name: string): number | undefined;
  /** The name at a code point; undefined where SMuFL has none. */
  nameOf(cp: number): string | undefined;
  /** The names containing `query` (ignoring case), each with its code point, in SMuFL's order. */
  search(query: string): { name: string; cp: number }[];
}

/** The names, loading them (`import('./smufl-names.json')`, a chunk of its own) the first time. */
export function smuflNames(): Promise<SmuflNames>;

/** Make SmuflNames from the JSON's object. Pure; what smuflNames uses, exported for tests. */
export function _namesFrom(table: Record<string, number>): SmuflNames;

/**
 * `text` with each Private Use Area character (U+E000 to U+F8FF) SMuFL names written as its name,
 * separated from what is next to it by one space; other characters as they are.
 * "" gives "fingering4 fingeringSubstitutionDash fingering5". Pure.
 */
export function smuflText(text: string, names: SmuflNames): string;
```

The dynamic `import()` keeps the names out of the app's first download; Vite makes the JSON a
JavaScript chunk, so the service worker caches it with the rest (nothing to add to `globPatterns`).

**Exports**: `export/pdf.ts` awaits `smuflNames()` once per export, before the pages, and passes
`(text) => smuflText(text, names)` to `annotate` (`export/_annotations.ts`), which uses it for a
Stamp's `Contents`. If the names can't be loaded, the export goes on with the characters as they
are (warn in the console).

**Tests**: `src/fonts/smufl.test.ts`, on a small hand-made table (not the JSON): `codePoint`,
`nameOf`, `search` (case, order, no match); `smuflText` of three PUA characters, of PUA mixed with
ordinary text ("ab" gives "a fingering4 b"), of a PUA character with no name (kept as it is),
and of text with none. A test reading the real JSON (`node:fs`) checks that `fingering4` is
`0xED14` and `dynamicMF` is `0xE52D`. `src/export/_annotations.test.ts`: a symbol's Stamp has its
names in `Contents`.

---

### Stage 2: the fonts the editor offers, and reading a font's glyphs

**`src/fonts/fonts.ts`**:

```ts
/** A font the app can use. Only bundled ones for now; imported ones join later. */
export interface FontChoice { id: string; name: string }

/** The fonts the editor and the picker offer: [{ id: BRAVURA, name: 'Bravura' }] for now. */
export async function fontChoices(): Promise<FontChoice[]>;

/** A font read for showing its glyphs: what the glyph picker needs. */
export interface FontView {
  /** Its code points that have a glyph (not .notdef), ascending. */
  codePoints: number[];
  /** The outline of the glyph at a code point, as path data (as `_pathData` gives). */
  pathAt(cp: number): string;
}
export async function fontView(id: string): Promise<FontView>;
```

`fontChoices` is async so imported fonts can join it later without changing its callers.
`fontView` reads the font as `shapeWith` does (once a run) and wraps it with `_viewOf`.

**`src/fonts/_shape.ts`**: `_viewOf(font: Font): FontView`, pure: `codePoints` is
`font.characterSet` without those `glyphForCodePoint` maps to glyph 0, sorted; `pathAt` uses
`_pathData` on that glyph's path.

**Tests**: `src/fonts/_shape.test.ts`, reading Bravura with `node:fs` as now: `_viewOf`'s code
points include `0xED14`, leave out `0x41` (Bravura has no "A"), and are ascending; `pathAt(0xED14)`
is the same path data as shaping `'\uED14'` gives.

---

### Stage 3: changing the library

Pure functions, so the editor and the toolbar only call them and save.

**`src/markings/library.ts`**: add (each returns a new library and leaves its argument as it is;
`group` is an index into `groups`, or -1 for adhoc, as `findSymbol` gives):

```ts
/** A group's symbols; adhoc for -1; [] for no such group. */
export function symbolsOf(lib: SymbolLibrary, group: number): readonly LibrarySymbol[];

export function addGroup(lib: SymbolLibrary): SymbolLibrary;                 // at the end, empty
export function removeGroup(lib: SymbolLibrary, group: number): SymbolLibrary; // with its symbols
export function moveGroup(lib: SymbolLibrary, from: number, to: number): SymbolLibrary;

/**
 * Put `sym` in a group (not adhoc) at `index` (the end when missing). A symbol with its font and
 * text that is somewhere else in the library is taken out of there first, so it is in one place.
 */
export function putSymbol(lib: SymbolLibrary, sym: LibrarySymbol, group: number, index?: number): SymbolLibrary;

/** Replace the symbol with font and text `was` by `sym` where it is; another with sym's font and text is taken out. */
export function replaceSymbol(lib: SymbolLibrary, was: { font: string; text: string }, sym: LibrarySymbol): SymbolLibrary;

export function removeSymbol(lib: SymbolLibrary, font: string, text: string): SymbolLibrary;

/**
 * An ad-hoc symbol placed through +: at the front of adhoc, at most 8 kept (the oldest goes). One
 * already in a group stays there and the library is unchanged; one already in adhoc moves to the front.
 */
export function addAdhoc(lib: SymbolLibrary, sym: LibrarySymbol): SymbolLibrary;
```

`moveGroup` and moving a symbol within its group use the same index rules as `moveEntry`
(`setlists/`): the item ends up at `to`.

**Tests** in `src/markings/library.test.ts`: each function, including: `putSymbol` of a symbol
that is in adhoc moves it out of adhoc; `putSymbol` within its own group reorders it;
`replaceSymbol` keeps the place; `addAdhoc` caps at 8, moves a repeated one to the front, and leaves
the library alone for one in a group; `removeGroup` of the last group; the argument is unchanged.

---

### Stage 4: the glyph picker, and ad-hoc symbols

**`src/reader/_glyph-picker.ts`** (new; comment: the glyph picker: a font's glyphs in a grid, a
search by SMuFL name, and the characters picked so far, drawn as they will be):

```ts
export interface GlyphPickerOptions {
  /** The font to start with, and the characters already picked. */
  font: string;
  text: string;
  /** The OK button's label ("Place", "Use"). */
  okLabel: string;
  /** Picked: the font and characters. */
  done(font: string, text: string): void;
  cancel(): void;
}

/** Fill `into` (an open dialog, or a view of one) with the picker. */
export function glyphPicker(into: HTMLElement, o: GlyphPickerOptions): void;
```

From the top:

- **The font**: a `<select>` of `fontChoices()`, hidden while there is only one. Changing it
  reloads the grid and clears the characters (they belong to the font).
- **The characters**: a text field holding what is picked so far (one line), which can also be
  typed in or edited; a ⌫ button removes its last character (by code point, not UTF-16 unit, as
  PUA characters are one unit each but others may not be). Beside it, the characters drawn as they
  will be: shaped with `shapeWith` (debounced 150 ms after a change), drawn on a canvas the way
  `_symbol-row.ts` draws a symbol (move its `picture` function into a module both use, such as
  `reader/_symbol-picture.ts`, taking a `PlacedMark`'s font and glyphs). Shaping stores no glyphs:
  add the shaped paths to the glyph table only (`addGlyph`), so a preview stores nothing.
- **The search**: a text field. Empty, the grid shows every code point of the font's `FontView`.
  With a query, it shows the code points of `search(query)` that the font has, in SMuFL's order;
  a font with no SMuFL names finds nothing.
- **The grid**: a cell (a button, 56 CSS px square) for each code point, its `aria-label` and
  `title` the SMuFL name, or `U+XXXX` without one. Cells are drawn only as they scroll into view
  (an `IntersectionObserver` on the grid): an `<svg>` with a `<path d>` from `pathAt`, its
  `viewBox` set from the path's `getBBox()` with 10% padding, so each glyph fills its cell.
  Bravura has about 3700 glyphs, so build the cells empty and fill them as seen. Tapping a cell
  adds its character to the characters, at the end.
- **Under the grid**: the last tapped glyph's name and code point ("fingering4 · U+ED14").
- **Cancel** and **OK** (`okLabel`): OK is disabled while the characters have no ink (the shaped
  glyphs have no bounds, as `emExtent` says); it calls `done(font, text)`.

CSS in `styles/reader.css`: a dialog class `glyph-picker` filling most of the screen, the grid with
`display: grid; grid-template-columns: repeat(auto-fill, 56px)` scrolling inside it.

**Making a symbol from a font and characters** — both the picker's **+** and the editor need it.
In `reader/_symbols.ts`:

```ts
/** A library symbol of `text` in `font`: shaped, its glyphs stored (before it is), centred. */
export async function makeSymbol(font: string, text: string, scale: number): Promise<LibrarySymbol>;
```

It is what `symbolLibrary` does for each starter symbol; use it there too.

**The toolbar's second row** (`reader/_symbol-row.ts`): after the groups, in order:

- the ad-hoc group, when it has symbols: a button like a group's (its index is -1);
- **+**: `SymbolRowActions.add()`;
- **Edit library…**: `SymbolRowActions.edit()` (stage 5; until then it does nothing, and is left out).

Groups with no symbols have no button. `show` takes the ad-hoc group's current index too; key its
cache on the library object, as now.

**The ad-hoc group's long press**: a menu with a row for each symbol: its picture (choosing it, as
for a group), then a **To group** button, which opens a second menu: each group (its first
symbol's picture, or "Group n" when empty) and **New group**. Choosing one calls
`SymbolRowActions.moveToGroup(index: number, group: number | 'new')`.

**`Reader`** (`reader/reader.ts`):

- `group` is -1 while an ad-hoc symbol is the tool; `currents` gains the ad-hoc group's index
  (`adhocCurrent`). Use `symbolsOf` everywhere a group's symbols are looked up (`placing`,
  `pickGroup`, `chooseSymbol`), so -1 works.
- `add()`: opens the picker (`showDialog('Place a symbol', 'glyph-picker')`) with the last font used
  in it this run (Bravura at first) and no characters, OK labelled **Place**. On OK:
  `makeSymbol(font, text, 1)`; if the library has it in a group already, it becomes the tool there
  (that group, that index); otherwise `addAdhoc`, save, and the tool becomes adhoc index 0. Shown
  in the row at once.
- `moveToGroup(i, g)`: `putSymbol` (after `addGroup` for `'new'`), save; if that symbol was the
  tool, the tool follows it to its new group and index.
- `setLibrary(lib)`: one method that saves (`saveLibrary`), keeps `symbolLib`, clamps every
  current index into its group (0 when the group is gone or empty; with no group left a symbol
  isn't the tool), and redraws the row. Every change goes through it.

Placing an ad-hoc symbol from its group doesn't move it to the front: the button would change
under the finger. Only **+** puts a symbol at the front.

**Tests**: none new beyond stage 3's; the picker and the row are checked in the app.

**Check in the app**: **+** opens the picker on Bravura; searching "fermata" shows the fermatas;
tapping one, then **Place**, places it with a tap on the music; the ad-hoc group shows it.

---

### Stage 5: the library editor

**`src/reader/_library-editor.ts`** (new; comment: the library editor: groups and their symbols, and
a symbol's font, characters and scale. One dialog whose content changes between views):

```ts
export interface LibraryEditorHost {
  library(): SymbolLibrary;
  /** Save a changed library (Reader.setLibrary). */
  change(lib: SymbolLibrary): void;
}

/** Open the editor on its groups view. */
export function editLibrary(host: LibraryEditorHost): void;
```

It opens with `showDialog('Symbol library', 'library-editor')` and swaps the dialog's content
(below its heading) for each view. Every change is saved as it is made, through `host.change`;
there is no Save button, only **Done** on the groups view. Changes aren't undoable (they aren't
part of a score).

**The groups view**:

- One row per group, in order: the group's symbols' pictures in order (each a button opening the
  symbol view), a **+** button (the symbol view for a new symbol at the group's end), and a ⋯ menu:
  **Move up**, **Move down**, **Delete group**. Deleting a group with symbols asks first, with
  `showOnTop` ("Delete this group and its 5 symbols? Placed symbols stay as they are."); an empty
  group goes without asking.
- **Add group**: an empty group at the end, scrolled into view.
- The ad-hoc symbols are not shown here: they are changed only from the toolbar.
- **Done**: closes.

**The symbol view** (for a symbol, or a new one in a group):

- **Font**: a `<select>` of `fontChoices()`, shown even while there is only one. A symbol whose
  font isn't among them (an older release of a bundled font) shows it as "Font no longer bundled"
  and selected; its characters can't be changed until another font is chosen.
- **Characters**: a text field, and **Pick glyphs…**, which swaps to the picker view
  (`glyphPicker` with this font and characters, OK labelled **Use**); OK or Cancel comes back to
  this view, with the picked font and characters on OK.
- **Scale**: a number field, 0.25 to 4, step 0.05, with − and + buttons beside it.
- **Group**: a `<select>` of the groups ("Group 1", "Group 2", …), to move it to another group.
  Moving within the group is **Move left** and **Move right** buttons.
- **The preview**: the symbol drawn at its scale beside fingering 1 of Bravura at scale 1 (made
  from `''` with `shapeWith`), so its size reads against a known one.
- **Delete** (an existing symbol), **Cancel** and **OK**. OK, for changed characters or font,
  `makeSymbol`s it, then `replaceSymbol` (or `putSymbol` for a new one), then moves it if its group
  changed. OK is disabled, with a line saying why, while the characters have no ink, and when
  another symbol in the library already has this font and characters ("Already in group 2", or "in
  the ad-hoc symbols": OK then moves that one here instead, with the button saying **Move here**).
- A changed scale alone keeps the glyphs and only changes `scale`.

**The toolbar**: **Edit library…** in the second row (stage 4 left it out) opens the editor.

**CSS** in `styles/reader.css`: the `library-editor` dialog, its group rows wrapping their pictures,
the views' fields laid out one per line.

**Check in the app**: as in the manual checks below.

---

### Stage 6: docs and the TODO

- `ARCHITECTURE.md`: the fonts row of the layers table mentions SMuFL names.
- `TODO.md`: in the *Text and symbol markings* entry, plan 2 is done and the next is plan 3;
  imported fonts are still to plan, after plan 4.
- `TODO.manual.md`: the manual checks below, in the group plan 1 added.

## Manual checks, in the app

On the tablet, with a score open:

1. Tap **Symbols**: the row shows the two groups, then **+** and **Edit library…**, and no ad-hoc
   group yet.
2. Tap **+**: the picker opens on Bravura with every glyph. Scroll to the end: glyphs draw as they
   come into view, without stalling.
3. Search "fermata": only fermatas show. Tap one: it appears in the characters and the preview, and
   its name shows under the grid. Tap **Place**, then the music: the fermata is placed, and the
   ad-hoc group shows it after the groups.
4. Place nine different ad-hoc symbols through **+**: the ad-hoc group's long press shows the
   newest eight.
5. Long-press the ad-hoc group, tap **To group**, choose the fingerings: the symbol moves to the
   end of the fingerings, and is gone from the ad-hoc group.
6. Through **+**, pick fingering 3 (already in a group): the tool becomes the fingerings' 3, and
   the ad-hoc group doesn't change.
7. **Edit library…**: the groups show. Add a group, add a symbol to it with **Pick glyphs…**:
   "fingering4", "fingeringSubstitutionDash", "fingering5", then **Use** and **OK**: it is in the
   new group, and the toolbar shows it.
8. Change that symbol's scale to 0.7: the preview shrinks beside fingering 1; placed ones don't
   change, newly placed ones are smaller.
9. Move the dynamics group up; delete a symbol; delete a group with symbols (it asks first). Placed
   symbols stay, and the deleted ones no longer cycle.
10. Export a score with fingerings and open it in another PDF app: the stamps' comments read
    "fingering4" and so on, not boxes.
11. Airplane mode, the app reopened: the picker's search still works (the names came from the
    offline copy), and the editor still makes symbols.

## Decisions made here that the spec doesn't make

- Academico waits for plan 3 (text), and imported fonts for a later plan: until then Bravura is the
  only font, so a text-font symbol such as "Ped." can't be made yet.
- The picker hides its font choice while there is one font; the editor's symbol view shows it.
- Backgrounds in the editor wait for plan 4, with the rest of backgrounds.
- SMuFL names are a committed JSON made by a script, loaded with a dynamic `import()`; alternate
  code points are left out.
- A Stamp's names are separated by single spaces, also from ordinary characters next to them; a PUA
  character without a SMuFL name stays as it is.
- The picker appends each tapped glyph to the characters, which can also be typed and edited; a
  font change clears them.
- The picker's grid is drawn lazily, as SVG, each glyph fitted to its cell.
- The picker's search covers SMuFL names only; a font without SMuFL names can only be browsed.
- **+** with a symbol already in a group makes that group's symbol the tool rather than adding it
  to adhoc. Placing from the ad-hoc group doesn't reorder it.
- Empty groups have no button in the row, but stay in the editor.
- The ad-hoc symbols aren't in the editor; they move to a group only from the ad-hoc long press.
- The editor saves each change as it is made, without undo; deleting a group with symbols, and
  removing a font, ask first.
- The symbol view moves a symbol to another group with a select, and within its group with Move
  left and Move right; groups move with Move up and Move down, not dragging.
- The symbol view's preview is beside fingering 1 at scale 1. Scale runs from 0.25 to 4.
- A symbol whose font is no longer bundled keeps its scale and group editable, but its characters
  only after another font is chosen.
