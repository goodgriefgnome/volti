# The styles' leftovers: plan

How to get to what `css-harmony-spec.md` describes. Read the spec first, and `STYLES.md` for the
tokens and parts already there; where the plan and the spec disagree, the spec wins. Each stage is
one commit, or a few, and every commit leaves `npm test` and `npm run build` passing. Before each
push, also try the stage in the running app (`npm run dev`) with the checks it lists, in both the
light and the dark theme. Commit and push each stage before starting the next.

Line numbers are as the files are before stage 1; they drift, so find each rule by its selector and
each line of code by the text quoted. Code style: match what is there, one rule per line where it is
one line now; keep every comment that is still true and fix one whose rule changed.

## Stage 1: the slips, and values that follow from another

CSS, the test, and one class name in code.

1. **Tints.** `face.css:97` (`.face-issue`) and `face.css:173` (`.face-trials .tr.flagged`): their
   `color-mix(in srgb, var(--warn) 12%, transparent)` → `var(--warn-soft)`.
2. **The floating buttons' background.** Add `--surface-float: color-mix(in srgb, var(--surface)
   85%, transparent);` to the token block, and use it in `.float-button` (`base.css:81`).
3. **Fonts.** `.selection-delete` and `.selection-pass` (`reader.css:63`, `:65`): `sans-serif` →
   `var(--font-ui)`.
4. **The dialog's padding and gap.** In `.dialog` (`ui.css:12-17`) set `--pad: var(--space-4);
   --gap: var(--space-3);` and write `padding: var(--pad); gap: var(--gap);`. Then:
   - `.dialog .buttons` (`ui.css:35-38`): `bottom: calc(-1 * var(--pad)); margin-bottom:
     calc(-1 * var(--pad));` and `padding-block: var(--space-2) var(--pad)`.
   - `.face-view-head-slot` (`face.css:91`): `top: calc(-1 * var(--pad)); margin-top:
     calc(-1 * var(--gap));` and `padding-block: var(--pad) var(--space-2)`. Fix its comment
     ("over the dialog's 16px padding too") to say "over the dialog's padding too".
5. **The library's gap.** In `.library` (`library.css:2-7`) set `--gap: var(--space-5);` and use
   `gap: var(--gap)`. `.section-head`'s `margin-bottom: -10px` (`library.css:18`) →
   `calc(var(--space-2) - var(--gap))`.
6. **The checkbox.** Add `--check: 20px;` to the token block; `.dialog .check input` (`ui.css:40`)
   takes `width: var(--check); height: var(--check)`. `.pick-row .picked`'s left padding
   (`dialogs.css:25`) and `.pick-sub`'s (`dialogs.css:35`) → `calc(var(--check) + var(--space-2))`.
7. **The recording screen's instruction.** `src/face/_recording-screen.ts:40`:
   `el('div', 'bar')` → `el('div', 'face-recording-bar')`. In `face.css:191`,
   `.face-recording-screen .bar` → `.face-recording-screen .face-recording-bar`. Grep `face.css`
   and `_recording-screen.ts` for any other `.bar` under the recording screen and rename it too.
8. **The test.** In `src/styles/styles.test.ts`, widen the colour test's pattern to also match
   `color-mix\(` (so the test's name still fits: a tint is a colour), and keep its message ending in
   "see STYLES.md".

**Checks in the app.** A dialog that scrolls (Add scores in a long library): its buttons stay at the
bottom, flush with its edge, with no gap under them. Open a face gesture's details and scroll: its
head stays flush with the dialog's top, with nothing showing above it. In the library, the
"Setlists" and "Scores" heads sit just above their lists. Add scores: pick an excerpt; its chip
starts under the score's title, not 4 px to the right of it; open a score's named excerpts: same.
Record a face gesture: the instruction sits at the top as before.

## Stage 2: the new tokens

Add to the token block `--edge: 8px`, `--hover`, `--focus`, `--tile: 56px`, `--dim: 0.5`,
`--dragged: 0.6`, `--quick: 160ms`, `--slow: 300ms` and `--hatch`, with the values in the spec and
a short comment on each that isn't obvious from its name (as the token block's comments now are).
Then:

1. **The edge.**
   - The face button (`face.css:6`): `max(calc(var(--edge) + 10px), env(…))` for its `top` and
     `right`, so its rings (10 px past it, `face.css:12`) sit at the edge; say so in its comment.
   - Other floating things: `.reader > .back` (`reader.css:36`, `max(6px, …)` twice), `.toast` (`ui.css:53`), `.score-card` (`reader.css:218`),
     `.face-recording-bar` (`face.css:191`: `left`, `right` and `top`): each length becomes
     `var(--edge)`, inside the `max(…, env(…))` where there is one.
   - `.scope` (`reader.css:227`): `top: calc(var(--bar-h, 56px) + var(--edge))`; `.chrome-hidden
     .scope` (`reader.css:231`): `top: var(--edge)`.
   - Widths and heights kept clear of the screen's sides: every `calc(100vw - 32px)` and
     `calc(100vw - 16px)` → `calc(100vw - 2 * var(--edge))` (`ui.css:3,14,30,54`;
     `reader.css:145,220,228`). The dialog's `max-height: calc(var(--seen-height, 100vh) - 32px)`
     and the keyboard's `- 24px` → `- 2 * var(--edge)`.
2. **Hover.** `.menu button:hover, .menu button:focus-visible` (`ui.css:9`), `body.reading .menu
   button:hover, …:focus-visible` (`reader.css:128`) and `.list button.open:active`
   (`library.css:28`): background → `var(--hover)`. Stage 3 moves them into the row button.
3. **Focus.** Replace `button:focus-visible, input:focus-visible { … }` (`base.css:60`) with
   `:focus-visible { outline: var(--focus); outline-offset: 2px; }`. `.band:focus-visible`
   (`dialogs.css:17`): `outline: var(--focus)`, keeping its `outline-offset: -3px`.
   `.tab:focus-visible::after` (`reader.css:186`): `outline: var(--focus)`. Delete
   `.face-meter .on:focus-visible` (`face.css:78`): the global rule covers it. `.tab:focus-visible
   { outline: none; }` and `.typing`'s `outline: none` stay.
4. **Tiles.** `56px` and `52px` → `var(--tile)` in: `.glyph-picker-body .glyph-grid`'s
   `grid-template-columns` and `.glyph-cell`'s width and height (`reader.css:75-76`), `.library-editor
   .symbol-choice`'s width (`reader.css:87`), `.symbol-panel .group-box`'s and `.new-group`'s
   `min-height` and `.symbol-choice`'s width and `min-height` (`reader.css:149,153,155`).
5. **Dimming.** `opacity` → `var(--dim)` in: `button:disabled` (`base.css:61`),
   `.face-button[data-status="unavailable"] .face-glyph` and `[data-status="paused"] .face-glyph`
   (`face.css:20,29`), `.face-ft.off .face-names` (`face.css:115`), `.face-bar .lane.grey`
   (`face.css:153`), `.face-picker .pk.none` (`face.css:162`), `.face-trials .tr.off`
   (`face.css:174`), `.incoming-row.have .incoming-preview` (`library.css:110`), and
   `.symbol-panel .symbol-choice.dragging` (`reader.css:154`).
6. **Muted, not see-through.** `.bar .page-info` (`reader.css:52`), `.bar .title b`
   (`reader.css:209`) and `.score-card b` (`reader.css:223`): delete the `opacity` and set
   `color: var(--muted)`.
7. **Durations.** `.bar`'s `160ms` (`reader.css:20`) and `.set-body`'s `220ms` (`library.css:50`) →
   `var(--quick)`; `.chev`'s `200ms` (`base.css:95`) → `var(--quick)`; `.score-card`'s `300ms`
   (`reader.css:221`) → `var(--slow)`. The face button's `animation`s stay.
8. **Hatching.** `.face-bar .face-band.rest` (`face.css:134`) and `.face-trials .trace-cell .guard`
   (`face.css:178`): their `repeating-linear-gradient(…)` → `var(--hatch)`; each keeps its opacity.

Extend the test:

- `it('times transitions by the tokens')`: no `transition` or `transition-duration` value contains a
  time literal (`/\b\d*\.?\d+m?s\b/`).
- `it('rings focus with the one ring')`: every `outline` value is `var(--focus)`, `none` or `0`.

**Checks in the app.** Hide the reader's toolbar: the back arrow and the face button sit the same
distance from the top and from their sides, counting the face button's rings. Remove a score and see the toast; turn into a setlist's
next score and see the score card; edit cuts in a setlist and see the scope note, with the toolbar
shown and hidden: each 8 px from its edge. Start the face button watching and hide the toolbar: its
rings are whole, 8 px from the top and right, level with the back arrow. On a phone width, a dialog
and a menu keep 8 px from each side. With a keyboard, press Tab through the library, a dialog, the Excerpt picker's bands, the
cut tabs and the face meter's handle: the same accent ring each time. Hover over a library row and a
menu item with a mouse: a faint grey, the same in the reader's menus. Open the Symbols panel, the
glyph picker and the library editor: the symbols' tiles are one size. The reader's title in a
setlist ("2/3" before it) and the page info read as muted text.

## Stage 3: the new shared parts

Add each part of the spec's table to `base.css`, after the parts already there, each with a one-line
comment. Then use it and remove what it replaces. One commit per part, or a few to a commit.

1. **Icon button** (`.icon-button`, `.icon-button.small`). Add the class in code:
   - `src/library/_rows.ts:56` (`'quiet more'` → `'quiet icon-button more'`) and `:44`
     (`'expand'` → `'icon-button quiet expand'`);
   - `src/library/_setlists-section.ts:127` (`'quiet ring'` → `'quiet icon-button ring'`) and
     `:140` (`'handle'` → `'quiet icon-button handle'`);
   - `src/reader/_title-menu.ts`: `iconButton` (line 82) adds `icon-button`; the grip (line 99) and
     the + (line 120) get it too;
   - `src/reader/_tools/_swatches.ts`: the swatch buttons and the shape buttons (line 63);
   - `src/face/dialog.ts:144` (`'pencil'` → `'quiet icon-button small pencil'`);
   - `src/face/_details.ts:70` (`'quiet'` → `'quiet icon-button'`).

   Remove from the CSS what the part now sets: `.more`'s rule (`base.css:94`) but its `flex: none`;
   `.ring`'s width, padding and centring (`library.css:31`); `.expand`'s padding, border,
   background (`library.css:46`), keeping `flex: none; width: var(--control); color: var(--muted)`
   because `_rows.ts:29` and `_scores-section.ts:123` also use `expand` on an empty `span` that holds
   the place; `.menu .menu-action`'s width (`reader.css:103`); the title row's grip, swap and bin
   width, padding and centring (`reader.css:112`, keep `flex: none; touch-action: none`); the
   swatch's width, `min-height` and padding (`reader.css:131`); the shape's `min-width`, padding and
   centring (`reader.css:136`, keep its padding if the shapes then look cramped, and say so in the
   commit); `.face-named button.pencil` (`face.css:69`) but its colour; `.entry .handle`'s width,
   `min-height`, padding, border and background (`library.css:59-61`).
2. **Row button** (`.row-button`). Its hover goes inside `@media (hover: hover) { … }`; `:active`
   outside it. Add the class in code to: the library rows' `open` buttons
   (`src/library/_scores-section.ts:118,131,176`, `src/library/_setlists-section.ts:73,143`); the
   folder heads (`src/library/_scores-section.ts:107`, `src/dialogs/add-scores.ts:108`); the face
   channel picker's rows (`src/face/_details.ts:170`); the play-from list's buttons
   (`src/dialogs/_face-play-from.ts`, the buttons in `.face-pick-list`); the Drive folders' buttons
   (`src/library/_drive-folders.ts:52`); the title menu's titles (`src/reader/_title-menu.ts`, the
   `go` button); and every menu item (find where `ui/overlay.ts` builds a menu's buttons).

   Remove what the part now sets from `.list button.open` (`library.css:24-28`, including its
   `:active`), `.folder-head` (`base.css:96-99`), `.face-picker .pk` (`face.css:160`), `.menu button`
   (`ui.css:8-9`, including its hover), `.face-pick-list button` (`dialogs.css:45`), `.drive-folders
   .removed-row > button` (`library.css:122`), `.menu .title-row .go`'s background
   (`reader.css:108`), and `body.reading .menu button:hover` (`reader.css:128`). Keep
   `body.reading .menu button:not([aria-pressed="true"]) { background: transparent; }` only if the
   reader's menus still show a white button without it.
3. **Small button** (`button.small`). In code: the face name's OK and Cancel
   (`src/face/dialog.ts:160`, and the name row's at `:321-323`); the face sections' Reset
   (`src/face/_details.ts:103,124`); the toast's Undo (`src/ui/toast.ts`, where it makes the button).
   Remove `.face-named button`'s height and padding (`face.css:68`), `.face-sec-head button`
   (`face.css:101`), and `.toast.act button`'s height and padding (`ui.css:61`).
4. **Note** (`.note`). In code: `src/ui/toast.ts:7` (`'toast'` → `'note toast'`),
   `src/reader/_setlist.ts:48` (`'score-card'` → `'note score-card'`), `src/reader/reader.ts:129`
   (`'scope'` → `'note scope'`). Then `.toast`, `.score-card` and `.scope` keep only what is their
   own: where they sit (top or bottom, the edge, their layer), the toast's `position` and
   `.fixed`, the scope's accent colours, and for the score card and scope `white-space: nowrap;
   overflow: hidden; text-overflow: ellipsis`.
5. **Dragged row** (`.reordering`). In `src/ui/drag-reorder.ts:11,21`, the class added and removed
   is `reordering` instead of `dragging`. Add the rule; delete `.entry.dragging`
   (`library.css:63`), `.menu .title-row.dragging` (`reader.css:113`) and `.symbol-panel
   .group-box.dragging` (`reader.css:152`). Grep `src/` for `'dragging'` afterwards: only the cut
   tabs (`reader/_cuts/_editor.ts`) and the Symbols panel's symbols (`_symbol-panel.ts`) should set
   it.

**Checks in the app.** Every ⋯ button, expander, setlist ring, title-menu icon, swatch and shape is
the same 44 px square and centred; the face name's pencil is 32 px. Hover and press a library row, a
folder head, a menu item in the library and in the reader, a face channel picker row: the same
faint grey. In the face dialog, rename a gesture (OK, Cancel), reset a section; remove a score and
press Undo: the small buttons are one height. The toast, the score card and the scope note have the
same shape; a long toast wraps; a long title in the score card is cut short. Drag a setlist's entry,
a title-menu entry and a symbol group: each is dimmed while it moves, and the blue line shows where
it will go. Drag a symbol: its place dims and its copy follows the finger. Drag a cut tab: it turns
blue, not dimmed.

## Stage 4: icons

1. In `src/ui/dom.ts`, give `icon` a second parameter, `cls?: string`, whose classes it adds after
   `icon`:

   ```ts
   /** A small icon drawn with the path `d`, in the button's colour; `cls` adds classes after `icon`. */
   export function icon(d: string, cls?: string): SVGSVGElement;
   ```

   and export, beside `GRIP`, each with a one-line comment as `GRIP` has:

   ```ts
   export const BACK = 'M15 5 8 12l7 7';
   export const CHEVRON = 'M9 5l7 7-7 7';
   export const DOTS = 'M5 12h.01M12 12h.01M19 12h.01';
   ```
2. Delete `icon` from `src/reader/_tools/_faces.ts` and import it from `../../ui/dom` there; change
   every other import of `icon` from `_faces` (grep `from './_tools/_faces'` and
   `from './_faces'`) to `ui/dom`. Delete `backIcon`, `chevronIcon` and `DOTS` from
   `src/reader/_toolbar.ts`; use `icon(BACK)` (`_toolbar.ts:91`, `src/reader/reader.ts:353`, whose
   import of `backIcon` goes) and `icon(CHEVRON, 'chevron down')` (`_toolbar.ts:96`); the toolbar's
   ⋯ uses the imported `DOTS`. `npm run build` checks that nothing still imports what was deleted.
3. Characters and CSS chevrons become icons:
   - `src/library/_rows.ts:45`, `src/library/_scores-section.ts:108` and
     `src/dialogs/add-scores.ts:109`: `el('span', 'chev')` → `icon(CHEVRON, 'chevron')`.
   - `src/library/_rows.ts:56`: the ⋯ button's label `'⋯'` → `''`, append `icon(DOTS)`, and set
     `aria-label` to `More` (unless it already has a label; keep that one).
   - `src/library/_setlists-section.ts:140`: the handle's `'⋮⋮'` → `''`, append `icon(GRIP)`, and
     give it `aria-label="Move"` unless it has a label.
   - `src/face/_details.ts:70`: `'‹'` → `''`, append `icon(BACK)` (its `aria-label` stays).
   - `src/face/dialog.ts:295`: `el('span', 'face-chevron', '›')` → `icon(CHEVRON, 'chevron')`.
4. CSS:
   - Delete `.chev` and `.folder-head .chev` (`base.css:95,100`). Add to `base.css`, after `.icon`:
     `.icon.chevron { width: 18px; height: 18px; flex: none; transition: transform var(--quick); }`
     and `.icon.chevron.down { transform: rotate(90deg); }`.
   - The open states turn the chevron down: `.set.open .chev, .folder-list.open .chev`
     (`library.css:47`) and `.pick-folder.open .chev` (`dialogs.css:32`) →
     `… .chevron { transform: rotate(90deg); }`.
   - Delete `.bar .icon.chevron` (`reader.css:117`): the base rule sizes it.
   - `.face-row > .face-chevron` (`face.css:59`) → `.face-row > .chevron`, keeping its grid place
     and muted colour; drop its `font-size`.
   - Delete `.entry .handle`'s `font-size` and `letter-spacing` (`library.css:61`), and the
     `font-size` of `.face-view-head > button:first-child` (`face.css:95`).
   - The reduced-motion rule (`reader.css:233`): `.chev` → `.icon.chevron`.

**Checks in the app.** The library: a setlist's arrow points right, and down while it is open,
turning as it opens; the same for a scores subfolder and Add scores' subfolders. The ⋯ buttons in
the library look like the reader's. A setlist entry's grip is the dots of the title menu's grip. In
the reader, the toolbar's back arrow and title chevron look as before. The face dialog: the rows'
arrows, and a gesture's back arrow, are drawn icons. A screen reader (or the browser's
accessibility tree) names the ⋯ button, the grip and the back arrow.

## Stage 5: the documentation

Bring `STYLES.md` up to date with the spec's "Documentation" section:

- the new tokens in its tables (`--edge`, `--hover`, `--focus`, `--tile`, `--check`, `--dim`,
  `--dragged`, `--quick`, `--slow`, `--surface-float`, `--hatch`), each with what it is for;
- the new parts in its shared parts' table (`.icon-button`, `.row-button`, `button.small`,
  `.note`, `.reordering`, the global focus ring), each with when to use it;
- under the scales: "Secondary text takes `--muted`; opacity is for dimming (`--dim`,
  `--dragged`) and drawing, never to make text look secondary.";
- a short section **Icons**: every icon is `icon(d, cls?)` from `ui/dom.ts`, with the shared paths
  (`BACK`, `CHEVRON`, `DOTS`, `GRIP`) beside it; no character stands in for an icon;
- under **Checking**, the test's new checks (tints, transitions, focus rings).

Check `ARCHITECTURE.md` for a mention of `backIcon`, `chevronIcon`, `.chev` or `_faces.ts`'s
`icon` (grep), and change any to what is there now.

**Checks.** Grep for every token, class and function `STYLES.md` names: each exists in `src/`.
