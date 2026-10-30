# Text and symbol markings, plan 3: text

How to build the third part of `text-and-symbol-markings.md` (the spec). Read the spec first: it
says what the result must be, and this plan only how to get there. **Where the two disagree, the
spec wins**; stop and say so rather than follow the plan.

Plans 1 and 2 (`text-and-symbol-markings-plan-1.md`, `-plan-2.md`) are done: symbols are placed
from the library, selected, cycled, moved, resized, recoloured and deleted, and the library has its
editor and glyph picker. Read `ARCHITECTURE.md` too: the layers, the underscore rule and the recipe
for a new tool are followed here.

## What this plan delivers

- **Academico**, bundled: the font for text, and one more font for library symbols.
- **The Text tool**: a button after Erase. Tapping the music opens a field there; what is typed
  becomes a text marking, which is then selected, moved, resized, recoloured and deleted as a
  symbol is. Tapping a selected text marking (with Text or a symbol as the tool) edits it.
- **The score's text scale**: text is placed at symbol size × text scale, and resizing text sets
  it (or the symbol size, while the score has no symbols).
- **Exports**: a text marking is a FreeText annotation.

Left for later plans, and not to be started here: backgrounds and their buttons, the
default-colours dialog and the **Default** swatch (plan 4); imported fonts (later). With Academico
the only font that has letters, the second row has nothing for Text yet: its fonts show only with
more than one text font, and its backgrounds come in plan 4. So while Text is the tool, the second
row shows only if the groups are shown, and then shows the groups.

Nothing stored is dropped. `Score.textScale` is new and optional.

## Stages

Each stage is one commit (or a few), pushed to `main`, and leaves `npm test` and `npm run build`
passing. Do them in order.

---

### Stage 1: Academico

**Files to add**

- `public/fonts/Academico.woff2`: `academico.woff2` from the npm package `@vexflow-fonts/academico`
  1.0.1 (`https://registry.npmjs.org/@vexflow-fonts/academico/-/academico-1.0.1.tgz`), which
  holds Academico 0.902 as Dorico installs it. Steinberg publishes no other copy. Its id is
  `363caf00`; check it with `sha256sum`.
- `public/fonts/Academico-OFL.txt`: the package's `LICENSE.txt`. Rename the existing
  `public/fonts/OFL.txt` to `Bravura-OFL.txt`, so each licence says whose it is.

Download into a scratch folder, not the repository; only the two files above are committed. Don't
add the package as a dependency.

**The one-off check, before committing**, as stage 1 of plan 1 did for Bravura: the package also
holds `academico.otf`; with a throwaway script, compare every glyph's path data read through
fontkit from the two files. They must be the same; say so in the commit message. If they differ,
stop and say so.

**`src/fonts/fonts.ts`**:

- `export const ACADEMICO = '363caf00';` with a comment like `BRAVURA`'s.
- `FILES` gains `[ACADEMICO]: 'fonts/Academico.woff2'`.
- `fontChoices()` gives Bravura, then `{ id: ACADEMICO, name: 'Academico' }`.
- `FontChoice` gains `text: boolean`: the font has letters, so text can be typed in it (Bravura
  false, Academico true). Nothing uses it yet except the Text tool's fonts, which wait for a
  second text font.

The editor's symbol view and the glyph picker list Academico from then on, with no change of their
own; the picker shows its font choice now that there are two.

**Tests** in `src/fonts/_shape.test.ts`, reading `public/fonts/Academico.woff2` with `node:fs`:

- `fontId` of the file is `ACADEMICO`.
- Shaping `'Ped.'` gives four glyphs, left to right, each with path data.
- Shaping `'AV'`: the second glyph's x is less than the first glyph's advance width
  (`font.getGlyph(id).advanceWidth / unitsPerEm`), so kerning is applied. If Academico doesn't kern
  that pair, find one it does (try "To", "Ta", "Yo") during the one-off check, and use it.

**Check**: the build has `dist/fonts/Academico.woff2`.

---

### Stage 2: text in the model, and its export

**`src/markings/placed.ts`**: shared by symbols and text, pure:

```ts
/**
 * Shaped glyphs (origins in em from the start of the baseline) moved so the centre of their ink is
 * the origin, and that centre from the start of the baseline; undefined when they have no ink.
 * The glyphs must be in the glyph table.
 */
export function centred(font: string, glyphs: readonly { gid: number; x: number; y: number }[]):
  { glyphs: [number, number, number][]; centre: [number, number] } | undefined;

/** Where the start of its baseline is, in em from its centre (its first glyph's origin). */
export function baselineStart(m: PlacedMark): [number, number];

/**
 * A text marking of `text` in `font`, shaped as `glyphs`, at `size`, its baseline starting at
 * `start` (frame coordinates: x in frame widths, y in frame widths from the frame's top); undefined
 * when it has no ink (empty, or spaces only).
 */
export function textMark(font: string, text: string, glyphs: readonly { gid: number; x: number; y: number }[], start: readonly [number, number], size: number): PlacedMark | undefined;
```

`textMark`'s `at` is `start` plus `centre × size`, in frame coordinates, as the symbol tool's
`placed` makes it before `claimMarking` turns it into the page's. `symbolFrom`
(`markings/library.ts`) uses `centred` instead of its own loop; for no ink it keeps giving the
glyphs unmoved.

`_placed.annotation`: a text marking gives `{ subtype: 'FreeText', contents: m.text }`; a symbol a
Stamp, as now. `_Annotation` (`model.ts`) gains `| { subtype: 'FreeText'; contents: string }`.

**`src/export/_annotations.ts`**: a FreeText annotation's own fields are `Contents` (the text, as
`PDFHexString.fromText`, not passed through `describe`) and `DA` (`PDFString.of('/Helv 12 Tf 0 g')`).
No `C`: some apps fill a FreeText's box with it.

**`src/scores/model.ts`**: `Score.textScale?: number` ("text's size relative to the symbol size:
the one the last text resize implied"), `DEFAULT_TEXT_SCALE = 0.6`, `textScaleOf(score)`.

**`src/scores/edits.ts`**:

```ts
/** The size new text is placed at: the score's symbol size × its text scale. */
export const textSizeOf = (score: Score) => symbolSizeOf(score) * textScaleOf(score);

/**
 * After a text marking is resized to `size`: the score's text scale becomes size / its symbol
 * size; but while its ink (every cut's, archived ones included) has no symbol, its symbol size
 * becomes size / its text scale instead.
 */
export function textResized(s: State, size: number): State;
```

**`STORAGE.md`**: `textScale` in the `score:` section; in the `ink:` section, that a text marking's
`text` is what was typed.

**Tests**:

- `src/markings/placed.test.ts` (with glyphs added to the table by hand, as its other tests do):
  `centred` (two glyphs side by side; none with ink); `baselineStart` gives back the start a
  `textMark` was made at (`at` + it × size equals `start`); `textMark` of spaces only is undefined;
  a text marking's annotation is FreeText.
- `src/scores/edits.test.ts`: `textSizeOf` with and without set values; `textResized` with a symbol
  in the ink (sets the text scale, the symbol size stays), with none (sets the symbol size), and
  with a symbol only in an archived cut's ink (counts as having one).
- `src/export/_annotations.test.ts`: a text marking exports as one FreeText with its `Contents`,
  `DA` and an appearance, and no `C`.

---

### Stage 3: the Text tool, sharing the symbol tool's taps and drags

The two tools differ only in what a tap on empty music does. What a tap on a placed marking does
depends on the marking, not the tool: a symbol cycles, text is edited.

**`src/reader/tools/_placing.ts`** (new; comment: the tools that place markings whole, symbols and
text: tapping selects, the selected marking's second tap cycles or edits it, dragging moves it or
resizes it from a corner). Move into it everything in `_symbol.ts` except what placing a symbol
needs, as:

```ts
/** A tool for placed markings; `tapEmpty` is what a tap on music with no placed marking does. */
export function placingTool(label: string, tapEmpty: (host: ToolHost, slot: FrameSlot, at: [number, number]) => void): Tool;
```

- A tap on the selected marking: a symbol cycles (as now); text calls `host.editText(selected)`.
- Lifting a resize: a symbol sets the symbol size (as now); text goes through `textResized` with
  its new size.

**`src/reader/tools/_symbol.ts`** keeps `placed` and `symbolTool = placingTool('Symbol', …)`, its
`tapEmpty` being what `tap` does now with no hit.

**`src/reader/tools/_text.ts`** (new; comment: the Text tool: a tap on empty music starts typing
there): `textTool = placingTool('Text', (host, slot, at) => host.newText(slot, at))`.

**`src/reader/tools/_tools.ts`**: `text: textTool` after `eraser`, so its button is after Erase.

**`ToolHost`** (`tools/_tool.ts`) gains:

```ts
/** Start typing a new text marking with the middle of its capitals at `at` on the slot's frame. */
newText(slot: FrameSlot, at: [number, number]): void;
/** Edit the selected text marking. */
editText(sel: Selected): void;
```

The reader's are empty until stage 4.

**The pen and the selection** (`reader/_input.ts`, `reader/reader.ts`): wherever `'symbol'` stands
for "a tool that places markings" — the pen acting as a finger (`penWrites`), the selection
lasting (`refreshSelection`, `syncBar`), swatches recolouring the selected marking (`swatch`,
and `markColor` in the toolbar's `sync`) — use a helper `placesMarkings(tool: ToolChoice)`, true
for `'symbol'` and `'text'`, in `reader/_toolbar.ts`. Changing tool still ends the selection, as
the spec says, between Text and a symbol too.

**The second row** (`_toolbar.ts` `sync`): shows while the groups are shown and Text isn't the
tool, or while a symbol is the tool. (With Text, it has nothing to show until plan 4.) Tapping a
group's button while Text is the tool makes that symbol the tool, as from any other tool.

**Check in the app**: the Text button shows after Erase; with it, tapping a placed symbol selects
it, a second tap cycles it, dragging moves it; tapping empty music does nothing yet.

---

### Stage 4: typing

**`src/fonts/fonts.ts`**:

```ts
/** A font's vertical metrics, in em: ascent above the baseline, descent below it (positive), and its capitals' height. */
export interface FontMetrics { ascent: number; descent: number; capHeight: number }
export async function fontMetrics(id: string): Promise<FontMetrics>;

/**
 * The font as a CSS font family for a text field, made with `FontFace` from the same file and
 * added to `document.fonts` the first time. Its ascent and descent are set to `fontMetrics`' and
 * its line gap to 0 (`ascentOverride`, `descentOverride`, `lineGapOverride`), so a field one line
 * high has its baseline exactly `ascent` below its top, whatever the browser would have taken.
 */
export async function cssFamily(id: string): Promise<string>;
```

`readFont` keeps the file's bytes beside the fontkit font, so `cssFamily` doesn't fetch again.
Metrics come from fontkit's `ascent`, `descent` (negate it) and `capHeight`, each / `unitsPerEm`.

**`src/reader/_typing.ts`** (new; comment: the field text is typed in on the music: in the
marking's font, size and colour, where the marking will be, over the frame so it zooms with it;
and the on-screen keyboard kept from covering it):

```ts
export interface TypingRequest {
  slot: FrameSlot;
  font: string;
  /** Em size, in page widths. */
  size: number;
  color: string;
  /** The start of the baseline, in frame coordinates. */
  start: [number, number];
  /** What the field starts with: '' for new text. */
  text: string;
  /** Enter, or a tap elsewhere: what is in the field. */
  done(text: string): void;
  /** Escape. */
  cancel(): void;
}

export class TypingField {
  /** `stage` is moved up while the field would be under the keyboard. */
  constructor(stage: HTMLElement);
  get open(): boolean;
  /** Open the field (closing one already open as `finish` does), focused, its caret at the end. */
  show(r: TypingRequest): Promise<void>;
  /** Close it, calling `done` with what was typed; nothing when it isn't open. */
  finish(): void;
}
```

- **The field**: an `<input type="text">` (class `typing`) with `enterkeyhint="done"`,
  `autocapitalize="off"`, `autocomplete="off"`, `spellcheck=false`, appended to `slot.box` as the
  selection box is, so it zooms with the frame. Font: `cssFamily(font)`, `font-size` = size ×
  `slot.w` CSS pixels (a frame is a page wide), its colour, no border, padding, outline or
  background, `line-height: normal`, `field-sizing: content` with a `min-width` of 1 em. Placed
  with its left at `start[0]` and its top at the baseline less the ascent × size, in percentages
  of the frame as `SelectionBox.show` does.
- **Keys**: Enter (not while `isComposing`) finishes; Escape cancels and stops the event going on
  (the reader's `onKey` would otherwise leave the reader). `onKey` (`reader/_input.ts`) also
  ignores keys whose target is inside `.typing`, so typing never turns the page.
- **Blur** finishes, so a tap on the toolbar or anywhere else finishes first.
- **The keyboard**: while the field is open, `navigator.virtualKeyboard.overlaysContent` is true
  (where `navigator.virtualKeyboard` exists; declare its few members locally, as TypeScript's DOM
  types haven't got it), and false again after. On its `geometrychange`, when the field's bottom
  (its `getBoundingClientRect`) is below the keyboard's top (`boundingRect.top`) less 8 px, the
  stage gets `translate: 0 -<difference>px`; it goes when the keyboard hides or the field closes.
  Without the API, nothing is done (the browser shrinks the page as now).
- `finish` and `cancel` are each called once per `show`; a second `finish` does nothing.

**`src/reader/_input.ts`**: while the typing field is open, a pointer going down on the stage
outside it finishes typing and goes no further: it doesn't place, select or turn a page. A
pointer going down inside it is let through (no capture, no tool), as the selection's delete
button is. `InputHost` gains `typing(): boolean` and `finishTyping(): void`.

**`Reader`** (`reader/reader.ts`):

- `newText(slot, at)`: the font is `ACADEMICO`, the size `textSizeOf(score)`, the colour
  `PLACED_COLOR`; the baseline starts at `[at[0], at[1] + capHeight / 2 × size]`. The selection
  ends. On `done(text)`: shape it (`shapeWith`), store its glyphs (`saveGlyphs`, before the
  marking), make it with `textMark`, `compactMarking`, `claimMarking` into the frame, one
  `commit`, and select it. Text with no ink places nothing.
- `editText(sel)`: the font is the marking's if `fontChoices()` has it, else `ACADEMICO`; its size
  and colour (or `PLACED_COLOR`); the baseline starts at its centre on the frame plus
  `baselineStart(mark) × size`, so the text keeps its start and grows to the right. While the
  field is open, the frame is drawn without the marking (`paintInk` with a state that hasn't got
  it), and the selection box hides. On `done(text)`: unchanged text and font, nothing; no ink,
  the marking is deleted (one `commit`); otherwise shaped and stored as for new text, then put in
  place of the old one through `movedTo` (`scores/placing.ts`, which gains an optional last
  argument `content: Partial<PlacedMark>` spread over the moved marking, for its new `text`,
  `font` and `glyphs`), one `commit`, selected. On `cancel`, the frame is drawn as it was and the
  marking stays selected.
- Typing finishes when the tool changes, the page turns, or the frames are laid out again (the
  slot's box it is in goes).
- Shaping or storing failing says "Could not place the text." and places nothing.

**CSS** in `styles/reader.css`: `.typing`, positioned absolutely in the slot's box, with a caret in
the text's colour (`caret-color`).

**Check in the app**: the manual checks below.

---

### Stage 5: docs and the TODO

- `ARCHITECTURE.md`: in *Words*, a marking includes text; the tools recipe mentions
  `placingTool`.
- `TODO.md`: in the *Text and symbol markings* entry, plan 3 is done and the next is plan 4.
- `TODO.manual.md`: the manual checks below, in the group plans 1 and 2 added.

## Manual checks, in the app

On the tablet, with a score open:

1. Tap **Text**, then the music: a caret blinks where you tapped, and the keyboard opens without
   the music moving or shrinking. Type "rit.": it shows in Academico, at the size it will be.
2. Press Enter: "rit." stays exactly where it was typed (no jump), with its halo, selected.
3. Tap a staff low on the page, so the field is where the keyboard will be: the music moves up so
   the field shows above the keyboard, and back down after Enter.
4. Tap the text once more: the field opens on it. Add " poco a poco", press Enter: it grows to the
   right from where it started. Undo: back to "rit.".
5. Edit it, delete everything, press Enter: it is gone. Undo brings it back.
6. Start typing, press Escape (or the keyboard's back): nothing is placed, and the reader doesn't
   close. Start typing and tap elsewhere on the music: the text is placed, and no second field
   opens.
7. Resize a text by a corner, then place a new text: it comes at the new size; a new fingering
   comes at the size it did before.
8. In a score with no symbols, resize a text, then place a fingering: the fingering follows the
   text (same size relation as before the resize).
9. With Text as the tool, tap a fingering twice: it cycles. With a symbol as the tool, tap a text
   twice: it opens for editing.
10. Recolour a text with a swatch; drag it into the next system; delete it with its button.
11. Zoom in, then type: the field and the text are at the zoomed size, and sharp.
12. Export the score and open it in another PDF app: each text is a FreeText annotation showing
    as in Volti, whose comment is the text.
13. In the library editor, make a symbol in Academico ("Ped.", scale 0.6): it places like any
    symbol.

## Decisions made here that the spec doesn't make

- Academico comes from the npm package `@vexflow-fonts/academico` 1.0.1, the only public copy;
  its WOFF2 is checked against its OTF once, by hand. Bravura's licence file is renamed so each
  font has its own.
- A font says whether it has letters (`FontChoice.text`); Bravura hasn't. The Text tool's fonts
  row waits for a second text font (spec updated).
- A tap starts new text with the middle of its capitals at the tap, its baseline starting there.
- Editing keeps the start of the baseline, so the text grows to the right; new and edited text are
  placed where the field showed them.
- The field's baseline is fixed by giving its `FontFace` fontkit's ascent and descent and no line
  gap.
- When the keyboard would cover the field, the whole stage moves up, zoomed or not (spec updated:
  at no zoom there is nothing to pan).
- Typing finishes on Enter, on blur, on a tap elsewhere (which does nothing else), on changing
  tool, turning the page and a new layout; Escape cancels. The edited marking is hidden while its
  field is open.
- Unchanged text, ended with Enter, is no undo step.
- The FreeText annotation has no `C`; its `DA` is `/Helv 12 Tf 0 g`.
- New text is always in Academico, until there is a choice of text fonts.
