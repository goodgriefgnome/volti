# Marking tools and the light reader: plan

How to build what `marking-tools-spec.md` describes. **Where this plan and the spec disagree, the
spec wins**: build what the spec says and note the disagreement in the commit message.

Work through the stages in order. Each stage is one commit (or a few), and every commit leaves
`npm test` and `npm run build` passing. Each stage also updates `README.md` (the "Using it"
bullets about the reader) and `ARCHITECTURE.md` where they describe what the stage changes, and
adds its manual checks (at the end of this file) to `TODO.manual.md` as a group of its own.

**Data:** nothing stored is dropped or migrated. Stage 2 adds one kv key, `tool-settings`. Stage 5
can remove a symbol group from the stored library, but only when the user drags its last symbol
out. Existing highlighter strokes keep their stored colour (`#ffd400`) and are drawn at full
strength from stage 2.

Files named below are under `src/`. Line numbers are as of this plan's writing; search for the
names if they have moved.

## Stage 1: the light reader, and the toolbar's layout

Nothing changes in behaviour; only the look.

`reader/reader.ts`:

- In the constructor, beside `document.body.classList.add('reading')`, set
  `document.documentElement.dataset.theme = 'light'`, keeping what was there before in a field
  `private themeBefore = document.documentElement.dataset.theme`. Where the reader closes (where
  `reading` is removed from `body`), put it back: delete the attribute when `themeBefore` is
  undefined, else set it. `styles/base.css` already applies `data-theme="light"` (lines 22–29).

`styles/base.css` (lines 15–17): the reader's tokens become light. Keep their names:

```css
--stage: #eef0f3;
--bar: rgba(239, 240, 243, 0.97);
--bar-fg: #1d2026;
--bar-line: #d3d7dd;                 /* new: the hairline under the bar, and thin rules */
--bar-pressed: #ffffff;              /* new */
--bar-pressed-ring: #c3c9d2;         /* new */
```

`styles/reader.css`:

- `.bar`: `box-shadow: 0 1px 0 var(--bar-line), 0 2px 8px rgba(0, 0, 0, 0.06)`.
- `.bar button[aria-pressed="true"]` (line 45): `background: var(--bar-pressed); color: inherit;
  box-shadow: 0 0 0 1px var(--bar-pressed-ring), 0 1px 3px rgba(0, 0, 0, 0.12)`.
- `.bar .rule`: `background: var(--bar-line)`.
- `.page`: `box-shadow: 0 1px 6px rgba(0, 0, 0, 0.14), 0 0 0 1px rgba(0, 0, 0, 0.05)`.
- `.turn-band`: background `rgba(29, 32, 38, 0.07)`; its `svg` `fill: #1d2026; opacity: 0.55;`
  and no drop shadow.
- `.reader > .back`: background `rgba(255, 255, 255, 0.85)`, colour `#1d2026`, a 1 px
  `var(--bar-line)` ring.
- Every other rule using white-on-dark (`rgba(255, 255, 255, …)` backgrounds or borders in `.bar`
  rules) gets the light equivalent: search `reader.css` for `255, 255, 255`.

`styles/cuts.css`: the tabs already sit on white pages; check `.tab::after` still reads at 3:1
against the page (it does: the colours don't change) and change nothing unless a check fails.

The bar's layout (`reader/_toolbar.ts` constructor, and `reader.css` lines 18–23 and 43):

- Wrap the title button and `this.info` in `el('div', 'title-block')`, so the left group is
  `[back][title-block]`. CSS: `.bar .title-block { display: flex; flex-direction: column;
  min-width: 0; }`; inside it the title button is `min-height: 24px; padding: 0 6px;` and
  `.page-info` is `padding: 0 6px; font-size: 13px; line-height: 17px;`, so both start at the same
  edge. Write these as `.bar .title-block .title-button` (more specific than `.bar button`) so the
  general button rule doesn't override them.
- Fix the wrapping: `.bar .group { flex-wrap: wrap }` (line 43) overrides `.bar-main > .left` and
  `.bar-main > .tools` (lines 20–21), which have the same specificity and come earlier. Remove
  `flex-wrap` from `.bar .group`; give `.left` and `.tools` `flex-wrap: nowrap`.
- Replace the `max-width: 700px` rule (line 23) by `@media (max-width: 679px)`: `.bar-main`
  wraps; `.tools` gets `order: 3; flex-basis: 100%; justify-content: center; margin-inline: 0`;
  `.more` gets `order: 2`; `.cuts-button .label` is hidden.

Tests: none (CSS and DOM only).

## Stage 2: the tools' settings, stored

New file `markings/tool-settings.ts` (comment: "Pure. Each tool's settings for the markings it
makes, kept for the whole app: their types, defaults, and what a choice resolves to."):

```ts
import type { Background, MarkColors } from './placed';

/** A colour choice: 'default' follows the app's Marking colours. */
export type ColorChoice = string | 'default';

/** A marking's background: none, or the shape of one. (Moved here from reader/_symbol-row.ts.) */
export type BackgroundChoice = 'none' | Background['shape'];

export interface ToolSettings {
  pen: { color: ColorChoice };
  highlighter: { color: ColorChoice };
  /** `font` undefined: the font new text gets now (ACADEMICO). */
  text: { font?: string; color: ColorChoice; background: BackgroundChoice; backgroundColor: ColorChoice };
  symbol: { color: ColorChoice };
}

export const DEFAULT_TOOL_SETTINGS: ToolSettings;

/** Stored settings, with anything missing or of the wrong type taken from the defaults. */
export function toolSettingsFrom(stored: unknown): ToolSettings;

/** The colour a stroke is drawn in: Default is the marking colour for the pen, the background colour for the highlighter. */
export function strokeColor(tool: 'pen' | 'highlighter', choice: ColorChoice, colors: MarkColors): string;

/** What a placed marking stores for a choice: undefined for Default (it follows the Marking colours). */
export const ownColor = (choice: ColorChoice): string | undefined => (choice === 'default' ? undefined : choice);

/** A background for a placed marking: undefined for 'none'; its colour only when not Default. */
export function backgroundOf(shape: BackgroundChoice, color: ColorChoice): Background | undefined;
```

Move `BackgroundChoice` here; `reader/_symbol-row.ts` imports it from here until stage 5 deletes
that file.

`storage/keys.ts`: add `toolSettings: 'tool-settings'` with the comment "Each tool's settings for
new markings, a ToolSettings (markings/store.ts)". `STORAGE.md`: list it.

`markings/store.ts`: add

```ts
export async function loadToolSettings(): Promise<ToolSettings>; // toolSettingsFrom(await kv.get(keys.toolSettings))
export const saveToolSettings = (s: ToolSettings) => kv.set(keys.toolSettings, s);
```

`markings/stroke.ts`:

- Remove `HIGHLIGHT_COLOR`. Add `export const HIGHLIGHT_COLORS = ['#fff09a', '#c8f0c0', '#ffd0e0'] as const;`
  and `export const BACKGROUND_COLORS = HIGHLIGHT_COLORS;` (the same three, used for
  backgrounds).
- `highlight` (line 81): `opacity: 1`. Update its comment.
- `export/_annotations.test.ts` lines 37 and 95: the highlighter's opacity is now 1.

`reader/reader.ts`:

- Replace the fields `penColor`, `textBackground` and `textFont` (lines 155, 167, 169) by
  `private settings: ToolSettings = DEFAULT_TOOL_SETTINGS;`. In the constructor,
  `void loadToolSettings().then((s) => { this.settings = s; this.syncBar(); }, () => {})`.
- Add

  ```ts
  /** Change the tools' settings, save them, and show them. */
  private setSettings(change: (s: ToolSettings) => ToolSettings): void;
  ```

  It saves with `saveToolSettings` (saying "Could not save the tools' settings." on failure) and
  calls `syncBar()`.
- The input host's `penColor` (line 310) becomes `penColor: () => strokeColor('pen', this.settings.pen.color, markColors())`,
  and add `highlightColor: () => strokeColor('highlighter', this.settings.highlighter.color, markColors())`
  to `ToolHost` (`reader/tools/_tool.ts`) and the host.
- `reader/tools/_pen.ts` line 27: `color: hl ? host.highlightColor() : host.penColor()`.
- The pen swatches still on the top row: `penColour(c)` sets `settings.pen.color` through
  `setSettings`; the toolbar's `penColor` view is `this.settings.pen.color`.
- New text (`newText`, line 512; `placeText`, line 533): font `this.settings.text.font ?? ACADEMICO`,
  colour `ownColor(this.settings.text.color)` stored on the marking (the field shows it, or
  `markColors().color` for Default), background `backgroundOf(text.background, text.backgroundColor)`.
- `setFont` and `setBackground` set the `text` settings through `setSettings` instead of the old
  fields.
- New symbols (`reader/tools/_symbol.ts`): add `symbolColor(): string | undefined` to `ToolHost`
  (the reader returns `ownColor(this.settings.symbol.color)`), and give the placed marking that
  colour when it is defined.

`library/_mark-colors.ts` line 33, the hint: "For symbols, text and backgrounds on Default, and for
new pen and highlighter strokes on Default. Strokes keep the colour they were drawn in."

Tests in `markings/tool-settings.test.ts`:

- `toolSettingsFrom(undefined)` and `toolSettingsFrom('junk')` are the defaults.
- A stored object missing `text.backgroundColor` gets it from the defaults and keeps the rest.
- `strokeColor('pen', 'default', c)` is `c.color`; `('highlighter', 'default', c)` is
  `c.background`; any other choice is itself.
- `backgroundOf('none', '#fff09a')` is undefined; `backgroundOf('box', 'default')` is
  `{ shape: 'box' }`; `backgroundOf('box', '#fff09a')` has the colour.

## Stage 3: Pen and Highlight's colours on a long press

New file `ui/long-press.ts` (comment: "A press held on an element, told apart from a tap."):

```ts
/** How long a press is held to count as a long press. */
export const LONG_PRESS_MS = 500;

/**
 * Call `onLong` when `target` is pressed this long without moving away; the click that follows a
 * long press is swallowed, so a tap still does what the element's click handler does.
 */
export function onLongPress(target: HTMLElement, onLong: () => void): void;
```

Take the logic from `reader/_symbol-row.ts` lines 178–203 (and use it there too), and from
`reader/cuts/_editor.ts` only the constant: the cut editor keeps its own handling.

New file `reader/_swatches.ts` (comment: "Rows of colour and background swatches, for the tools'
long-press panels."):

```ts
/** A row of swatches: Default first (a dashed ring, `defaultColor` its fill), then `colors`; `chosen` lit. */
export function swatchRow(colors: readonly string[], defaultColor: string, chosen: ColorChoice, pick: (c: ColorChoice) => void): HTMLElement;

/** The background shapes (none, box, tags), `chosen` lit, filled with `fill`. */
export function shapeRow(chosen: BackgroundChoice, fill: string, pick: (b: BackgroundChoice) => void): HTMLElement;
```

Move `backgroundPicture` and `BACKGROUNDS` from `reader/_symbol-row.ts` into this file. A swatch is
a `button.swatch` with `aria-label` "Default" or "Colour 1".."Colour 3" and `aria-pressed`.

`reader/_toolbar.ts`:

- Remove the `swatches` group and `PEN_COLORS` from the row. Pen and Highlight's buttons get a
  `span.ink` under the icon (CSS: 20 × 4 px, 2 px corners, a 1 px `rgba(0,0,0,.18)` ring), its
  `background` set in `sync` from new view fields `penInk: string` and `highlightInk: string`
  (resolved colours).
- New actions in `ToolbarActions`: `colors(tool: 'pen' | 'highlighter'): void`. `onLongPress` on
  each of the two buttons calls it.

`reader/_toolbar-menus.ts` (or a new `reader/_tool-panels.ts` if it reads better; comment: "The
tools' long-press panels: what each shows, and what choosing in it does."):

```ts
/** Pen's or Highlight's colours, under its button. */
export function showStrokeColors(at: HTMLElement, tool: 'pen' | 'highlighter', chosen: ColorChoice, pick: (c: ColorChoice) => void): void;
```

It calls `showMenu(at, label, [swatchRow(...)])` from `ui/overlay.ts`. Pen offers `PEN_COLORS`
with Default `markColors().color`; Highlight offers `HIGHLIGHT_COLORS` with Default
`markColors().background`. Picking sets the setting through `setSettings` and closes the menu.

`styles/reader.css`: `.swatch`, its dot (22 px circle with a 1 px `rgba(0,0,0,.25)` ring),
`.swatch.default` (a 1.5 px dashed `#8d93a0` outline 3 px out), pressed as in stage 1. Remove
`.bar.pen .swatches`.

Tests: none beyond `npm test` still passing.

## Stage 4: Text and Symbols show and change their settings

`reader/_toolbar.ts`:

- The Text button shows a **T** instead of its icon: a `span.text-look` holding a background
  picture (from `backgroundOf`, drawn as `backgroundPicture` draws, stretched behind) and a `span`
  "T" with `font-family` from `cssFamily(font)` (async, as `_symbol-row.ts` lines 127–128 do) and
  `color`.
- The Symbols button's picture (`symbolButton`, line 183) is drawn in the look's colour with its
  background: `symbolPicture(sym, color, 28, undefined, background)`.
- New view fields:

  ```ts
  /** What a placing tool's button shows: the selected marking's look, or the next marking's. */
  export interface Look { font?: string; color: string; background?: Background }
  textLook: Look;
  symbolLook: Look;
  ```

- New actions `textPanel(): void` and `symbolPanel(): void`, from `onLongPress` on each button.

`reader/reader.ts`:

- `lookOf(tool: 'text' | 'symbol'): Look`: with a marking of that kind selected, its font, its
  colour (or `markColors().color`), its background; otherwise the settings (for Symbols, the
  background of the tool's library symbol). Passed to `sync`.
- `showTextPanel()` and `showSymbolPanel()` (in the panels module from stage 3):

  ```ts
  export interface TextPanel { fonts: FontChoice[]; font: string; color: ColorChoice; background: BackgroundChoice; backgroundColor: ColorChoice }
  export function showTextPanel(at: HTMLElement, v: TextPanel, act: {
    font(id: string): void; color(c: ColorChoice): void; background(b: BackgroundChoice): void; backgroundColor(c: ColorChoice): void;
  }): void;
  export function showSymbolPanel(at: HTMLElement, v: { color: ColorChoice; background: BackgroundChoice; backgroundColor: ColorChoice }, act: {
    color(c: ColorChoice): void; background(b: BackgroundChoice): void; backgroundColor(c: ColorChoice): void;
  }): void;
  ```

  Font is a native `<select>` of the text fonts. Background colour's row shows only when the shape
  isn't `'none'`. Each choice redraws the panel in place (rebuild its contents) rather than closing
  it.
- What each choice changes (replace `markColor`, `setBackground` and `setFont`, lines 422–462):
  - Text panel: the selected text marking (as `markColor`/`setBackground`/`setFont` do now, one
    undo step each) and `settings.text`.
  - Symbol panel, Colour: the selected symbol and `settings.symbol.color`.
  - Symbol panel, Background and Background colour: the selected symbol, and the library symbol
    with its font and text (`findSymbol`, then `replaceSymbol` with the new `background`, through
    `setLibrary`); with nothing selected, the tool's symbol in the library.
- Remove Font, Colour and Background from the second row (`reader/_symbol-row.ts`: `fonts`,
  `colors`, `backgrounds`, and `fontsView`, `colorsView`, `backgroundsView` in the reader). The
  second row keeps the groups, **+** and **Edit library…** until stage 5.

Tests: none (DOM). `markings/library.test.ts` already covers `replaceSymbol`.

## Stage 5: the Symbols panel's library, and no second row

`markings/library.ts`:

```ts
/** Where a symbol is: a group's index (-1 for adhoc) and its place there. */
export interface SymbolAt { group: number; index: number }

/**
 * Move the symbol at `from` to `to`: into a group at a place, into adhoc at a place, or 'new' (a
 * new last group). A group left empty is removed; adhoc keeps at most 8, its last going.
 */
export function moveSymbol(lib: SymbolLibrary, from: SymbolAt, to: SymbolAt | 'new'): SymbolLibrary;
```

When moving within one group to a later place, the index is where it lands after the move (as
`moveGroup` counts).

Tests in `markings/library.test.ts`:

- within a group, forwards and backwards: the order is as expected;
- to another group at the start, middle and end;
- the last symbol of a group out: the group is gone and the groups after it move up;
- into adhoc when it has 8: the new one is where it was dropped and the last of the 8 is gone;
- out of adhoc into a group; to `'new'`: a new last group with only that symbol;
- `from` that doesn't exist: the library unchanged.

New file `reader/_symbol-panel.ts` (comment: "The Symbols tool's long-press panel: the library,
to pick and arrange symbols, beside the symbols' settings."). Move stage 4's `showSymbolPanel`
here as the panel's right side, and give it the library on the left:

```ts
export interface SymbolPanelHost {
  library(): SymbolLibrary;
  /** The tool's symbol, lit. */
  tool(): SymbolAt | undefined;
  pick(at: SymbolAt): void;
  move(from: SymbolAt, to: SymbolAt | 'new'): void;
  add(): void;
  edit(): void;
}
export function showSymbolPanel(at: HTMLElement, host: SymbolPanelHost, settings: SymbolSettingsView, act: SymbolSettingsActions): void;
```

- Left column: a `div.group-box` per group (1 px `var(--bar-line)` border, 10 px corners), each
  symbol a button with `symbolPicture(sym, '#1d2026', 44)`; then a heading "Recent" and its box
  (only when adhoc has symbols); then **+** and **Edit library…**. Only the tool's symbol is
  pressed.
- Tap a symbol: `pick` (the reader calls `chooseSymbol`) and close the panel.
- Drag a symbol (pointer moves more than the tap distance, `isTap` in `reader/_gestures.ts`): the
  button follows the pointer as a ghost; the drop place is shown as a 3 px `var(--select)` line
  between symbols (or at a box's end); while dragging, a dashed box "Drag here for a new group"
  shows after the last group. On lifting over a place, `move(from, to)`, then redraw the panel.
  On lifting elsewhere, nothing.
- The panel's size: `max-width: calc(100vw - 32px)`; `max-height: calc(var(--seen-height, 100vh) - var(--bar-h) - 32px)`.
  The left column has `overflow-y: auto; overscroll-behavior: contain;` and the right column
  doesn't scroll.

`reader/reader.ts`:

- `move(from, to)`: `setLibrary(moveSymbol(...))`. If `from` was the tool's symbol, follow it
  (`findSymbol` by its font and text, then `group` and `setCurrent`), as `moveToGroup` does now
  (lines 698–711). Otherwise keep each group's current symbol by font and text where it can, and
  let `setLibrary` clamp the rest.
- Remove `pickGroup`, `moveToGroup`, and the toolbar actions `pick`, `choose`, `moveToGroup` that
  only the second row used.

Delete `reader/_symbol-row.ts` and its CSS (`.symbol-row`, `.symbol-group`, `.symbol-fonts`,
`.symbol-backgrounds`, `.symbol-colors` …). `Toolbar.symbolRow` and `SymbolRowActions` go; the
long-press group menu (`.menu .symbol-choice-row`, `.group-choice`) goes.

## Stage 6: selecting (S3), and the tool following a cycled symbol

`reader/tools/_placing.ts`, `tap()` (lines 88–97) becomes:

```ts
const sel = host.selected();
if (sel) {
  if (hit && hit.mark === sel.mark) { /* text: edit; symbol: cycle, as now */ }
  else host.select(undefined);
  return;
}
if (hit) { host.select({ cut: hit.cut.id, mark: hit.mark }); return; }
tapEmpty(host, slot, at0);
```

- `cycle` (line 30): after selecting the replacement, call a new `ToolHost.cycled(sym: LibrarySymbol): void`.
  The reader, when Symbols is the tool, makes that symbol the tool's (`findSymbol`, then `group`
  and `setCurrent`) and calls `syncBar()`.
- `reader/tools/_symbol.ts` line 17 and `placeText` (`reader.ts` line 538): don't select what was
  placed.
- A press that drags a placed marking (`grab`) works as now, selected or not. A press that drags
  on empty music with a marking selected deselects it at once, and then places (stage 7).

Tests: `_placing.ts` has no tests and needs a DOM; cover the rule as a pure function instead:

```ts
/** What a tap does, from what is selected and what was hit. */
export function _tapAction(selected: PlacedMark | undefined, hit: PlacedMark | undefined): 'deselect' | 'select' | 'again' | 'place';
```

in `_placing.ts`, used by `tap()`, with a test file `reader/tools/_placing.test.ts` for the four
cases (selected and hit the same: `again`; selected and hit another or nothing: `deselect`;
nothing selected and a hit: `select`; neither: `place`).

## Stage 7: placing by press and drag

`reader/_spread.ts`:

```ts
/**
 * The slot under point `p` of slot `from`'s frame (x as a fraction of its width, y in frame
 * widths), and the point on that slot's frame; undefined when it is on no slot.
 */
export function slotUnder(slots: readonly FrameSlot[], from: FrameSlot, p: readonly [number, number]): { slot: FrameSlot; at: [number, number] } | undefined;
```

The spread position is `(from.x + p[0] * from.w, from.y + p[1] * from.w)`; a slot holds it when it
is within `[x, x + w] × [y, y + h]`; `at` is `((sx - s.x) / s.w, (sy - s.y) / s.w)`. Tests in
`reader/_spread.test.ts` (build slots as plain objects; only `x, y, w, h` are read): a point on
the same slot, one on the facing slot, one in the gap between, one off the bottom.

`reader/tools/_placing.ts`:

- `placingTool(label, tapEmpty, ghost)` takes a third argument:

  ```ts
  /** What a press on empty music shows under the finger, as a marking centred at `at`; undefined: nothing to place yet. */
  ghost: (host: ToolHost, at: [number, number]) => PlacedMark | undefined
  ```

  and `tapEmpty` becomes `place(host, slot, at)`, used both by a tap and by lifting a drag.
- In `start`, when there is no `grab`: if a marking is selected, deselect it. On `move` past the tap
  distance, start a `placing` drag: find `slotUnder(host.slots(), slot, last)`; paint the old slot
  without extras and the new one with `host.paintInk(s, ghost)` (only repaint when the slot or point
  changed). On `end`: `slotUnder` again; when it is on a slot, `place(host, under.slot, under.at)`;
  otherwise repaint and place nothing. `drop()` repaints.
- `reader/tools/_symbol.ts`: the ghost is `placed(sym, at, size)` with the symbol colour (from
  `host.symbolColor()`).
- `reader/tools/_text.ts`: the ghost is a text marking "Ag" from a new `ToolHost.textGhost(at)`.
  The reader keeps "Ag" shaped in the text font (`shapeWith`, redone when the font changes; until
  it is ready the ghost is undefined and nothing shows) and returns
  `textMark(font, 'Ag', glyphs, start, size)` with the same `start` as `newText` computes, its
  colour `tint(color)` and its background from the settings.
- Add to `markings/draw.ts`:

  ```ts
  /** `color` (#rrggbb) mixed `t` of the way towards `to`. */
  export function mix(color: string, to: string, t: number): string;
  ```

  The reader's tint is `mix(color, '#1f6fe0', 0.25)`. Test in `markings/draw.test.ts` (new):
  `mix('#000000', '#ffffff', 0.25)` is `#404040`; `t` 0 and 1 give the ends.

`reader/_input.ts`: nothing changes; the tool keeps getting points on the slot where the press
started, and those may lie outside it.

## Stage 8: the loupe

New file `reader/_loupe.ts` (comment: "The loupe shown while a symbol or text is dragged: the music
around it, magnified, above the finger."):

```ts
/** The loupe's diameter, and the height the dragged marking's ink is shown at in it, in CSS px. */
export const LOUPE_PX = 128;
export const LOUPE_INK_PX = 48;
/** The gap between the finger and the loupe's bottom edge, in CSS px. */
export const LOUPE_GAP_PX = 56;

/** How much to magnify: the ink shown LOUPE_INK_PX tall, but never smaller than on screen. */
export const magnification = (inkPx: number) => Math.max(1, LOUPE_INK_PX / inkPx);

/** The point of an ink box (screen px) the loupe centres on: h/2 in from its top, left and bottom; across, its middle when it is narrower than tall. */
export function loupeTarget(ink: { x0: number; y0: number; x1: number; y1: number }): { x: number; y: number };

/** Where the loupe's centre goes for a finger at `f`: above it, or beside it when that would be under `barBottom`; kept on the screen `W` wide. */
export function loupeCentre(f: { x: number; y: number }, barBottom: number, W: number): { x: number; y: number };

export class Loupe {
  constructor(root: HTMLElement);
  /** Start: magnification fixed from the marking's ink height on screen. */
  begin(inkPx: number): void;
  /** Show the area around screen point `target` with the finger at `finger`; draws from the slots' canvases. */
  show(slots: readonly FrameSlot[], target: { x: number; y: number }, finger: { x: number; y: number }): void;
  end(): void;
}
```

- The element is a `canvas.loupe` (`LOUPE_PX` × dpr square, `border-radius: 50%`, a 2 px white
  edge, a 1 px `rgba(0,0,0,.25)` ring, a shadow), positioned `fixed` and `pointer-events: none`,
  appended to the reader's root above the toolbar.
- `show` clears it to white, and for each slot draws its `canvas` (music) and `ink` canvas (which
  holds the ghost or dragged marking, since the tool paints it there) into the loupe:
  `ctx.setTransform(m * dpr, 0, 0, m * dpr, R*dpr - target.x*m*dpr, R*dpr - target.y*m*dpr)` and
  `drawImage(canvas, rect.left, rect.top, rect.width, rect.height)` with each slot box's
  `getBoundingClientRect()`. With a close-up drawn (`slot.detail`), draw that too, at its place.
- Ink height on screen: the marking's `extentOnFrame` (or, for a ghost, `markExtent` times its
  size) times the slot's on-screen width (`getBoundingClientRect().width`).

`reader/tools/_tool.ts`: `ToolHost` gets `loupe(): Loupe`. In `_placing.ts`, every drag (placing,
`move` and `resize`) calls `begin` when it starts, `show` on each move (the finger is the pointer's
screen point: add `client: { x: number; y: number }` to `ToolPointer.move`, which `_input.ts`
passes as `{ x: ce.clientX, y: ce.clientY }`), and `end` on `end` and `drop`.

Tests in `reader/_loupe.test.ts`:

- `magnification(16)` is 3; `magnification(60)` is 1.
- `loupeTarget` of a box 40 wide and 16 tall is 8 in from the left, at the middle; of one 10 wide
  and 16 tall, the middle across.
- `loupeCentre` well below the bar is `LOUPE_GAP_PX + LOUPE_PX / 2` above the finger; near the bar
  it is beside the finger at its height, on the left, or on the right near the left edge.

## Stage 9: the loupe's music, sharp

The slot canvases are drawn at screen resolution, so the loupe's music is soft at 3×. Draw it
sharp, as `reader/_detail.ts` draws the close-up:

- On `begin`, for each slot under the loupe's reach (the slot under the finger and its
  neighbour), ask `host.draw()(page, fw, { crop, priority: 'now', signal })` for the region around
  the finger, with `fw = slot.w * zoom.s * m * dpr`, using `regionBands` as `Detail.draw` does. The
  region is the loupe's area plus 256 CSS px each way. Keep the result as the slot's `sharp` canvas
  with its place.
- `show` draws a slot's `sharp` canvas instead of its `canvas` where it covers the loupe, and asks
  for a new region (superseding the old with an `AbortController`) when the finger has moved
  within 64 CSS px of its edge.
- Ink is drawn sharp too: `drawFrameInk` (`render/paint.ts`) at `fw` into a canvas of the loupe's
  size, with the extra marking being dragged.

Tests: none (drawing).

## Manual checks

Run these on the tablet after each stage that touches them (in brackets), and add each stage's to
`TODO.manual.md`.

- **The light reader** (1):
  - With the app in dark mode, open a score: the reader is light, and so are ⋯ and the title
    menu. Close it: the library is dark again.
  - The toolbar is off-white; a pressed tool is white with a thin ring.
  - The title and the page info are on two lines, starting at the same edge.
  - At about 600 px wide (a small tablet in portrait, or a narrow browser window), the tools are
    on a centred second row and Cuts is only its icon. At 700 px and wider, one row.
  - The side bands, their triangles, the hidden-toolbar back arrow and the cut tabs are all
    visible on the light stage.
- **Settings kept** (2):
  - Choose red for Pen, close the reader and Volti, open them again: Pen is still red.
  - A new highlight is light blue (Default) and the notes under it stay black. An old yellow
    highlight is now strong yellow.
  - Change the Marking colour in the library: Pen on Default draws in the new colour; old strokes
    keep theirs.
- **Pen and Highlight colours** (3):
  - Long-press Pen: its swatches, Default first with a dashed ring. Pick red: the bar under Pen is
    red, and Pen draws red. Tap Pen: it's picked or put away as before.
  - The same for Highlight, with Default, yellow, green and pink.
- **Text and Symbols settings** (4):
  - Long-press Text: Font, Colour, Background. Pick a box: Background colour appears. The T on the
    button shows the font, colour and box.
  - Select a text marking: the T shows its look; change its colour in the panel: the marking
    changes, and new text gets that colour too.
  - Select a symbol and give it a box in the Symbols panel: the next time that symbol is placed it
    has the box; another symbol doesn't.
- **The Symbols panel** (5):
  - Long-press Symbols: the groups in boxes, Recent under its heading, only the tool's symbol lit.
    Tap one: it is the tool and the panel closes.
  - Drag a symbol within its group: it goes where dropped. Drag one to another group, to Recent,
    and to the dashed box (only there while dragging): a new last group.
  - Drag the last symbol out of a group: the group is gone. Drag a ninth into Recent: the oldest
    goes.
  - Add groups in Edit library until the panel is taller than the screen: the library side
    scrolls, the settings stay.
  - There is no second row for any tool.
- **Selecting** (6):
  - Place a symbol: it isn't selected. Tap it: selected. Tap it again: the next in its group, and
    the next placed is that one too.
  - With a symbol selected, tap empty music: it is deselected and nothing is placed. Tap another
    marking: only deselected.
- **Placing by dragging** (7):
  - Press on empty music with Symbols: the symbol shows under the finger; drag it onto the facing
    page and let go: placed there. Drag it off the pages (onto the grey stage) and let go: nothing.
  - With Text: "Ag" follows the finger in a bluish tint; let go: the typing field opens there,
    empty.
- **The loupe** (8, 9):
  - Placing, moving and resizing a symbol: a round loupe above the finger, the symbol about 48 px
    tall in it, centred on the symbol; near the toolbar it moves beside the finger.
  - Zoomed far in, the loupe shows the symbol at its size on screen, not smaller.
  - (9) The music in the loupe is sharp after a moment.

## Decisions made in this plan

These weren't discussed; overrule any of them.

- The reader turns the whole app light while it is open (`data-theme="light"` on the document),
  so its menus and dialogs are light too.
- A stroke on Default stores the colour it resolved to when drawn; it doesn't follow later changes
  to the Marking colours. (Text and symbols on Default do, as now.)
- The background colours offered are the highlighter's three: yellow, green, pink.
- Font in the Text panel is a native dropdown (`<select>`), so its names show in the system font.
- Choosing a setting keeps the panel open; tapping a symbol in the Symbols panel closes it.
- Undo puts back a marking changed from a panel, but not the tool's settings or the library symbol's
  background.
- With a marking selected, a tap on another marking only deselects (the spec's "a tap anywhere");
  selecting the other takes a second tap.
- A placed marking is centred on the finger, as a tap places it now; the loupe is drawn 56 px above
  the finger.
- Groups can't be reordered in the panel yet; that is still in Edit library.
- The ad-hoc row is headed "Recent".
