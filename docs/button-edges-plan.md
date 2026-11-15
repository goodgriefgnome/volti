# Buttons that don't look like text: plan

How to get to what `button-edges-spec.md` describes. Read the spec first; where the two disagree,
the spec wins. Each stage is one commit, and every commit leaves `npm test` and `npm run build`
passing. Before each push, try the stage in the running app (`npm run dev`) with the checks it
lists, in both themes. Commit and push each stage before starting the next. Line numbers are as the
files are before stage 1; find each line by the text quoted if they have drifted.

## Stage 1: the `warn` variant and the buttons

1. In `src/styles/base.css`, after `button.danger`, add
   `button.warn { background: transparent; border-color: var(--warn); color: var(--warn); }`, with a
   one-line comment: an action that removes something after asking.
2. In code, change each button's class as the spec's table says. Remove `quiet`; add `small` where
   the table says; keep any other class:
   - `src/library/_setlists-section.ts:48` `'quiet'` → `''` (or drop the argument).
   - `src/library/_removed.ts:45`, `src/library/_incoming.ts:107`, `src/library/_marking-colors.ts:20`,
     `src/ui/ask-text.ts:59`: `'quiet'` → `''`.
   - `src/dialogs/add-scores.ts:139,156`, `src/dialogs/_face-play-from.ts:112`: `'quiet'` → `'small'`.
   - `src/face/dialog.ts:160,323`: `'quiet small'` → `'small'`.
   - `src/face/_details.ts:104,125`: `'quiet small'` → `'small'`.
   - `src/face/_details.ts:77,203`: `'quiet warn'` → `'warn'`.
   - `src/library/_drive-folders.ts:34`: `'quiet row-button'` → `'chip'`.
   - `src/library/_drive-folders.ts:52`, `src/dialogs/_face-play-from.ts:151,152`:
     `'quiet row-button'` → `'row-button'`.
3. Look for CSS that set these buttons' look by place and now fights the default (grep the class
   names around each button: `.face-named button`, `.face-sec-head`, `.drive-crumbs`,
   `.removed-row`, `.incoming-fields`, `.marking-colors-row`, `.pick-row`, `.face-play-text`): remove
   what repeats or undoes the shared button, keep layout.

**Checks in the app.** Library: Show archived (with an archived setlist), Recently removed's Put
back, importing a file's Leave out, Marking colours' Built-in: each is a bordered button, and Show
archived still turns blue while pressed. Add scores: Preview on a score and on an excerpt is a small
bordered button, and the rows don't grow taller. Face dialog: rename a gesture (OK, Cancel), Reset
in a gesture's details, Delete… (outlined red; its confirmation's Delete is filled red). A text
dialog with a second answer (renaming something that has a suggested name). The Drive folder picker
(if you can sign in): crumbs are chips, folders are rows in the normal text colour. Play from: the
list of scores is rows in the normal text colour, Change… is a small bordered button.

## Stage 2: the test and the documentation

1. In `src/styles/styles.test.ts`, add
   `it('keeps quiet for icon buttons')`: read every `.ts` file under `src/` except `*.test.ts`
   (`readdirSync(new URL('..', import.meta.url), { recursive: true })`), find every `'…'`, `"…"` and
   `` `…` `` literal whose words include `quiet` (`/\bquiet\b/`), and fail on any that doesn't also
   include `icon-button`. The message names the file and the literal, and ends "a button with words
   has an edge: see STYLES.md". Check that the test fails if you put `'quiet'` back on one button,
   then take it off again.
2. `STYLES.md`, as the spec's "Documentation" says.

**Checks.** `npm test` passes; grep `src/` for `quiet`: only icon buttons, and comments.
