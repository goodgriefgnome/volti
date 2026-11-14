# A system for the styles: spec

What `src/styles/` is once this work is done: the tokens every rule draws its values from, the
shared parts in `base.css`, and the few places that keep their own values. How to get there is in
`css-system-plan.md`; where the two disagree, this file wins.

## Why

The styles grew a rule at a time, and no value was chosen against the others. They use 13 font
sizes (10 px to 24 px, 13.5 px among them), 14 corner radii, 17 different gaps, 11 control heights,
8 shadows and z-indices from 1 to 60. The same part is written several times over with small
differences: four text fields, five pills and chips, three looks for a pressed button, five line
icons, two round buttons over the score. Colours that have tokens are typed out again as hex, and
the dark theme is written out three times. After this work, a value comes from a short scale, a
part is written once, and a colour is written only in the tokens.

## What changes for the user

- Sizes, gaps and corners move by a pixel or two, as they snap to the scales below. Buttons' text
  grows from 15 px to 16 px.
- A pressed button looks the same everywhere: tinted in the selection blue, with a blue ring inside
  its edge. That replaces the white-with-a-blue-ring in the reader, the accent fill of the insert
  dialog's passes and of the trials panel's chips, and the thumbnails' blue border.
- Buttons that were pressed with no look of their own now show it: the library's "Show archived" toggle and the face channel's partner chip.
- The line icons are all drawn 2 px thick (the back arrow and the title's chevron were 2.4 px);
  grips stay 3 px.
- The blank page after a score's last screen ("Next", "End of the setlist") can be read: its text
  and border were near-white on the light stage.
- The library's toast follows the dark theme instead of staying light.
- The face-gestures dialog is as wide as the other dialogs (720 px, was 680 px); the dialogs that
  were 760 px wide are 900 px.

Nothing else changes: no behaviour, no stored data.

## The theme

There is one set of colour tokens, each written once with `light-dark()`:

```css
:root { color-scheme: light dark; --bg: light-dark(#f2f3f6, #121419); ... }
:root[data-theme="light"] { color-scheme: light; }
```

The reader sets `data-theme="light"` on `<html>` while it is open (`reader.ts:363`, as it does
now), so the reader, and every menu and dialog opened over it, uses the light values: the light
accent, the light selection blue, a white surface. Nothing in the styles says "in the reader, use
this colour"; the theme does it. Nothing sets `data-theme="dark"`, so its rule goes.

Vite's build lowers `light-dark()` for older browsers (through Lightning CSS) and carries the
`color-scheme: light` of the `data-theme` rule into that lowering, so forcing the light theme works
in older browsers too (checked with this repository's Vite). `npm run dev` serves the CSS as
written, so develop in a browser that has `light-dark()` (Chrome 123, Safari 17.5).

## Tokens

All tokens are on `:root` in `base.css`, between a `/* Tokens */` comment and an `/* End of the
tokens */` comment. No colour literal (`#…`, `rgb()`, `rgba()`, `hsl()`) appears outside them.

### Colours

| Token | Light | Dark | For |
| --- | --- | --- | --- |
| `--bg` | `#f2f3f6` | `#121419` | The page behind everything, and the reader's stage |
| `--surface` | `#ffffff` | `#1b1e25` | Dialogs, menus, fields, buttons |
| `--fg` | `#16181d` | `#e9eaee` | Text |
| `--muted` | `#5b6170` | `#9aa0ad` | Secondary text, grey marks (the cut editor's padding tab) |
| `--line` | `#dde0e7` | `#2c313b` | Borders and dividers |
| `--accent` | `#8a5a12` | `#d6a64a` | The brand and primary actions; cuts in the reader |
| `--accent-fg` | `#ffffff` | `#17130a` | Text on the accent |
| `--accent-soft` | accent at 14% | accent at 14% | Tints in the accent |
| `--select` | `#1f6fe0` | `#7da6ff` | What is selected or pressed |
| `--select-soft` | select at 14% | select at 14% | The tint of a pressed button |
| `--warn` | `#a8461c` | `#e58a5c` | Errors, warnings, destructive actions |
| `--warn-soft` | warn at 14% | warn at 14% | Tints in the warning colour |
| `--paused` | `#8b8f97` | `#8b8f97` | The face button paused; a channel switched off |
| `--bar` | `rgba(239, 240, 243, 0.97)` | `rgba(27, 30, 37, 0.97)` | Chrome that floats over content: the reader's toolbar, its menus, toasts, the score card, the recording screen's instruction |
| `--paper` | `#ffffff` | `#ffffff` | A score's page and its thumbnails, in both themes |
| `--scrim` | `rgba(10, 11, 14, 0.45)` | same | Behind a dialog |
| `--shade` | `rgba(40, 42, 48, 0.55)` | same | Over music left out (the excerpt picker's bands), the turn bands |
| `--hairline` | `rgba(0, 0, 0, 0.2)` | same | A thin ring round a colour so it reads on white (swatches, the ink bar, the loupe) |
| `--part-*` | as now | as now | The storage bar's parts |

The tints are `color-mix(in srgb, var(--x) 14%, transparent)` in both themes (the accent's was 12% light, 16% dark). Gone: `--stage` (now
`--bg`), `--bar-fg` (now `--fg`), `--bar-line` (now `--line`), `--bar-pressed` (the pressed look
replaces it), and the reader's own `--select`, `--tab-grey` and `--cut` (now `--select`, `--muted`
and `--accent`).

### Fonts

`--font-ui` and `--font-brand` as now, and `--font-mono: ui-monospace, "SF Mono", Menlo, Consolas,
monospace`.

### Scales

| Scale | Tokens | Snapping from today's values |
| --- | --- | --- |
| Space (gap, padding, margin) | `--space-1` 4 px, `--space-2` 8 px, `--space-3` 12 px, `--space-4` 16 px, `--space-5` 24 px, `--space-6` 32 px | To the nearest step, ties upward: 2 → 4, 6 → 8, 10 → 12, 14 → 16, 18 → 16, 20 → 24, 28 → 32 |
| Text | `--text-xs` 12 px, `--text-sm` 14 px, `--text-md` 16 px, `--text-lg` 18 px, `--text-xl` 22 px | 10, 11, 12 → xs; 13, 13.5, 14 → sm; 15, 16, 1rem, 1.05rem → md; 17, 18, 1.1rem, 1.15rem → lg; 20, 22, 24, 1.4rem → xl |
| Radius | `--radius-sm` 4 px, `--radius` 8 px, `--radius-lg` 12 px, `--radius-pill` 999 px | 1, 2, 3, 4 → sm; 6, 8, and 10 on buttons → md; 10 on menus and toasts, 12 → lg; any radius that is half the element's height → pill; circles stay `50%` |
| Control height | `--control` 44 px, `--control-sm` 32 px | 44 stays; 24 (not the title button), 28 (not the selection's buttons), 30, 32, 36 → sm |
| Shadow | `--shadow-paper` (`0 1px 4px` and a 1 px ring, both faint: a page on the stage, a thumbnail, the toolbar under its line, the switch's knob), `--shadow-float` (`0 4px 16px`: the loupe, the recording screen's instruction), `--shadow-popup` (`0 12px 40px`, menus and dialogs) | Each of today's shadows goes to the nearest of the three; 1 px rings (`0 0 0 1px`) are not shadows and stay, coloured from a token |
| Layer (z-index) | `--z-reader` 10, `--z-toast` 15, `--z-popup` 20, `--z-over-popup` 25, `--z-top` 30, `--z-capture` 40 | Reader 10; toast 15; menus and dialogs 20, and their catcher and scrim `calc(var(--z-popup) - 1)`; the fixed toast 25; the dialog on top 30 and its scrim one less, the symbol panel's drag ghost and drop line 30; the recording screen (60) 40 |

Row heights are 48 px (nested and compact rows) or 56 px (top-level rows): 52 → 48, 60 → 56.

**What the scales don't cover.** Drawing and alignment keep their own pixel values: the face
dialog's bar, meter and pennants, the cut tabs, the selection's box, handles and buttons, the
storage ring, the loupe, the thumbnails' and previews' sizes, an indent that lines up with a 44 px
button, and the safe-area minimums' arithmetic (`max(var(--space-4), env(...))` takes a token, but
a `calc` that places something stays as it is). Two text sizes stay as they are: the brand's
`2.4rem`, and the cut tab's pass label (10 px), which must fit "Pass 2" in a 40 px tab. The rule of
thumb: a value that spaces things out or sizes text, a corner or a control comes from a scale; a
value that draws something or lines it up with something else may be a literal.

z-indices inside the reader (the selection, the tools' and cuts' layers, the turn bands, the back
and face buttons, the loupe, the score card) are local to the reader's stacking context and stay
small literal numbers (1 to 12), listed in one comment in `reader.css`.

## The shared parts

These live in `base.css`. The other files use them and add only what is particular to their place
(a width, a position), never a second copy of what the shared part sets.

| Part | Selector | What it is |
| --- | --- | --- |
| Button | `button`, `.primary`, `.quiet`, `.danger` | As now, from tokens: `--control` high, `--radius`, `--text-md`. |
| Pressed | `button[aria-pressed="true"]:not(.float-button)` | `background: var(--select-soft); box-shadow: inset 0 0 0 2px var(--select)`. The one pressed look. The face button is left out: it is pressed while watching and shows that, and its other states, with its own rings. A part may change its background only where a colour must read true (the swatches keep `--surface` behind their dot). The selection's "This time only" pill keeps its filled look: it is drawn over the music at a fixed size, not chrome. |
| Field | `input.name`, `input.search`, `select` | A text field or a select: `--control` high, `--radius`, `--line` border, `--surface` background, padding `var(--space-2) var(--space-3)`. |
| Chip | `.chip` | A small rounded button: `--control-sm` high, `--radius-pill`, `--line` border, transparent, `--text-sm`, padding `0 var(--space-3)`. Pressed like any button. `.chip.mono` sets `--font-mono` and `--text-xs`. Used by the trials panel's chips, the face channel's partner, and Add scores' picked excerpts. |
| Pill | `.pill` | A label, not a button: small capitals in a thin rounded outline, in the accent (`.missing` in the warning colour). As now. |
| Small capitals | `.caps` | `--text-xs`, uppercase, `letter-spacing: 0.06em`, weight 600. Used by the library's section heads, the blank page's label, the score card's "2/3", and `.pill`. |
| Icon | `.icon` | A line icon: no fill, `currentColor` stroke 2 px, round ends and joins, `display: block`, 22 px square. Menus' icons are 20 px, the title's chevron 18 px; grips set `stroke-width: 3`. Replaces `.back-icon`, `.tool-icon`, `.row-icon`, `.chevron-icon` and the stroke settings of `.face-glyph`. |
| Floating button | `.float-button` | A 44 px round button over the score: `--surface` at 85%, `--fg`, a 1 px `--line` ring. The back arrow and the face button. |
| Divided list | the lists' own classes | One pattern for every list of rows: a top-level list has a `--line` border above and below it and one between rows (`> * + * { border-top }`); a nested list has only the lines between rows. Applies to `.list`, `.entries`, `.removed-list`, `.incoming-list`, `.picklist`, `.face-rows`, `.face-channels` and `.face-trials-table`. |
| Scrolling box | `--scroll-max` | `calc(var(--seen-height, 100vh) * 0.6)`: the most a list inside a dialog or menu grows before it scrolls. Replaces the `0.5`, `0.6`, `0.65` and `60vh` limits; `60vh` ignored the on-screen keyboard. The incoming file's thumbnail strip keeps its own smaller limit. |
| Dialog width | `--dialog-w` | `.dialog { width: min(var(--dialog-w, 720px), calc(100vw - 32px)) }`; `.dialog.wide` and `.dialog.glyph-picker` set `--dialog-w: 900px`. The four rules that sit in `base.css` only to come before `.keyboard .dialog` go. |

## Documentation

`STYLES.md`, at the top of the repository beside `STORAGE.md`, says how the styles are made: style
something new by reusing a shared part first, then the tokens, and only then by adding a token or a
part; what each token and part is for; what the scales don't cover. It does not repeat the colour
values, which live only in `base.css`. A change to the tokens or the shared parts changes it in the
same commit, as `STORAGE.md` is kept with what is stored.

`ARCHITECTURE.md` points to it: its paragraph on `styles/` says to read `STYLES.md` before writing
CSS (and loses its sentence about rules that sit in `base.css` to lose to `ui.css`), its line on the
reader's theme names the theme and not `--stage` and `--bar*`, and its recipes get one for styling
a new element. Each failure of the styles test names `STYLES.md`.

## Guarded by a test

`src/styles/styles.test.ts` reads the six style files and fails when:

- a colour literal (`#…`, `rgb(`, `rgba(`, `hsl(`) is outside `base.css`'s token block;
- a `font-size`, or a `font` shorthand, has a `px`, `rem` or `em` size, other than the two exempt
  above;
- a `border-radius` has a `px` value;
- a `gap`, `row-gap` or `column-gap` is anything but `0` or `var(--space-…)` (one or two of them);
- a `z-index` is a literal above 12.

## Decisions not discussed

- The pressed look is the selection blue (tint and inset ring), not the accent: the accent means
  the brand and primary actions, the blue means "chosen". The reader already used the blue.
- The tints are 14% in both themes, so each is written once.
- `--stage` merges into `--bg`; the two light values differed by 2 to 4 in each channel.
- The toolbar's text, line and pressed colours (`--bar-fg`, `--bar-line`, `--bar-pressed`) merge
  into `--fg`, `--line` and the pressed look.
- `--bar` gets a dark value, so toasts and the score card follow the theme outside the reader.
- Buttons' text is 16 px, as body text, not 15 px.
- Icons are 2 px; the back arrow and chevron lose their 2.4 px.
- Dialog widths are 720 px or 900 px only.
- The face video's background before the camera starts is `--line`, not black.
- The cut tab's pass label stays 10 px.
- `STYLES.md` is written now, describing the end state, and `ARCHITECTURE.md` points to it only
  once the work is done, so no session is sent to tokens that don't exist yet.
- A test guards colours, text sizes, radii, gaps and z-indices; padding and margin are not tested,
  because drawing and alignment use literal pixels there too often to tell apart by pattern.
