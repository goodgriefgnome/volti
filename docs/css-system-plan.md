# A system for the styles: plan

How to get to what `css-system-spec.md` describes. Read the spec first; where the two disagree, the
spec wins. Each stage is one commit, or a few, and every commit leaves `npm test` and
`npm run build` passing. Before each push, also try the stage in the running app (`npm run dev`)
with the checks it lists, in both the light and the dark theme (switch your system's theme; the
reader is always light). Commit and push each stage before starting the next.

The files are `src/styles/base.css`, `ui.css`, `library.css`, `dialogs.css`, `reader.css` and
`face.css`; `main.ts` imports them in that order (base, ui, library, dialogs, reader, face), and
later rules win ties. Line numbers below are as the files are before stage 1; they drift, so find
each rule by its selector.

Code style: match what is there. Rules stay one per line where they are now; comments say what a
rule is for, in the tone of the comments around it. Keep every comment that still says something
true, and fix one whose rule changed.

## Stage 1: dead rules, duplicates and the blank page

CSS only. Nothing should look different except the blank page.

Delete:

- `base.css`: the `:root[data-theme="dark"]` rule (lines 33-38): nothing sets that theme. Keep the
  `@media (prefers-color-scheme: dark)` block for now; stage 2 replaces it.
- `base.css`: `.start .brand` (line 57), which repeats `.brand`.
- `library.css`: `.badge` (line 74): no code uses it. Also the empty lines at 16-17.
- The `[hidden]` rules that repeat `base.css`'s global `[hidden] { display: none !important; }`:
  `.selection[hidden]`, `.selection-pass[hidden]`, `.tool-layer[hidden]` and
  `.glyph-picker-body select[hidden]` in `reader.css`.
- `reader.css`: `.reader { --select: …; --tab-grey: …; --cut: … }` (line 181). The reader sets the
  light theme (`src/reader/reader.ts:363`), so `--select` is already that blue. In the same file,
  write `var(--muted)` for `var(--tab-grey)` and `var(--accent)` for `var(--cut)`.
- `face.css`: the reduced-motion rule for `.face-video` (line 204): it has no transition.
- `face.css`: `!important` in `.face-sec-head h3 { margin: 0 !important; }`. Check in the app that
  the heading's margin is still 0; if `.dialog h3` (`ui.css:19`) wins, make the selector
  `.dialog .face-sec-head h3` instead.
- `face.css`: `color: var(--muted)` in `.face-thr .lim.off`, which `.face-thr .lim` already sets.
- The unneeded fallbacks: `var(--accent-soft, var(--bg))` → `var(--accent-soft)`, and
  `var(--font-brand, serif)` → `var(--font-brand)` (both `reader.css`).

Merge the selectors written twice into one rule each:

- `.symbol-panel` (`reader.css:156` and `:159`).
- `.entries button.open` (`library.css:60` and `:64`).
- `.menu .title-row .grip, .swap, .bin` (`reader.css:118` and `:121`).
- `.library > .status:empty` and `.status` (`library.css:14` and `:18`): put them next to each
  other.

Fix `.page.blank` (`reader.css:227-232`): its border becomes `1px dashed var(--line)` and its
`color` becomes `var(--muted)`; `.page.blank .t` keeps `color: var(--bar-fg)` until stage 2.

**Checks in the app.** Open a setlist and turn past the last screen of a score that doesn't fill it:
the blank page shows "Next" and the next title, readable, in a dashed outline. Turn past the last
score: "End of the setlist". Open the face-gestures dialog, open a gesture: its section headings
("Channels" and the like) sit as before. Select a marking: the selection and "This time only"
show and hide as before.

## Stage 2: the colour tokens and the theme

Rewrite the top of `base.css`. The token block starts with the comment `/* Tokens */` and ends with
`/* End of the tokens */`; stage 2's test looks for both.

```css
/* Tokens */
:root {
  color-scheme: light dark;
  --bg: light-dark(#f2f3f6, #121419);
  --surface: light-dark(#ffffff, #1b1e25);
  /* … every colour of the spec's table, light first … */
  --accent-soft: color-mix(in srgb, var(--accent) 14%, transparent);
  /* … */
}
:root[data-theme="light"] { color-scheme: light; }
/* End of the tokens */
```

Add every colour token in the spec's table, with `--paper`, `--scrim`, `--shade`, `--hairline` and
`--font-mono`. Remove `--stage`, `--bar-fg`, `--bar-line` and `--bar-pressed`, and replace their
uses: `--stage` → `--bg`; `--bar-fg` → `--fg`; `--bar-line` → `--line`; `--bar-pressed` →
`--surface` (stage 4 replaces those rules with the pressed look).

Then replace every colour literal outside the token block, file by file:

- `#ffffff` for a page, thumbnail or the recording screen → `var(--paper)`; for text on the accent
  or on the selection blue → `var(--accent-fg)` (it is white in the light theme the reader uses);
  for the selection's handle fill → `var(--paper)`.
- `#1f6fe0` → `var(--select)`. `#1d2026` and `#16181d` → `var(--fg)`. `#5b6170` → `var(--muted)`.
  `#8a5a12` → `var(--accent)`. `#8d93a0` → `var(--muted)`. `#dde0e7` → `var(--line)`.
- `rgba(138, 90, 18, …)`: the excerpt band's dashed line → `var(--accent)`; the cut editor's
  `.room` → `var(--accent-soft)`.
- `rgba(40, 42, 48, …)` and `rgba(29, 32, 38, 0.07)` → `var(--shade)`. The band's number label and
  the turn band will be a little darker or lighter; that is fine.
- `rgba(0, 0, 0, …)` in a 1 px ring (`0 0 0 1px`) → `var(--hairline)`; in a shadow with a blur, keep
  it until stage 3 (shadows are stage 3) but add the shadow tokens now so the test passes: see
  below.
- `rgba(255, 255, 255, 0.85)` on the back and face buttons →
  `color-mix(in srgb, var(--surface) 85%, transparent)`.
- `rgba(10, 11, 14, 0.45)` → `var(--scrim)`. `rgba(239, 240, 243, 0.97)` → `var(--bar)`.
- `.toast.act button`'s `rgba(255, 255, 255, 0.35)` border → `var(--line)`.
- `.face-video`'s `#000` → `var(--line)`.
- `reader.css` `body.reading .menu button:hover`'s `rgba(0, 0, 0, 0.05)` → `var(--select-soft)`.
- `face.css`: the recording screen's bar (line 198) takes `background: var(--bar); color:
  var(--fg); border: 1px solid var(--line)`; delete its two dark-theme rules (lines 199-200).

Shadows have colours too, so add the three shadow tokens in this stage, inside the token block:

```css
--shadow-paper: 0 1px 4px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05);
--shadow-float: 0 4px 16px rgba(0, 0, 0, 0.22);
--shadow-popup: 0 12px 40px rgba(0, 0, 0, 0.35);
```

and replace every shadow with a blur by the nearest of them: pages, thumbnails, the play-from
thumbnail, the switch's knob and the toolbar's soft shadow → paper (the toolbar keeps its
`0 1px 0 var(--line)` line first); the loupe (after its two rings) and the recording screen's bar →
float; menus and dialogs → popup.

Add the test, `src/styles/styles.test.ts`, starting with a comment saying what it checks:

```ts
// The styles draw their values from base.css's tokens: no colour is written outside them, and
// sizes, radii, gaps and layers come from the scales (docs/css-system-spec.md).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const FILES = ['base', 'ui', 'library', 'dialogs', 'reader', 'face'] as const;

/** A style file's text without comments, and for base.css without its token block. */
function rules(name: (typeof FILES)[number]): string;

/** Each declaration `prop: value` in `css` whose property is one of `props`, as [prop, value]. */
function declarations(css: string, props: readonly string[]): [string, string][];
```

`rules` reads the file with `readFileSync(new URL(`./${name}.css`, import.meta.url), 'utf8')`,
strips `/* … */` comments, and for `base.css` cuts from `/* Tokens */` to `/* End of the tokens */`
(strip comments after cutting). `declarations` matches `/(?:^|[;{\s])(prop)\s*:\s*([^;}]+)/g`.

This stage's test:

- `it('writes no colour outside the tokens')`: for each file, `rules(name)` contains no match of
  `/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i`. The failure message names the file and the match, and
  ends "use a colour token: see STYLES.md". Every test added in stage 3 ends its message the same
  way, naming the scale.

**Checks in the app.** In the light theme and then the dark theme: the library, its ⋯ menu with the
storage bar, a dialog (Add scores), a toast (remove a score and see Undo). Open a score: the reader
is light in both themes, the toolbar off-white, pages white, a pressed tool ringed in blue; close it
and the library is back in your theme. Open the face-gestures dialog from the library in the dark
theme and record a gesture: the recording screen's instruction bar is dark, its page white. In the
cut editor: tabs brown, the padding tab grey, a dragged tab blue.

## Stage 3: the scales

Add the scale tokens of the spec to the token block (space, text, radius, control, layer, and
`--scroll-max`; shadows came in stage 2). Then go file by file, in import order, and replace:

- every `gap`, `row-gap`, `column-gap`, `padding` and `margin` length that spaces things out with
  `var(--space-…)`, snapping as the spec's table says. Leave alone what the spec says the scales
  don't cover; when unsure whether a value draws or spaces, leave it and list it in the commit
  message.
- every `font-size` and the size in every `font` shorthand with `var(--text-…)`, except `.brand`'s
  `2.4rem` and `.tab .tab-pass`'s `10px`. `button`'s `15px` becomes `var(--text-md)`.
- every `border-radius` px value with `var(--radius-…)`, by the spec's table. A radius that is half
  its element's height (the switch, the storage bar, the face bar's lanes, the partner chip, the
  score card) becomes `var(--radius-pill)`. Corner-only radii keep their shape:
  `0 0 8px 0` → `0 0 var(--radius) 0`.
- `min-height`s and `height`s of buttons and fields: 44 px → `var(--control)`; the compact ones
  (spec's table) → `var(--control-sm)`. The widths of square icon buttons (`.more` at 48 px,
  `.ring`, `.expand`, `.menu-action`, the title row's grip, swap and bin) → `var(--control)`.
- row `min-height`s: 52 → 48, 60 → 56.
- the global z-indices with the layer tokens (spec's table): `.reader`, `.toast`, `.toast.fixed`,
  `.menu`, `.dialog`, `.catcher` and `.scrim` (`calc(var(--z-popup) - 1)`), `.scrim.on-top`,
  `.dialog.on-top`, `.symbol-panel .drag-ghost` and `.drop-line`, `.face-recording-screen`. Above
  `.reader`'s rule, add one comment listing the reader's local layers and their numbers.

Extend the test with:

- `it('sizes text from the scale')`: every `font-size` value is `inherit` or matches
  `/^var\(--text-\w+\)$/`; every `font` value has no `/\d(px|r?em)\b/`. Exempt by exact
  declaration: `font: italic 600 2.4rem/1 var(--font-brand)` and `font-size: 10px`.
- `it('rounds corners from the scale')`: no `border-radius` value contains `px`.
- `it('spaces from the scale')`: every `gap`, `row-gap` and `column-gap` value is `0` or one or two
  `var(--space-N)`.
- `it('stacks globally only by the layer tokens')`: every `z-index` is a `var(--z-…)`, a `calc` of
  one, or a literal from 0 to 12.

**Checks in the app.** Step through every screen and compare with the app before this stage (keep
a second tab on `main` before the stage, or screenshots). Look for: text that now wraps or is cut
off (the toolbar between 600 px and 700 px wide, where it wraps; the cut tab's "Pass 2"; the trials
table on a phone); controls smaller than 44 px to tap that weren't before; dialogs whose buttons no
longer stay in sight while scrolling. The library, a setlist opened, a score's excerpts, Add scores
with a subfolder, the storage menu, Recently removed, importing a file, the reader's toolbar and each
tool's long-press panel, the Symbols panel and library editor, the glyph picker, the title menu, the
cut editor and its insert dialog, the face-gestures dialog with a gesture's details and its trials.

## Stage 4: the shared parts

Add each part of the spec's table to `base.css`, after the buttons, with a one-line comment each.
Then remove what each replaces from the other files, and make the small code changes it needs:

1. **Pressed.** Add `button[aria-pressed="true"]:not(.float-button)`. Remove the pressed rules it
   replaces: `.bar button[aria-pressed="true"]` (`reader.css:55`), the swatches', shapes' and
   symbols' rule (`reader.css:144`; keep `background: var(--surface)` on the swatches only, so
   their colours read true), `.thumbnail[aria-pressed="true"]` and the thumbnail's
   `border: 2px solid transparent` (`reader.css:215,218`), `.dialog .pass-row
   button[aria-pressed="true"]` (`reader.css:222`), and the `:not([aria-pressed="true"])` in
   `body.reading .menu button:hover` (keep the hover). `.selection-pass` keeps its own.
2. **Field.** Add `input.name, input.search, select`. Remove what it sets from `.search`
   (`base.css:63`; keep `flex` and `min-width`), `.dialog select` (keep `justify-self` and
   `max-width`), `.dialog input.name` (delete), `.tool-panel .font-select` (delete), and the
   `min-height` of `.face-named input.name` (it becomes `var(--control-sm)`).
3. **Chip.** Add `.chip`, `.chip.mono`. In code:
   - `src/face/_trials.ts:73`: the chip's class is `chip` (and `mono` as now); set
     `chip.setAttribute('aria-pressed', String(c.shown === shown))` instead of the class `on`.
   - `src/face/_channel-row.ts:81`: class `chip mono face-partner` (and `off` as now).
   - `src/dialogs/add-scores.ts:169`: the picked excerpt's class `pill` → `chip`.

   Remove `.face-chips .chip`, `.chip.mono`, `.chip.on` (`face.css:169-171`), what `.face-partner`
   repeats of the chip (keep its `gap`, padding and `.off`), and `.pick-row .picked .pill`
   (`dialogs.css:26`).
4. **Small capitals.** Add `.caps`, and make `.pill` use the same values. In code: the library's
   two section heads' `h2` (`src/library/library.ts:85,87`) get class `caps`; the blank page's
   label (`src/reader/_setlist.ts`, `blankBox`) gets `label caps`; the score card's `b`
   (`src/reader/_setlist.ts:49`) gets `caps`. Remove what `.section-head h2`, `.page.blank .label`
   and `.score-card b` repeat (keep `.section-head h2`'s `margin: 0` and colour).
5. **Icon.** Add `.icon`. In code, the class each SVG gets becomes `icon`: `src/ui/dom.ts:39`
   (`row-icon`), `src/reader/_toolbar.ts:15` (`back-icon`) and `:32` (`chevron-icon` → `icon
   chevron`), `src/reader/_tools/_faces.ts:21` (`tool-icon`), `src/face/face-button.ts:53`
   (`face-glyph` → `icon face-glyph`). Grep for each old class name in `src/` and change every
   other use too (CSS selectors that contain it, such as `button:has(> .back-icon)`). Keep in the
   CSS only the sizes by place (`.menu .icon` 20 px, `.icon.chevron` 18 px), the grips'
   `stroke-width: 3`, and `.face-glyph`'s `transform-origin`.
6. **Floating button.** Add `.float-button`. In code: `src/reader/reader.ts:351` the back button's
   class `back float-button`; `src/face/face-button.ts:48` `face-button float-button`. Remove what
   `.reader > .back` and `.face-button` repeat (keep their positions, `display` and the face
   button's `position: relative`).
7. **Divided lists.** Rewrite the borders of the lists the spec names to its one pattern. Keep each
   list's own class; only the border declarations change. Remove the `:last-child { border-bottom:
   0 }` rules and the `+ .x { border-top }` rules this replaces.
8. **Scrolling box.** Replace the `max-height` limits named in the spec with `var(--scroll-max)`.
9. **Dialog width.** `.dialog` takes `width: min(var(--dialog-w, 720px), calc(100vw - 32px))`;
   `.dialog.wide, .dialog.glyph-picker { --dialog-w: 900px; }` goes in `ui.css` beside `.dialog`.
   Delete the four "Sits in base.css" rules (`base.css:80-87`) and `.dialog.wide`'s width
   (`ui.css:42`); `.keyboard .dialog, .keyboard .dialog.wide` becomes `.keyboard .dialog`. Keep
   `.glyph-picker-body .buttons` (it moves to `reader.css`, next to the glyph picker's rules; it is
   more specific than `.dialog .buttons`, so the order no longer matters, but check it in the app).

One commit per part, or a few parts to a commit; each commit passes the tests and the build.

**Checks in the app.** Press each kind of toggle and see the same blue tint and ring: a reader
tool, a colour swatch, a background shape, a symbol, a pass and a page in the cut editor's insert
dialog, a trials chip, a partner chip, Show archived in the library. The face button over the
score: its rings for watching, paused and no face, and no blue tint. Type in a field in each dialog
that has one, and in the library's search: all the same height and corners. Add scores: pick an
excerpt and see its chip; tap it to remove it. The icons in the toolbar, the title menu and the back
arrow (hide the toolbar) are drawn as before. Every dialog: its width, and with the on-screen
keyboard open (a phone or a tablet), the dialog widens and its buttons stay in sight. The glyph
picker's buttons sit under its grid, not stuck to the bottom.

## Stage 5: the documentation

`STYLES.md` was written with the spec. Read it against what stages 1 to 4 built, and fix whatever
differs: a token's name, a part's selector, a value in the scales' table. Where the code turned out
better than the spec, the doc follows the code; say so in the commit message.

Then point to it from `ARCHITECTURE.md`:

- The paragraph on `styles/` (it starts "`styles/` holds the CSS"): keep the first sentence, delete
  the one about rules that stay in `base.css` to lose to a `ui.css` rule (stage 4 removed the last
  of them), and add: "How to style something, and the tokens and shared parts to use, are in
  `STYLES.md`: read it before writing CSS."
- The line on the reader's theme (it starts "The reader sets `data-theme=\"light\"`"): end it at
  "puts the app's theme back when it closes", and add "so every colour token takes its light value".
- A recipe after **A dialog**:

  > **Styling a new element**: reuse a shared part from `styles/base.css` (a button, a toggle with
  > `aria-pressed`, a field, a chip, an icon), then the tokens for spacing, text, corners and
  > colours; add CSS of its own only for where it sits, in its directory's style file. `STYLES.md`
  > says which part and which token is for what.

- In **Checking a change**, after the sentence on `npm run build`: "`npm test` also checks the
  styles against the tokens (`styles/styles.test.ts`)."

Also add `STYLES.md` to the README's line that points to `ARCHITECTURE.md` (`README.md:236`), in the
same words as it gives `ARCHITECTURE.md`.

**Checks.** Follow each link and file name in `STYLES.md` and the changed lines of
`ARCHITECTURE.md`: every selector, token and file named exists (`grep` for each).
