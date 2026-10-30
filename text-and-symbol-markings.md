# Text and symbol markings

What text and symbol markings are when they are done: what the user sees, what is stored, and how
they are drawn and exported. It says nothing about the order of the work. Names of files and
internal types are easy to change later; the behaviour and the stored format are what matter.

Beside the pen and the highlighter, two new kinds of marking:

- **Symbols**: fingerings, pedal marks, dynamics, anything a music font (or any font) has a glyph
  for. The user keeps a **library** of them, in **groups**, and places them with a tap.
- **Text**: a line typed straight on the music ("rit.", a cue, a bar number).

Either can have a **background** behind it: a box, or a tag pointing left or right, filled with a
colour. Apart from where they come from (the library, or typing), the two are one type, drawn and
handled alike.

Both are drawn from glyph outlines stored with them, so they look the same on screen, in every
exported PDF and in every other PDF app, whatever fonts are around later.

## Words

- **font**: a font file (TTF, OTF, WOFF or WOFF2). Its **id** is the first 8 hex digits of the
  SHA-256 of the file. Three are bundled with the app; the user can import more.
- **glyph**: one outline of one font, known by `<font id>:<glyph index>`. Fonts never change under
  their id, so neither does a glyph.
- **shaping**: turning characters into positioned glyphs with the font's rules: kerning,
  ligatures, contextual forms, marks. A ligature is one glyph; the characters stay with the marking.
- **placed marking**: a symbol or a text marking: glyphs placed whole at a point, as opposed to a
  stroke, which is drawn along a path.
- **size**: a placed marking's em size, in page widths. It is the only size a marking stores.
- **symbol size**: the size a symbol of scale 1 is placed at, in page widths. Each score keeps the
  one its last edit implied (see *Sizes*).
- **scale**: how big a symbol is relative to the symbol size: it is placed at symbol size × scale.
  For a SMuFL font's glyphs, 1 is the engraved size (a SMuFL em is one staff height).
- **extent**: a placed marking's ink: the box around its glyphs' outlines.
- **library**: the user's symbols, in groups, one library for the whole app.
- **selected**: the one placed marking showing its extent and handles, which taps and drags act on.
- **default colours**: the app's colour for placed markings and for their backgrounds, used by
  every marking that doesn't have its own.

## Fonts

**Bundled**, cached for offline use with the rest of the app, in `public/fonts/`:

- **Bravura** (SMuFL music font, SIL Open Font License), as WOFF2, about 323 KB.
- **Academico** Regular and Italic (Steinberg's text font made to go with Bravura, Dorico's
  default; an open reworking of Century Schoolbook; SIL Open Font License), as WOFF2, about 23 KB
  each. Text is Academico Regular unless the user picks another font.

**Imported**: the user adds a font file from the library editor (a file picker). Its bytes go in
OPFS, at `fonts/<id>`; a record says its name. Importing a file whose id is already a font's adds
nothing. Removing an imported font removes its bytes and its record; every marking and library
symbol made with it stays as it is, since each carries its glyphs (below), and importing it again
gives it the same id, so its glyph records still fit it. Editing a text marking whose font is gone
shapes it again in Academico Regular.

**Ids** are 8 hex digits (4 bytes) of the hash, and no more: with a handful of fonts, two files
sharing them is too unlikely to guard against, and the whole hash is never kept. The bundled fonts'
ids are fixed by their files.

**Reading fonts** is done with **fontkit**: it reads all four formats (WOFF2 included), shapes
fully, and gives glyph outlines. It is loaded only when a font has to be read: defining a library
symbol, typing or editing text, picking glyphs. Drawing and exporting never need it.

A variable font is used at its default instance. Font collections (TTC) are not supported.

## Glyphs

Every glyph a marking or the library uses is stored once, for the whole app: under
`glyph:<font id>:<glyph index>`, its outline as SVG path data (M, L, C, Z), in em units, y
downwards, from the glyph's origin.

- A glyph record is written before the marking or library symbol that first uses it, and never
  changed.
- Opening a score loads the glyphs its ink uses into one table in memory, shared by the app, so
  drawing stays synchronous. The library's glyphs are loaded with it.
- Loading a glyph works out its **bounds**: the tightest box around its outline, to the extremes of
  its curves, not their control points. They are kept in memory with the glyph, not stored. A
  glyph with no outline, such as a space, has none.
- Nothing collects glyphs no longer used, for now.

A marking's extent is the box around its glyphs' bounds, each moved to where the glyph is. Text
with no outline at all (only spaces) is treated as empty. Extents come from the ink, not from the
space a font reserves for its glyphs: Bravura reserves 2 em above and below every glyph.

## Placed markings

Stored in the score's ink (`ink:<id>`), beside strokes, by the cut that holds them, as strokes are.
Strokes carry no `kind` and stay as they are; nothing stored is dropped.

```ts
type Marking = Stroke | PlacedMark;

/** A symbol or text: glyphs placed whole at a point. */
interface PlacedMark {
  kind: 'symbol' | 'text';
  /**
   * Its characters. A symbol's, with its font, name the library symbol it was placed as; text's
   * are what was typed, to edit it again. Both go in the PDF annotation.
   */
  text: string;
  /** The font's id. */
  font: string;
  /** Its glyphs as shaped: each one's index in the font, and its origin in em units from the centre of its extent, y downwards. */
  glyphs: [gid: number, x: number, y: number][];
  /** The centre of its extent, as fractions of the page's width and height. */
  at: [x: number, y: number];
  /** Its em size, in page widths. */
  size: number;
  /** The default colour when missing. */
  color?: string;
  /** None when missing. */
  background?: Background;
}

interface Background {
  shape: 'box' | 'tag-left' | 'tag-right';
  /** The default background colour when missing. */
  color?: string;
}
```

Its extent is worked out from its glyphs when needed, and isn't stored.

What `kind` decides:

- tapping the selected marking cycles a symbol and edits text (*On the music*);
- resizing a symbol sets the score's symbol size, and resizing text its text scale (*Sizes*);
- a symbol exports as a Stamp annotation, and text as a FreeText one (*Exporting*).

How they behave as markings (`_KindBehaviour`, `markings/model.ts`):

- **Which cut owns it**: the one holding its centre. `share` is 1 when `at` lies in the band, else
  0; `anchor` is `at`. A cut split, an insert with copied ink, and claiming after a move all
  follow from this, without its glyphs.
- **The eraser** takes a placed marking whole when it touches its extent (with its background).
- **Compacting** rounds `at` and `size` as stroke points are rounded.
- **Copying** copies its fields; its glyphs are shared by key.

A placed marking is never changed by anything done to the library or to a font afterwards. Only
the user changes it: moving, resizing, recolouring, cycling, editing text. Its colours, where it
has none of its own, follow the default colours.

## Default colours

Set from the Volti menu at the top of the library (`library/_folder-banner.ts`), in a dialog
**Marking colours…** with a colour picker for each:

- **Marking colour**: black (`#1c1f26`, the first pen colour) until set.
- **Background colour**: light blue (`#cce0ff`) until set.

Changing either redraws every marking that has no colour of its own, everywhere, and exports use
them as they are when exporting. Pen and highlighter strokes keep their own colours.

## Drawing

`Drawing` (`markings/draw.ts`) gains a shape: a path of lines and cubic curves, filled, or stroked
with round joins and ends, with a `Look`. On a canvas it is a `Path2D`; in a PDF, operators, with
the graphics state for its opacity and blending as now.

A placed marking is drawn as:

1. **Its background**, if it has one: a rectangle around its extent with 0.12 em of padding, or
   that rectangle with a point on its left or right end (a tag; each edge of the point 30° off the
   vertical, so it sticks out by about 0.29 of the rectangle's height). Filled in its background
   colour, darkening only, as the highlighter does (multiply), so the music under it stays black.
   No outline.
2. **Its halo**, always: all its glyphs as one path, stroked in white at 0.5 opacity, 0.04 × size
   wide (so 0.02 × size shows outside the outline). One path, so the halo isn't doubled where
   glyphs touch. The inside is not filled.
3. **Its glyphs**, filled in its colour.

While it is selected, its extent (with its background) is drawn as a box with a handle at each
corner. The box and handles are on screen only, never exported.

## Sizes

Each score keeps, in `score:<id>`:

- a **symbol size** (`Score.symbolSize`), 0.035 page widths (a 7 mm staff on an A4 page) until
  set;
- a **text scale** (`Score.textScale`), 0.6 until set: text's size relative to the symbol size.

Placing and resizing:

- **Placing a symbol** places it at the score's symbol size × its scale.
- **Placing text** places it at the score's symbol size × its text scale.
- **Resizing or cycling a symbol** sets the score's symbol size to the one it implies: its new
  size / its scale. Its scale is its library symbol's, if it is still in the library, else 1.
- **Resizing text** sets the score's text scale to its new size / the score's symbol size, which
  stays. But while the score has no symbol markings (in any cut, archived ones included), it sets
  the symbol size instead, to its new size / the text scale, which stays: so the first symbol
  placed follows the text.

So resizing one fingering sets the size of every symbol, and every text, placed after it in that
score; resizing one text sets the size of text placed after it. Both are part of the score, so undo
takes them back with the edit that set them.

Changing a symbol's scale in the library leaves placed markings as they are.

## The library

One for the app, stored under `symbols`:

```ts
interface SymbolLibrary {
  /** The user's groups, in their order on the toolbar. */
  groups: SymbolGroup[];
  /** Symbols placed ad hoc, newest first, at most 8. Cycles as a group. */
  adhoc: LibrarySymbol[];
}

/** Known by its place in the order. A type of its own, so it can have a name later. */
interface SymbolGroup { symbols: LibrarySymbol[] }

/** Known by its font and characters, which are unique in the library (groups and adhoc together). */
interface LibrarySymbol {
  font: string;
  /** Its characters, Private Use Area included. */
  text: string;
  scale: number;
  /** A template: a marking placed as it gets a copy, which can then be changed freely. None when missing. */
  background?: Background;
  /** As shaped when it was defined, so placing it needs no font. */
  glyphs: [gid: number, x: number, y: number][];
}
```

Examples, the first typed, the second picked from Bravura's glyphs ("fingering4",
"fingeringSubstitutionDash", "fingering5"). Glyph positions here are from each glyph's advance
only; fontkit's would include kerning. The ids are from the files these were worked out from:
Academico Regular (`363caf00`) and Bravura (`e68df664`).

```json
{
  "font": "363caf00",
  "text": "Ped.",
  "scale": 0.6,
  "background": { "shape": "tag-right" },
  "glyphs": [[18, -0.986, 0.365], [33, -0.319, 0.365], [32, 0.181, 0.365], [66, 0.755, 0.365]]
}
```

```json
{
  "font": "e68df664",
  "text": "",
  "scale": 1,
  "glyphs": [[2575, -0.33, 0.129], [2589, -0.093, 0.129], [2576, 0.104, 0.129]]
}
```

- **A symbol is in exactly one place**: one group, or adhoc. The same characters in the same font
  can't be in two groups.
- **Editing a symbol's scale or background** changes only the library: a placed marking's
  background is its own copy, changed only on the marking. **Changing its characters
  or its font** makes it another symbol: markings placed as the old one stay as they were, and no
  longer find it.
- **Deleting a symbol** leaves its placed markings; they no longer cycle.
- **The starter library**, made the first time the library is needed: a group with Bravura's
  fingerings 1 to 5, and a group with Bravura's toe and heel; scale 1, no background.

### The library editor

A dialog, opened from the end of the groups (below):

- The groups, in order: add, reorder, delete (with its symbols).
- A group's symbols, in order: add, reorder, move to another group, delete.
- A symbol: its font (from the bundled and imported fonts), its characters, its scale, and its
  background (none, or a shape, with the default background colour or its own), drawn as it will
  be placed.
- **Characters** are typed, or picked from a **glyph picker**: a grid of every glyph of the font
  that has a code point, with a search by SMuFL glyph name ("fingering4", "keyboardPedalHeel1").
  The names come from SMuFL's `glyphnames.json`, trimmed to names and code points and bundled; a
  name finds its code point in whichever font is chosen.
- **Fonts**: the imported fonts, with import and remove.

## The toolbar

- **Text**: a tool button, beside Pen, Highlight and Erase.
- **The second row**, under the toolbar, shows while the groups are shown or while a symbol or
  Text is the tool. It holds, in order:
  - **the groups**, while they are shown and Text isn't the tool: a button for each group,
    showing that group's current symbol, then the ad-hoc symbols as one more group, then **+**
    (the glyph picker, to place an ad-hoc symbol), then **Edit library…**;
  - **the fonts**, while Text is the tool;
  - **the backgrounds** (none, box, tag left, tag right), while a symbol or Text is the tool.
- **Symbols**: a button that shows or hides the groups. Hiding them leaves the tool as it is.
- **The groups**:
  - Tapping a group's button makes the tool that group's current symbol.
  - Tapping it again, while it is the tool, makes the group's next symbol current, wrapping round.
  - A long press shows all the group's symbols; picking one makes it current and the tool.
  - Each group's current symbol is remembered while the app runs.
  - The ad-hoc group can't be edited, but from its long press a symbol can be moved into a group.
- **The backgrounds**: choosing one sets the selected marking's background shape, keeping its
  background colour. With Text as the tool, it also sets the background of text typed after it,
  remembered while the app runs. A symbol is placed with its library symbol's background.
- **The colour swatches**, while a symbol or Text is the tool, give the selected marking its own
  colour, and leave the tool as it is; a swatch at their start, **Default**, takes its own colour
  away. Otherwise they choose the pen's colour, as now. Symbols and text are placed with no colour
  of their own.

## On the music

While a symbol or Text is the tool, a pen acts as a finger does: it taps and drags. With the pen,
highlighter or eraser, it writes as now. A tap on a placed marking never places a new one.

- **Tapping the music** where there is no placed marking:
  - with a symbol as the tool: places it, centred where tapped, sized as in *Sizes*, and selects
    it;
  - with Text: starts a new text marking there (below).
- **Tapping a placed marking** that isn't selected selects it.
- **Tapping the selected marking** again:
  - a symbol: replaces it with the next symbol of its group (wrapping round), with the same
    centre, colour and background, at the symbol size it implies × the next symbol's scale. A
    symbol no longer in the library doesn't change. Cycling doesn't change the toolbar.
  - text: edits it.
- **Dragging a corner handle** of the selected marking resizes it, keeping its proportions, with
  the opposite corner of its extent fixed.
- **Dragging a placed marking** moves it, and selects it. When it lifts, the cut holding its
  centre takes it.
- **Deleting**: the selected marking has a delete button above its box. The eraser also takes it.
- **The selection ends** when another marking is selected or placed, when the tool changes, or
  when the page turns.
- Placing, cycling, moving, resizing, recolouring, changing the background, deleting and finishing
  an edit of text are each one undo step.

### Typing

A text field over the music, where the text will be: in the marking's font (through a `FontFace`
made from the same file), its size and colour at the current zoom, with no background, so typing
looks like the result. The browser shows ligatures and kerning in it too.

- While it is open, the on-screen keyboard covers the page instead of resizing it
  (`navigator.virtualKeyboard.overlaysContent`), so the frames don't move; if the field would be
  under the keyboard, the zoom pans to keep it above.
- Enter, or tapping elsewhere, finishes: the text is shaped, its new glyphs stored, and the
  marking placed (or changed) and selected. Escape cancels. Text left empty places nothing, or
  deletes the marking being edited.
- One line only.

## Exporting

Each placed marking becomes one annotation, with its appearance drawn as on screen (`draw`, with
the default colours as they are), as strokes do now:

- **Symbol**: a Stamp annotation. Its `/Contents` is its characters, each Private Use Area
  character written as its SMuFL name ("fingering4 fingeringSubstitutionDash fingering5").
- **Text**: a FreeText annotation, its `/Contents` the text, with a `/DA` naming Helvetica so apps
  that insist on one have it (the appearance doesn't use it).

`_Annotation` (`markings/model.ts`) becomes a union of the Ink, Stamp and FreeText annotations'
own fields, and `annotate` (`export/_annotations.ts`) writes each.

## Storage

New keys, in `storage/keys.ts` and `STORAGE.md`:

| Key | Value | Owner |
| --- | --- | --- |
| `glyph:<font id>:<gid>` | `string`, the outline | `markings/store.ts` |
| `symbols` | `SymbolLibrary` | `markings/store.ts` |
| `placed-mark-colors` | `{ color?: string; background?: string }`, the default colours | `markings/store.ts` |
| `fonts` | `FontRecord[]`, the imported fonts | `fonts/store.ts` |

```ts
interface FontRecord {
  /** Its id; its file is at OPFS fonts/<id>. */
  id: string;
  /** The family and style, from the font. */
  name: string;
}
```

`ink:<id>` holds placed markings, and `score:<id>` the score's `symbolSize` and `textScale`. The
storage bar gets a part for imported fonts.

## Where the code goes

- **`fonts/`**, a new directory in layer 1: the bundled fonts, the imported ones (their files in
  OPFS and their records), font ids, reading a font and shaping text into glyphs with fontkit. It
  knows nothing about markings.
- **`markings/`**: placed markings, the glyph table, the default colours, `Drawing`'s shape, and
  `store.ts` for glyphs, the library and the default colours.
- **`scores/`**: the score's symbol size and text scale.
- **`reader/`**: the tools (`tools/`), the second row (groups, fonts and backgrounds), the
  selection, the typing field, the library editor and the glyph picker. The reader is what puts
  fonts and markings together: shaping with `fonts/`, then making the marking and its glyph
  records.
- **`library/`**: the Marking colours dialog, from the Volti menu.
- **`export/`**: the Stamp and FreeText annotations.

## Not in this

- Markings with two ends, such as hairpins.
- Rotating a marking, text on more than one line.
- Names for groups.
- A toolbar control for a marking's background colour (for now it comes from its library symbol,
  or is the default).
- Collecting unused glyphs, and removing a font's glyph records with it.
- Fonts from the system (the Local Font Access API isn't on Android) or from the web (Google Fonts).
- Exporting the library, the default colours and imported fonts with the rest of the library.

## Decided without discussion

- The text font for new text, and the fallback for a font that is gone: Academico Regular.
- The default text scale: 0.6. The default symbol size: 0.035 page widths.
- A placed marking's centre is the centre of its ink, and its glyphs are positioned from it.
- Backgrounds' padding (0.12 em) and the tag's point (edges 30° off the vertical).
- The default colours: `#1c1f26` for markings, `#cce0ff` for backgrounds; one default marking
  colour for symbols and text alike.
- A background colour of a marking's own comes only from its library symbol: the toolbar sets
  backgrounds' shapes, not their colours.
- The background buttons set the selected marking's background; with Text as the tool they are
  also remembered for the next text. Symbols are placed with their library symbol's background.
- A **Default** swatch takes a marking's own colour away.
- The eraser takes placed markings whole, by their extent.
- A tap on the selected text edits it, as a tap on the selected symbol cycles it.
- Dragging an unselected marking moves it without selecting it first.
- The selected marking has a delete button above its box.
- Tapping empty music with a symbol as the tool places it, ending the selection; nothing else
  ends a selection short of changing tool or turning the page.
- The ad-hoc list holds 8 symbols; ad-hoc symbols are placed through **+** and the glyph picker.
- The starter library, made at first use.
- While Text is the tool, the second row shows the fonts in place of the groups.
- The second row shows whenever a symbol or Text is the tool, even with the groups hidden.
- Each group's current symbol is remembered only while the app runs.
- A Stamp's `/Contents` writes Private Use Area characters as their SMuFL names; the FreeText
  annotation's `/DA` names Helvetica.
- Fonts: no collections; variable fonts at their default instance. The imported fonts are listed
  by name.
- Resizing text in a score with no symbols sets the symbol size; archived cuts' symbols count.
