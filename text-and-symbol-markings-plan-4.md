# Text and symbol markings, plan 4: backgrounds and default colours

How to build the fourth part of `text-and-symbol-markings.md` (the spec). Read the spec first: it
says what the result must be, and this plan only how to get there. **Where the two disagree, the
spec wins**; stop and say so rather than follow the plan.

Plans 1 to 3 (`text-and-symbol-markings-plan-1.md` to `-plan-3.md`) are done: symbols and text are
placed, selected, cycled or edited, moved, resized, recoloured and deleted, and the library has its
editor and glyph picker. Read `ARCHITECTURE.md` too: the layers and the underscore rule are
followed here.

## What this plan delivers

- **Default colours**: the app's colour for placed markings and for their backgrounds, set in a
  **Marking colours…** dialog from the Volti menu, used by every marking without its own.
- **Backgrounds**: a box, or a tag pointing left or right, behind a placed marking, filled with its
  colour (darkening only), on screen and in exports. The selection, taps and the eraser take them
  in.
- **The toolbar**: the background buttons (none, box, tag left, tag right) in the second row while
  a symbol or Text is the tool, and the **Default** swatch before the colour swatches.
- **The library editor**: a symbol's background, as a template for the markings placed from it.

Left for a later plan, and not to be started here: imported fonts, and with them the Text tool's
fonts in the second row.

Nothing stored is dropped. `background` on placed markings and library symbols, and the
`placed-mark-colors` key, are new and optional.

## Stages

Each stage is one commit (or a few), pushed to `main`, and leaves `npm test` and `npm run build`
passing. Do them in order.

---

### Stage 1: default colours

The default colours are app-wide and drawing is synchronous, so they are kept in memory in
`markings/`, as the glyph table is: loaded at start-up, and changed only by the dialog.

**`src/markings/placed.ts`**: replace `PLACED_COLOR` with

```ts
/** The app's colours for placed markings without their own: the marking, and its background. */
export interface MarkColors { color: string; background: string }

/** Until the user sets them: the first pen colour, and light blue. */
export const BUILT_IN_COLORS: MarkColors = { color: '#1c1f26', background: '#cce0ff' };

/** The default colours now. */
export function markColors(): MarkColors;
/** Set them, each missing one going back to its built-in colour. */
export function setMarkColors(c: Partial<MarkColors>): void;
```

Everything that used `PLACED_COLOR` uses `markColors().color` (the drawing, the Stamp's colour, the
reader's typing field). Grep for it; none may be left.

**`src/markings/store.ts`**:

```ts
/** Load the default colours into markColors; nothing set leaves the built-in ones. */
export async function loadMarkColors(): Promise<void>;
/** Store them (only those that differ from the built-in ones) and use them. */
export async function saveMarkColors(c: Partial<MarkColors>): Promise<void>;
```

**`src/storage/keys.ts`**: `markColors: 'placed-mark-colors'` (owner `markings/store.ts`).
**`STORAGE.md`**: the key, its value `{ color?: string; background?: string }`, and that a missing
one is the built-in colour.

**`src/main.ts`**: `await loadMarkColors()` in `start`, before `library.refresh()`, warning in the
console if it fails (the built-in colours are then used). Nothing draws markings before it.

**`src/library/_mark-colors.ts`** (new; comment: the Marking colours dialog: the app's colours for
placed markings and their backgrounds):

```ts
/** Open the dialog. */
export function openMarkColors(): void;
```

`showDialog('Marking colours')`, then a row for each: its name ("Marking", "Background"), an
`<input type="color">` set to `markColors()`'s, and a **Built-in** button, disabled while it is the
built-in colour, that sets it back. Each change (`input` event) is saved with `saveMarkColors` and
used at once. A line under the rows: "For symbols and text without a colour of their own. Pen and
highlighter strokes keep theirs." Then **Done**.

**`library/_folder-banner.ts`**: **Marking colours…** in the Volti menu, after **Recently
removed…**, opening it.

Every marking is drawn afresh when a score is opened, and an export draws its appearances when it
runs, so nothing else needs redrawing: the dialog is in the library, where no score is open.

**Tests**: `src/markings/placed.test.ts`: `setMarkColors` with one colour leaves the other built
in, and `{}` sets both back; a marking without a colour draws in `markColors().color` after it is
changed; one with its own colour doesn't change.

---

### Stage 2: backgrounds in the model and the drawing

**`src/markings/placed.ts`**:

```ts
export interface Background {
  shape: 'box' | 'tag-left' | 'tag-right';
  /** The default background colour when missing. */
  color?: string;
}
```

`PlacedMark` gains `background?: Background` ("None when missing").

```ts
/** A background's padding round the ink, in em. */
const PADDING = 0.12;
/** How far a tag's point sticks out, as a share of its height: each edge 30° off the vertical. */
const POINT = Math.tan(Math.PI / 6) / 2; // ≈ 0.2887

/**
 * Its background's outline in em from its centre, clockwise from the top left: the ink's box grown
 * by the padding, with a point at the middle of its left or right end for a tag; undefined
 * without a background or ink.
 */
export function backgroundOutline(m: PlacedMark): [number, number][] | undefined;

/** What it covers, in em from its centre: its ink, and its background when it has one. */
export function markExtent(m: PlacedMark): Box | undefined;
```

`emExtent` stays the ink alone: the centre is the ink's.

**Drawing** (`drawPlaced`), as the spec's *Drawing* says, in this order:

1. the background, if any: `backgroundOutline` placed as the glyphs are, as a closed shape, filled
   in `background.color ?? markColors().background`, `multiply: true`, opacity 1;
2. the halo, as now;
3. the glyphs, as now.

**What takes the background in** — everything that asks where a marking is uses `markExtent`, not
`emExtent`:

- `hits` (the eraser);
- `extentOnFrame` (`scores/placing.ts`), and so the selection's box, its corners for resizing,
  and `placedAt` for taps and drags.

A resize scales the background with the rest, as the padding is in em.

**`compact`** leaves `background` as it is; **`copy`** copies it.

**`src/markings/library.ts`**: `LibrarySymbol.background?: Background` ("A template: a marking
placed as it gets a copy, which can then be changed freely. None when missing.").

**`STORAGE.md`**: `background` in `PlacedMark` and `LibrarySymbol`, and `Background`.

**Tests** in `src/markings/placed.test.ts`:

- `backgroundOutline` of a box: four points, the ink box grown by 0.12 em; of `tag-right`: five
  points, the third (clockwise from the top left) at the middle of the right end, 0.2887 × the
  height beyond the box; `tag-left` the mirror image; none without a background.
- `markExtent` of a tag includes its point; of a marking without a background equals `emExtent`.
- `hits` a point inside the background's padding but outside the ink: true with a background,
  false without.
- `draw` on a recording `Drawing`: with a background, a filled multiply shape in the default
  background colour comes first, then the halo and glyphs; with its own colour, that colour.
- `copy` gives a background that isn't the same object.

`src/scores/placing.test.ts`: `placedAt` finds a marking by a tap on its background.

`src/export/_annotations.test.ts`: a marking with a background exports one annotation whose
appearance has a multiply `gs` and whose box includes the background.

---

### Stage 3: the toolbar

**The Default swatch** (`reader/_toolbar.ts`): a swatch at the start of the swatches, shown only
while `placesMarkings(tool)`, drawn as the default marking colour with a diagonal line across it,
labelled "Default colour". `ToolbarActions.defaultColor()`. In `ToolbarView`, `markColor` becomes
the selected marking's own colour, `undefined` when it has none; the Default swatch is pressed when
a marking is selected and has no colour of its own.

`Reader`: `defaultColor()` takes the selected marking's `color` away (one `commit`, as `swatch`
does); with nothing selected, nothing. The pen's swatches are as now.

**The background buttons**: in `src/reader/_symbol-row.ts` (rename the class's comment: the
second row holds the groups and the backgrounds), after **Edit library…**, a group of four
buttons, each with a small SVG of its shape filled in the default background colour (none is an
empty square with a diagonal line): "No background", "Box", "Tag pointing left", "Tag pointing
right".

```ts
export type BackgroundChoice = 'none' | Background['shape'];
// SymbolRowActions gains:
background(b: BackgroundChoice): void;
// show() takes, besides what it takes now:
//   groups: whether the groups show (they are shown, and Text isn't the tool);
//   backgrounds: { pressed?: BackgroundChoice; enabled: boolean } | undefined, undefined to hide them.
```

**When the row shows** (`_toolbar.ts` `sync`): while the groups are shown, or a symbol or Text is
the tool. The groups (with the ad-hoc group, **+** and **Edit library…**) show while they are
shown and Text isn't the tool; the backgrounds while a symbol or Text is the tool.

**What the background buttons show and do** (`Reader`):

- With a marking selected: pressed is its shape (or none). Choosing one sets its shape, keeping
  its background colour (`{ shape, color: old?.color }`, or no `background` for none), one
  `commit`, still selected.
- With Text as the tool: pressed is also the shape remembered for new text (`textBackground`,
  `'none'` to start, kept while the app runs), and choosing one sets it too, with or without a
  selection.
- With a symbol as the tool and nothing selected: they show the placing symbol's background,
  pressed, and are disabled, since a symbol is placed with its library symbol's background.

**Placing with backgrounds**:

- A symbol (`placed` in `tools/_symbol.ts`) gets a copy of its library symbol's `background`.
- Cycling (`tools/_placing.ts`) keeps the marking's own `background`, as it keeps its colour.
- New text (`Reader.newText`) gets `{ shape: textBackground }` unless it is `'none'`. Editing text
  keeps the marking's background (`movedTo` spreads the marking).

The toolbar's and menus' symbol pictures (`_symbol-picture.ts`) leave backgrounds out: they are
drawn in white on the dark toolbar, where a light background would hide them.

**Check in the app**: as in the manual checks below.

---

### Stage 4: backgrounds in the library editor

**The symbol view** (`reader/_library-editor.ts`), after **Scale**:

- **Background**: four buttons as the toolbar's (none, box, tag left, tag right), one pressed.
- **Background colour**, shown while there is a background: **Default** (a checkbox, checked while
  the background has no colour of its own) and an `<input type="color">`, enabled while it isn't
  checked, starting at the default background colour.
- `Draft` gains `background?: Background`. A changed background alone, like a changed scale alone,
  keeps the glyphs (`{ ...was, scale, background }`).
- **The preview** draws the symbol with its background: `symbolPicture` takes an optional
  `background` (only the editor's preview passes one).

Changing a symbol's background changes only the library: placed markings keep theirs (each has its
own copy).

**Check in the app**: as in the manual checks below.

---

### Stage 5: docs and the TODO

- `TODO.md`: in the *Text and symbol markings* entry, plan 4 is done; what is left of the spec is
  imported fonts (and with them the Text tool's fonts), still to plan.
- `TODO.manual.md`: the manual checks below, in the group the earlier plans added.

## Manual checks, in the app

On the tablet:

1. In the library, Volti menu, **Marking colours…**: set the marking colour to dark red. Open a
   score: every symbol and text without a colour of its own is dark red; ones recoloured with a
   swatch, and pen strokes, are not. **Built-in** sets it back.
2. With a symbol as the tool and a fingering selected, tap the **Default** swatch: it takes the
   default colour, and the Default swatch is pressed. With Pen as the tool, the Default swatch
   doesn't show.
3. With a fingering selected, tap the box: a light blue box shows behind it, the staff lines
   darkened through it, not covered; the halo still shows round the glyph. Tap tag right: it
   points right, its point shorter than a 45° one. Tap none: it is gone. Undo steps back through
   each.
4. Tap Text, choose tag left, and type "a tempo": it is placed with a tag pointing left. Type
   another: it has one too. Choose none: the next has none.
5. Tap a text's tag just beyond its letters: it selects. The selection's box and corners include
   the tag; resizing scales it.
6. The eraser takes a marking when it touches only its background.
7. Cycle a fingering with a box: the next one keeps the box.
8. In the library editor, give the 1 a box with its own yellow colour: the preview shows it. Place
   a 1: it has the yellow box. Change the library's 1 to no background: the placed one keeps its
   box.
9. In **Marking colours…**, set the background colour to pink: boxes without their own colour are
   pink, the yellow one isn't.
10. Export a score with backgrounds and open it in another PDF app: the boxes and tags show as in
    Volti, the music darkened through them, and go with their annotations when hidden or deleted.

## Decisions made here that the spec doesn't make

- The default colours are kept in memory in `markings/placed.ts` (`markColors`), loaded at
  start-up; the dialog saves each change as it is made, and has a **Built-in** button for each.
- **Marking colours…** comes after **Recently removed…** in the Volti menu.
- The Default swatch shows only while a symbol or Text is the tool, drawn as the default colour
  crossed by a line.
- The background buttons come after **Edit library…** in the second row, each drawn in the
  default background colour; with a symbol as the tool and nothing selected they are disabled,
  showing the placing symbol's background.
- The shape for new text starts as none each run.
- Toolbar and menu pictures of symbols leave backgrounds out; the editor's preview shows them.
- In the editor, a background's own colour is set with a Default checkbox and a colour input.
- Selection, taps, resizing and the eraser all use the extent with the background.
