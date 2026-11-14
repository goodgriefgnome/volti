# How Volti's styles are made

Read this before writing CSS. Volti's look comes from a small set of tokens and shared parts in
`src/styles/base.css`; a new rule uses them, and adds only what is particular to its place. A change
to the tokens or the shared parts changes this file in the same commit.

`base.css` is the source of truth for the values. This file says what each token and part is for,
and when to reach for which.

## Styling something new

In this order:

1. **Use a part that is already there.** A button is a `<button>`, with `primary`, `quiet` or
   `danger` when it is one of those; a toggle sets `aria-pressed`; a text field is `input.name`; a
   small rounded button is `.chip`; a line icon is an SVG with class `icon`. Most new elements need
   no CSS of their own beyond where they sit.
2. **Lay it out with the tokens.** Gaps, padding and margins from `--space-*`; text sizes from
   `--text-*`; corners from `--radius-*`; control heights from `--control` and `--control-sm`;
   colours from the colour tokens; shadows from `--shadow-*`; global layers from `--z-*`. Pick the
   step that is closest to what you want; don't write a pixel value between two steps.
3. **Only then add a token or a part**, in `base.css` and in this file, when something new is
   needed in two or more places. A one-off look is a sign to reuse something instead.

The rule goes in the style file of the directory whose modules make the element (`ui.css`,
`library.css`, `dialogs.css`, `reader.css`, `face.css`); what two or more directories share goes in
`base.css`. `ARCHITECTURE.md` says more about where things go.

## The theme

Every colour token is written once, with `light-dark(light, dark)`, and follows the user's system
theme. The reader is always light: it sets `data-theme="light"` on `<html>` while it is open, and
that makes every token take its light value, in the reader and in every menu and dialog opened over
it. So never pick a colour by where something is shown ("in the reader, use…"): use the token, and
the theme does the rest.

## Colours

No colour is written outside the token block at the top of `base.css`: no hex, no `rgb()`, no
`hsl()`. The test in `src/styles/styles.test.ts` fails on one.

| Token | For |
| --- | --- |
| `--bg` | The page behind everything, and the reader's stage |
| `--surface` | Dialogs, menus, fields, buttons |
| `--fg` | Text |
| `--muted` | Secondary text and grey marks |
| `--line` | Borders and dividers |
| `--accent`, `--accent-fg`, `--accent-soft` | The brand and primary actions, text on them, a tint of them; cuts in the reader |
| `--select`, `--select-soft` | What is selected or pressed, and its tint |
| `--warn`, `--warn-soft` | Errors, warnings, destructive actions, and their tint |
| `--paused` | Something switched off or paused |
| `--bar` | Chrome that floats over content: the reader's toolbar and menus, toasts, the score card |
| `--paper` | A score's page and its thumbnails: white in both themes |
| `--scrim` | Behind a dialog |
| `--shade` | Over music that is left out |
| `--hairline` | A thin ring round a colour so it reads on white |
| `--part-*` | The storage bar's parts |

Accent and select mean different things: the accent is the brand and the action to take, the blue
is what has been chosen. A pressed button is blue, a primary button is the accent.

Fonts are `--font-ui` (everything), `--font-brand` (the name, titles in the reader) and `--font-mono`
(channel names and chips that show one).

## Scales

| Scale | Tokens | For |
| --- | --- | --- |
| Space | `--space-1` … `--space-6` (4, 8, 12, 16, 24, 32 px) | `gap`, `padding` and `margin` that space things out |
| Text | `--text-xs`, `-sm`, `-md`, `-lg`, `-xl` (12, 14, 16, 18, 22 px) | Every text size; body and buttons are `md`, secondary text `sm`, small capitals and table heads `xs` |
| Radius | `--radius-sm`, `--radius`, `--radius-lg`, `--radius-pill` (4, 8, 12 px, round ends) | Small marks; controls and cards; menus, dialogs and toasts; anything with round ends. A circle is `50%` |
| Control | `--control` (44 px), `--control-sm` (32 px) | The height of a button or field, and the width of a square icon button. 44 px is the smallest a finger reliably hits; use `--control-sm` only beside a larger target or for chips |
| Shadow | `--shadow-paper`, `--shadow-float`, `--shadow-popup` | A page or thumbnail on its background; something floating over content; menus and dialogs |
| Layer | `--z-reader`, `--z-toast`, `--z-popup`, `--z-over-popup`, `--z-top`, `--z-capture` | Stacking across the whole app, lowest first. Inside the reader, layers are small local numbers, listed in a comment in `reader.css` |

Rows are 48 px high when nested or compact and 56 px at the top level. A list inside a dialog or menu
grows to `--scroll-max` and then scrolls.

**What the scales don't cover.** Drawing and alignment keep their own pixel values: the marks over
the music (the selection, the cut tabs, the loupe), the face dialog's bars and meters, the sizes of
thumbnails and previews, an indent that lines up with a 44 px button. A value that spaces things out
or sizes text, a corner or a control comes from a scale; a value that draws something, or lines it
up with something else, may be a literal.

## Shared parts

All in `base.css`, except the dialog width's default, which `ui.css` keeps with the dialog. Use them, and
don't restate what they set.

| Part | Use it for |
| --- | --- |
| `button`, `.primary`, `.quiet`, `.danger` | Every button. `primary` for the one action a dialog is for, `quiet` for secondary actions in a row, `danger` for one that removes something |
| `button[aria-pressed="true"]` | Every toggle: set `aria-pressed` and it gets the pressed look (blue tint, blue ring inside its edge). Don't add a class for "on" |
| `input.name`, `input.search`, `select` | Text fields and selects |
| `.chip` (`.mono`) | A small rounded button: a filter, a removable choice, a toggle in a row of them |
| `.pill` | A label in a thin rounded outline, not a button (`.missing` for a warning) |
| `.caps` | Small capitals: section heads, labels over a value |
| `.icon` | A line icon (an SVG drawn with strokes); size it by where it sits |
| `.float-button` | A round button over the score |
| `--dialog-w` | A dialog's width (`.dialog` in `ui.css` reads it, default 720 px): set it on the dialog's class only when that is too narrow; `.wide` is 900 px |
| Divided lists | A list of rows has a line above and below it and one between rows; a list nested in a row has only the lines between rows |

Dialogs, menus and toasts are made by `ui/` (`showDialog` in `ui/overlay.ts`, `ask-text.ts`,
`Toast`), and come styled; fill them with `el`, `button` and `buttonRow` from `ui/dom.ts` and
`ui/overlay.ts`.

## Checking

`npm test` runs `src/styles/styles.test.ts`, which fails on a colour outside the tokens, a text size,
radius or gap that isn't from its scale, or a global z-index that isn't a layer token. Look at the
change in the app in both themes (switch the system's theme), and on a phone width.
