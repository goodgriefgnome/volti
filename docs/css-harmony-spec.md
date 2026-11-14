# The styles' leftovers: spec

The second pass over `src/styles/`, after `css-system-spec.md`: the slips that pass left, the
patterns still written several times over, and the values that still have no token. What it builds
on (the tokens, the scales, the shared parts) is in `STYLES.md`. How to get there is in
`css-harmony-plan.md`; where the two disagree, this file wins.

## What changes for the user

- A thing that floats over the screen sits 12 px from its edge: the back arrow (was 6 px), the face
  button, the toast and the score card (were 16 px), the scope note while editing cuts in a setlist
  (was 8 px), the recording screen's instruction. Dialogs, menus and notes keep 12 px clear of each
  side of the screen (dialogs and notes were 16 px, menus 8 px).
- A row being dragged to a new place (a setlist's entry in the library, an entry in the title menu,
  a group in the Symbols panel) is dimmed. The library's entry was tinted in the accent.
- Hovering over, or pressing, a row or a menu item shows one faint grey tint. Menus in the reader
  showed the selection blue, as for a pressed button; library rows showed the line colour.
- The keyboard's focus ring is the same 3 px accent ring everywhere: the Excerpt picker's bands and
  the cut tabs had a blue one, the strength meter's handle a 2 px one.
- The ⋯ buttons, the expanders' arrows, the setlist entry's grip, and the face dialog's back arrow
  and row arrow are drawn icons, as in the reader's toolbar, instead of characters or CSS borders.
  The library's ⋯ button looks like the reader's.
- Symbols are 56 px tiles everywhere; the Symbols panel's were 52 px.
- The toast, the score card and the scope note share one shape: rounded 12 px corners (the score
  card and the scope note were round-ended). The toast wraps a long message, as now; the other two
  cut it short.
- A disabled button, and anything switched off or not applicable, is dimmed to 50% (disabled
  buttons were 40%).
- The secondary text in the reader's title (the "2/3" of a setlist, the page info) and the score
  card's "2 OF 3" are in the muted colour instead of see-through.
- The toolbar shows and hides, the expanders open and the arrows turn in 200 ms; the score card
  fades in 300 ms.
- Add scores' chips and named excerpts line up with the titles above them again (they are 4 px too
  far in), and a gesture's head in the face dialog sits flush with the dialog's top again (2 px off).

Nothing else changes: no behaviour, no stored data.

## Tokens added

In `base.css`'s token block, with the others:

| Token | Value | For |
| --- | --- | --- |
| `--edge` | 12 px | How far anything floating keeps from the screen's edge (with `max(var(--edge), env(safe-area-inset-…))`), and how far dialogs, menus and notes keep from each side (`calc(100vw - 2 * var(--edge))`) |
| `--hover` | `color-mix(in srgb, var(--fg) 6%, transparent)` | A row, menu item or bare button under the pointer or being pressed |
| `--focus` | `3px solid var(--accent)` | The keyboard's focus ring: `outline: var(--focus)` |
| `--tile` | 56 px | A symbol's tile: the Symbols panel, the glyph picker, the library editor |
| `--check` | 20 px | A checkbox's size; indents that line up with the text beside a checkbox are `calc(var(--check) + var(--space-2))` |
| `--dim` | 0.5 | The opacity of something disabled, switched off, or not applicable; and of a symbol whose copy is being dragged |
| `--dragged` | 0.6 | The opacity of a row being dragged to a new place |
| `--quick`, `--slow` | 200 ms, 300 ms | Transitions: showing, hiding, opening and turning are quick; fading the score card out is slow |
| `--surface-float` | `color-mix(in srgb, var(--surface) 85%, transparent)` | The floating buttons' background |
| `--hatch` | `repeating-linear-gradient(135deg, var(--muted) 0 1.5px, transparent 1.5px 5px)` | Hatching: the face dialog's rest band and its trials' left-out frames |

No `color-mix()` is written outside the token block any more: the two warning tints written out at
12% (`face.css:97`, `:173`) are `--warn-soft`, and the floating buttons take `--surface-float`.

Secondary text is never made see-through to look secondary: it takes `--muted`. Opacity is for
dimming (`--dim`, `--dragged`) and for drawing (below).

## Shared parts added

In `base.css`, after the parts that are there:

| Part | Selector | What it is |
| --- | --- | --- |
| Icon button | `.icon-button` | A square button showing an icon or a single character: `--control` wide and high, no padding, its content centred. With `quiet` it has no border or background. `.icon-button.small` is `--control-sm`. |
| Row button | `.row-button` | A button that is a whole row, or the text of one: no border, no corners, no background, text at the start. `--hover` under the pointer (only where the device can hover) and while pressed. |
| Small button | `button.small` | A button with text, beside others in a tight row: `--control-sm` high, padding `0 var(--space-3)`, `--text-sm`. |
| Note | `.note` | A short message floating over the screen: centred across it, `--bar` background, `--fg`, `--radius-lg`, padding `var(--space-2) var(--space-4)`, as wide as `calc(100vw - 2 * var(--edge))` at most, taps passing through. The toast, the score card, the scope note. Where it sits (top or bottom, `--edge` from it) is each one's own; the score card and the scope note also stay on one line, cut short. |
| Dragged row | `.reordering` | `opacity: var(--dragged)`, for every row `dragToReorder` (`ui/drag-reorder.ts`) drags; the helper sets this class instead of `dragging`, which the cut tabs and the Symbols panel's symbols keep for their own, different drags. The one rule for it, in `base.css`; no list styles its own. |
| Focus | `:focus-visible` | `outline: var(--focus); outline-offset: 2px` on every element. Where the ring must sit inside (the Excerpt picker's bands) or on a drawn part (a cut tab's `::after`), the rule moves it, but its look stays `var(--focus)`. |

Uses:

- **Icon buttons:** the ⋯ buttons (library and reader), the expanders (`.expand`), the setlist ring
  (`.ring`), the title menu's grip, swap, bin and +, a setlist entry's grip (was 36 px wide), the
  swatches and shapes, the face name's pencil (small), the face dialog's back arrow.
- **Row buttons:** the library's rows (`.list button.open`), the folder headings (`.folder-head`),
  menu items (`.menu button`), the face channel picker's rows (`.pk`), the play-from list, the Drive
  folders, the title menu's titles (`.go`).
- **Small buttons:** the face name's buttons, the face sections' Reset, the toast's Undo.
- **Notes:** `.toast`, `.score-card`, `.scope`. The recording screen's instruction is not a note (it
  is a panel with two columns); its class `.bar`, which also picked up the reader toolbar's rules,
  becomes `.face-recording-bar`.

## Icons

Every icon is drawn by `icon(d, cls?)` in `src/ui/dom.ts`, from a path in a 24 × 24 box; there is
no other icon builder (`_faces.ts`'s copy, `backIcon` and `chevronIcon` in `_toolbar.ts` go). The
paths used in more than one place are exported from `ui/dom.ts` beside `GRIP`: `BACK`, `CHEVRON`
(pointing right; `.icon.chevron.down` turns it to point down, and an expander turns it down while
open) and `DOTS`. No icon is a character: the library's ⋯ (`library/_rows.ts:56`), a setlist
entry's ⋮⋮ (`library/_setlists-section.ts:140`), the face dialog's ‹ (`face/_details.ts:70`) and
› (`face/dialog.ts:295`), and the `.chev` drawn with borders (`base.css:95`) all become icons. The
+ in the title menu, and the › between the Drive folder picker's crumbs (a separator in text), stay
characters.

## Values that follow from another

A negative margin or offset that cancels a dialog's or the library's padding or gap is worked out
from it, so it cannot drift again:

- `.dialog` sets `--pad: var(--space-4)` and `--gap: var(--space-3)` and uses them for its padding
  and gap. `.dialog .buttons` (`ui.css:37`) and the face dialog's sticky head (`face.css:91`) take
  `calc(-1 * var(--pad))` and `calc(-1 * var(--gap))`.
- `.library` sets `--gap: var(--space-5)`; a section head's `margin-bottom` is
  `calc(var(--space-2) - var(--gap))`, so it sits `--space-2` above its list (was 10 px).
- Add scores' picked chips and named excerpts are indented `calc(var(--check) + var(--space-2))`
  (`dialogs.css:25`, `:35`), the checkbox and its gap.

## What stays literal

Drawing keeps its own numbers, opacities among them: the face dialog's bar, meter, rings and
hatching's opacity, the cut tabs, the selection, the loupe, the turn bands, the drag ghost, and the
face button's animations (which are not transitions). Content widths (a menu's 220 px, a column's
200 px) are not spacing and stay as they are. `STYLES.md`'s rule of thumb holds.

## Guarded by the test

`src/styles/styles.test.ts` also fails when:

- `color-mix(` appears outside `base.css`'s token block;
- a `transition` or `transition-duration` has a duration that isn't `var(--quick)` or
  `var(--slow)`;
- `outline` is set to anything but `var(--focus)`, `none` or `0`.

Each message names `STYLES.md`, as the others do.

## Documentation

`STYLES.md` gains the new tokens in its tables, the new parts in its shared parts' table, a line
under the scales that secondary text is muted and never see-through, and a short section on icons
(`icon()` and its paths in `ui/dom.ts`; no characters as icons). `ARCHITECTURE.md`'s line on
`ui/dom.ts`, if it names its helpers, names `icon` and the paths.

## Decisions not discussed

- The 12 px edge also sets how far dialogs, menus and notes keep from the screen's sides, so every
  "keep clear of the edge" is one value (dialogs were 16 px, menus 8 px).
- Disabled and switched-off share one dimming, 50%; disabled was 40%.
- A symbol whose copy is being dragged dims to `--dim` (was 35%), not `--dragged`: it is the place
  the symbol is leaving, not a row on the move.
- Notes have 12 px corners, so a toast that wraps stays tidy; the score card and scope note lose
  their round ends.
- Hover only applies where the device can hover (`@media (hover: hover)`), so a tap on a tablet
  doesn't leave a row tinted; pressing shows the tint everywhere.
- The secondary text in the reader's title and score card is muted instead of see-through.
- The two hatchings become one, with 1.5 px stripes (they were 2 px and 1 px).
- Transitions are 200 ms or 300 ms: the toolbar was 160 ms, the chevrons 200 ms, a setlist opening
  220 ms.
- The + in the title menu and the › in the Drive crumbs stay characters.
