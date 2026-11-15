# Buttons that don't look like text: spec

Every button with words on it has a visible edge, so it can't be mistaken for text. How to get there
is in `button-edges-plan.md`; where the two disagree, this file wins. The tokens and shared parts
this builds on are in `STYLES.md`.

## The rule

- A button with words is a default button (bordered, on the surface), `primary`, `danger`, the new
  `warn` (below), or a `chip`. `small` changes its size, never its edge.
- `quiet` (no border, no background, muted) is only for icon buttons: `quiet icon-button`.
- **Tappable rows are not buttons in this sense** and keep looking like rows: the library's rows and
  folder heads, menu items, the title menu's titles, the face channel picker, the Drive folder list
  and the Play-from list of scores (`.row-button`). They read as tappable from their dividers,
  arrows and the hover tint.
- The reader's toolbar keeps its look: its buttons are icons, or words beside an icon or a chevron
  (Cuts, the title), on the toolbar's own background.

## What changes for the user

| Button | Where | Becomes |
| --- | --- | --- |
| Show archived / Hide archived | `library/_setlists-section.ts:48` | Default |
| Put back | `library/_removed.ts:45` | Default |
| Leave out | `library/_incoming.ts:107` | Default |
| Built-in | `library/_marking-colors.ts:20` | Default |
| Preview (a score; an excerpt) | `dialogs/add-scores.ts:139,156` | Default, small |
| Change… | `dialogs/_face-play-from.ts:112` | Default, small |
| The other answer in a text dialog | `ui/ask-text.ts:59` | Default |
| Cancel (renaming a gesture; naming a new one) | `face/dialog.ts:160,323` | Default, small |
| Reset (two) | `face/_details.ts:104,125` | Default, small |
| Delete… (a gesture; disabled channels) | `face/_details.ts:77,203` | `warn`: outlined in the warning colour. They were meant to be, but `warn` had no rule, so they showed as grey text |
| The Drive folder picker's crumbs | `library/_drive-folders.ts:34` | `chip` |
| The Drive folder list and Play-from's scores and "Empty staves" | `library/_drive-folders.ts:52`, `dialogs/_face-play-from.ts:151,152` | Still row buttons, but no longer `quiet`: their text is the normal colour, not muted |

## The new variant

`button.warn`, in `base.css` beside `.danger`: `background: transparent; border-color: var(--warn);
color: var(--warn)`. For an action that removes something but opens a confirmation first (the
"Delete…" with an ellipsis); `danger`, filled, stays the button that does it.

## Guarded by a test

`src/styles/styles.test.ts` also reads every `.ts` file in `src/` (but tests) and fails when a
string or template literal holding the class `quiet` doesn't also hold `icon-button`. Its message
ends "see STYLES.md", as the others do.

## Documentation

`STYLES.md`'s shared parts' table: the buttons' row says `quiet` is for icon buttons only and every
button with words has an edge, names `warn`, and says tappable rows are row buttons, not this. Step 1
of "Styling something new" names `warn` with the others, and drops `quiet` from its list for
buttons with words.

## Decisions not discussed

- The secondary buttons inside the face dialog's tight rows (Cancel, Reset) and Add scores' Preview
  are `small`, so the rows don't grow.
- The "Delete…" buttons get a new outlined `warn` variant rather than `danger`, so the button that
  only asks is lighter than the one that deletes.
- The Drive crumbs become chips: they are a path of places to go back to, side by side.
- The reader's toolbar is left as it is.
