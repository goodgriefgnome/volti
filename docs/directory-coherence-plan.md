# Directory coherence: plan

How to get to what `docs/directory-coherence-spec.md` describes: each directory of `src/` holding
one idea, with its modules named for it, and `docs/` and `public/` holding only what is current.
Read the spec first, then `ARCHITECTURE.md`; where the spec and this plan disagree, the spec wins.
Each stage is one commit, or a few, and every commit leaves `npm test` and `npm run build`
passing and `ARCHITECTURE.md` true of the tree as it then is. No stage changes what the app does:
each is files moved or renamed, their importers followed, and prose that names them updated.

Use `git mv` for every move and rename, so the history follows the file. After each move, search
the whole repository (not only `src/`) for the old path and the old name: `ARCHITECTURE.md`,
`STORAGE.md`, `README.md`, `TODO.md`, `TODO.manual.md`, `docs/*-spec.md` and comments in `src/`
all name files. A header comment that names a moved file names its new place.

## Stage 1: `originals/` in subdirectories

1. Make `src/originals/drive/`, `src/originals/handles/` and `src/originals/read/`, and `git mv`
   each module and its test to the path the spec's table gives. Inside `drive/` the `drive-`
   prefix goes (`_drive-api.ts` → `drive/_api.ts`); inside `handles/` the handle words go
   (`_directory-handle-roots.ts` → `handles/_roots.ts`, `_fake-handles.ts` → `handles/_fake.ts`);
   inside `read/` the `-source` suffix goes (`_pdf-source.ts` → `read/_pdf.ts`).
2. Fix every import. Within `originals/`, a module in a subdirectory reaches the top level with
   `'../types'` and a sibling with `'./_api'`; a top-level module reaches a subdirectory with
   `'./drive/score-fs'`. Outside `originals/`, the importers are the ones `grep -rn
   "originals/" src` lists: `library/`, `reader/`, `dialogs/`, `export/`, `main.ts`,
   `stored-data.ts` and `sw.ts`. Imports of `'../originals/original'` become
   `'../originals/read/original'`, of `'../originals/drive-score-fs'` become
   `'../originals/drive/score-fs'`, and so on.
3. `src/originals/order.test.ts`: `ORDER` lists each file by its path relative to `originals/`
   (`'handles/_fake'`, `'path-utils'`, `'drive/_config'`, …) in the same order as today; the glob
   becomes `['./**/*.ts', '!./**/*.test.ts']`; `valueImports` resolves `./` and `../` specifiers
   against the importing file's directory (as `resolve` in `src/layers.test.ts` does) so that
   `drive/_root` importing `'../_folder-scan'` is seen as importing `_folder-scan`. The test's
   header comment and the "lists every file" check keep their meaning.
4. `ARCHITECTURE.md`: the `originals/` row of the layer table becomes one short paragraph for the
   top level and one for each subdirectory, naming the files in the order `ORDER` has them.
   `STORAGE.md` lines 60, 61, 197, 386 and 389 and `TODO.md` lines 25 and 124 name moved files.
5. Test: `npm test` (the layer test, the order test and every moved test), `npm run build`.

## Stage 2: the tools' interface into `reader/tools/`, and `symbol-library`

1. `git mv` the seven modules the spec's `reader/` table lists, with their tests
   (`_symbols.test.ts` → `tools/_symbol-library.test.ts`, and so on). Fix imports: inside
   `tools/`, what was `'../_symbol-panel'` is `'./_symbol-panel'`; the moved modules reach the
   root with `'../_gestures'` and `'../_view'`, and the rest of the app with `'../../markings/…'`.
   Nothing outside `reader/` imports any of them (check with `grep -rn "_glyph-picker\|
   _library-editor\|_symbol-panel\|_symbol-picture\|_symbols'\|_swatches\|_tool-panels" src`).
2. `git mv src/markings/library.ts src/markings/symbol-library.ts` and its test; fix the imports in
   `markings/store.ts`, `reader/tools/` and `markings/symbol-library.test.ts`. The header comment
   says "The symbol library's types …" as it does today.
3. `ARCHITECTURE.md`: in "The two screens", the sentences naming `reader/_symbol-panel.ts`,
   `reader/_swatches.ts`, `reader/_tool-panels.ts`, `reader/_loupe.ts`'s neighbours and
   `markings/library.ts` name the new paths; the `reader/` row of the layer table says the tools'
   panels and the symbol library's editor are in `tools/`. `TODO.md` line 168 and
   `TODO.manual.md` may name moved files: check.
4. Test: `npm test`, `npm run build`.

## Stage 3: `offline/`

1. `mkdir src/offline`; `git mv src/library/_offline-pages.ts src/offline/pages.ts`,
   `git mv src/library/_offline-status.ts src/offline/status.ts`,
   `git mv src/library/_offline-status.test.ts src/offline/status.test.ts`. Fix the imports inside
   both (`'./status'`, `'../originals/…'`) and in `library/library.ts`, `library/_host.ts` and
   `library/_setlists-section.ts` (`'../offline/pages'`, `'../offline/status'`).
2. `src/layers.test.ts`: add `offline: 5` to `LAYERS` (beside `export: 5`).
3. Both headers: `pages.ts` says it is the job that keeps the pages setlists play offline, started
   by the library; `status.ts` as today, naming `pages.ts` and `library/_setlists-section.ts`.
4. `ARCHITECTURE.md`: a row `5 | offline/` in the layer table ("Keeping the pages setlists play
   offline, and how much of each is saved"); the `library/` row drops `_offline-pages` and
   `_offline-status`; the "page cache" entry in Words still holds. `TODO.md` line 44 names
   `library/_offline-pages.ts`.
5. Test: `npm test`, `npm run build`.

## Stage 4: the Face gestures dialog into `face/`

1. `git mv src/dialogs/face-gestures.ts src/face/dialog.ts`,
   `git mv src/dialogs/_face-recording.ts src/face/_round.ts`,
   `git mv src/dialogs/_face-details.ts src/face/_details.ts`. Their imports of `'../face/x'`
   become `'./x'`; `'../ui/…'` stays. `library/_folder-banner.ts:11` and `reader/reader.ts:29`
   import `openFaceGestures` from `'../face/dialog'`.
2. Make internal the five modules nothing outside `face/` imports any more:
   `git mv` `model.ts` → `_model.ts`, `recording.ts` → `_recording.ts`, `settling.ts` →
   `_settling.ts`, `template.ts` → `_template.ts`, `tones.ts` → `_tones.ts`, each with its test.
   Fix the imports inside `face/`. Confirm with `grep -rn "face/\(model\|recording\|settling\|
   template\|tones\)'" src` that nothing outside imports them; `npm test`'s underscore rule
   checks it too.
3. Headers: `dialog.ts` says it is the Face gestures dialog, opened from the library's ⋯ menu and
   the reader's face button; `_round.ts` and `_details.ts` as today, naming `_recording.ts` where
   they named `face/recording.ts`.
4. `ARCHITECTURE.md`: the `face/` row of the layer table adds the dialog; the `dialogs/` row drops
   it; the rule under "Other rules" about dialogs gains the sentence the spec gives; the
   "The two screens" paragraph on page turns names `face/dialog.ts` in place of
   `dialogs/face-gestures.ts`. `docs/face-gestures-spec.md` and `docs/face-classifier-spec.md`
   may name the moved files: check. `TODO.manual.md` too.
5. Test: `npm test`, `npm run build`.

## Stage 5: `dialogs/` headers

1. `src/dialogs/open-score.ts`: the header says opening a score for a dialog that shows its pages
   without the reader, used by the library and by the reader's title menu; the import of
   `askPassword` is from `'./passwords'`.
2. Test: `npm test`, `npm run build`. One commit.

## Stage 6: `styles/` by directory

1. For every rule in `cuts.css`, `overlay.css`, `setlists.css`, `library.css`, `reader.css` and
   `face.css`, find the module that makes the element (`grep -rn "'thumb-frame'" src` and the
   like; a class made in two directories goes to `base.css`). Move each rule, unchanged, to the
   file the spec's table gives for that directory: `ui.css` (new, from `overlay.css` plus the
   rules for toasts, `ask-text` and `drag-reorder` wherever they are now), `library.css`,
   `dialogs.css` (new), `reader.css` (which takes all of `cuts.css`), `face.css`, `base.css`.
   Keep each file's comment at the top saying what it styles, and keep the rules' own comments.
2. `src/main.ts` imports, in this order: `base.css`, `ui.css`, `library.css`, `dialogs.css`,
   `reader.css`, `face.css`. Delete `cuts.css`, `overlay.css` and `setlists.css` with `git rm`.
3. Check nothing was lost or reordered: before the change, write the old files concatenated in the
   old import order to a scratch file; after, the new files in the new order to another; the two
   must have the same set of rules (`grep -c '{'` agrees, and a diff of the sorted selectors is
   empty). Then list every selector that appears in more than one new file (`grep -h '^[^ /]'
   src/styles/*.css | sort | uniq -d`); for each, the rule that was later in the old order must be
   later in the new, else move the earlier one to `base.css` ahead of both.
4. `ARCHITECTURE.md`: the line "`styles/` holds the CSS, one file per part of the app" becomes one
   file per directory of `src/`, named for it. `TODO.md` line 168 names `styles/reader.css`,
   which stays.
5. Test: `npm run build`; then open the app (`npm run dev`) and look at the library, a score, the
   cut editor, a menu, a dialog, a toast and the face button: each as before.

## Stage 7: `public/lab/`

1. `mkdir public/lab`; `git mv` `face-classifier.html`, `face-classifier.webmanifest`,
   `face-signals.html` and `face-signals.webmanifest` into it. In both manifests, the icon `src`
   becomes `../icons/icon-192.png`. The pages' `<link rel="manifest">` stays (relative). Check
   each page for other absolute or `../`-less references to `icons/`, `mediapipe/` or `fonts/`
   and give each the `../` it needs.
2. `src/sw.ts:31`: the denylist is `[/\/licenses\.txt/, /\/lab\//]`, and the comment above it says
   `lab/` holds test pages that aren't the app.
3. `src/face/_model.ts` and `src/face/_template.ts` headers cite `public/lab/face-classifier.html`.
4. `ARCHITECTURE.md`: one line after the layer table saying `public/lab/` holds prototype pages
   that are not the app and that the service worker leaves alone.
5. Test: `npm run build`; `npm run preview` and open `/volti/lab/face-signals.html`: it loads its
   script and the camera prompt appears (no camera needed to see it load).

## Stage 8: `docs/` holds only what is current

1. For each of `face-gestures-plan.md`, `face-gestures-levels-plan.md`,
   `face-gestures-defined-plan.md` and `reader-split-plan.md`: read its last stage, and confirm in
   `git log --oneline` and in the code that it was done. Skim it for a decision its spec
   (`face-gestures-spec.md`, `face-classifier-spec.md`, `reader-split-spec.md`) does not record
   (a stored format, a limit, a rule about the UI); move each such sentence into the spec's right
   section, in the spec's voice. Then `git rm` the plan. A plan with a stage not done stays;
   say so in the commit message and in the reply.
2. Read `ARCHITECTURE.md` against `docs/directory-coherence-spec.md`: everything the spec says
   about the tree must be in `ARCHITECTURE.md` by now (the layer table, the subdirectories of
   `originals/` and `reader/`, `offline/`, the dialog rule, the styles rule, `public/lab/`). Add
   what is missing, then `git rm` `docs/directory-coherence-spec.md` and this plan.
3. Test: `npm test`, `npm run build`.

## Manual checks, in the app, after the last stage

On a tablet, or in Chrome with a touch emulation:

- The library opens, with the scores folder's banner and the ⋯ menu; **Face gestures…** opens the
  dialog, and so does the face button in the reader with the toolbar hidden.
- Open a score; draw with the pen; place a symbol; long-press the Symbols button and open the
  library editor and the glyph picker; place text and type.
- Cuts: open the cut editor, drag a tab, open its menu, insert pages.
- A setlist: add scores through **Add scores**, choose an excerpt in the picker, open the setlist
  and turn through it; the library's setlist row shows how much is saved for offline, as before.
- Link a folder (device and, where a client is configured, Google Drive), rename a score, move it
  to a subfolder, remove it, and put it back from **Recently removed**.
- Export a PDF.
- Every menu, dialog and toast looks as it did: no rule was lost in the styles move.
