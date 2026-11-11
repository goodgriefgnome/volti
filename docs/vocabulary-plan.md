# One spelling per concept: plan

How to get to what `docs/vocabulary-spec.md` describes: each concept spelled one way in the code,
the CSS, the docs and on screen. Read the spec first, then the Words table in `ARCHITECTURE.md`;
where the spec and this plan disagree, the spec wins. Each stage is one commit, or a few, and
every commit leaves `npm test` and `npm run build` passing and `ARCHITECTURE.md` true of the code
as it then is. Nothing the app does changes, except the two labels and one title the spec names.

Ways of working, for every stage:

- `git mv` for every file rename, so history follows the file.
- A rename is whole-word and case-aware: `markColors` and `MarkColors` are two renames, `.mark`
  in CSS and `'mark'` in an `el()` call are the same class and change together. Use
  `grep -rnw` (and `-i` to find the other cases) over the whole repository, not only `src/`:
  `ARCHITECTURE.md`, `STORAGE.md`, `README.md`, `TODO.md`, `TODO.manual.md` and `docs/*.md` all
  name these things. After each rename, search again for the old spelling and read every hit:
  some are other concepts that stay (the spec says which).
- A header comment that names a renamed file names its new name.
- Stage 1 adds the vocabulary test with the retired spellings of every stage listed, so from
  then on it fails until each stage is done: skip the entries of later stages with `it.todo`
  or a per-entry `stage` field that the test compares to a `DONE` constant raised by each stage.

## Stage 1: the test, and the rules in `ARCHITECTURE.md`

1. `src/vocabulary.test.ts`: a list of `{ goes: RegExp, wins: string, stage: number }`, one per
   row of the spec's table (whole-word, case-insensitive where the spec retires both cases), with
   an `ALLOWED` set of exact tokens that stay (`getDirectory`, `FileSystemDirectoryHandle`,
   `trashed`, `Paint`, `details`, `cut-mark`, `ColorChoice`, …). It reads `src/**/*.ts` and
   `src/styles/*.css` (tests and `.d.ts` excluded) with `import.meta.glob` as `layers.test.ts`
   does, and for every entry whose `stage <= DONE` expects no file to match `goes`. Start with
   `DONE = 1`. Its header says what belongs in it: the spellings the spec retired, so none comes
   back.
2. `ARCHITECTURE.md`: add the rules the spec lists (dialect, delete/remove, status/state, tools
   named as in the code, API names kept), the new Words rows, and the changed **screen** and
   **slot** rows, naming the files as they will be after the later stages. Say `src/vocabulary.test.ts`
   keeps the spellings.
3. `npm test`, `npm run build`.

## Stage 2: the reader and drawing

1. `git mv src/reader/_spread.ts src/reader/_slots.ts` (and its test, if one exists); header:
   "The frames on the reader's screen as elements: `FrameSlot`, placing the slots where
   `render/screen.ts` says, and drawing them." `spreadEl` → `screenEl`; every "spread" in
   comments in `reader/`, `render/zoom.ts` and `scores/placing.ts:104` (where it is the English
   verb and stays). CSS `.spread` → `.screen` in `reader.css`, and the `el('div', 'spread')` at
   `reader/reader.ts:128`.
2. `git mv src/render/paint.ts src/render/draw.ts` (and `paint.test.ts` if there is one). Fix its
   importers (`export/pdf.ts`, `reader/_loupe.ts`, `reader/reader.ts`, `dialogs/thumb-strip.ts`,
   `scores/frames.ts:3` comment). `paintSlot` → `drawSlot`, `paintSlotInk` → `drawSlotInk`;
   every `paint`, `paintInk`, `paintState`, `repaint` identifier in `reader/` → `draw`,
   `drawInk`, `drawState`, `redraw`; "painted"/"painting" in comments → drawn/drawing.
   `Paint` in `markings/draw.ts` and `export/_annotations.ts` stays.
3. `RenderedPdf` → `MusicPdf` in `originals/types.ts:89` and its importers (`originals/_types.ts`,
   `read/original.ts`, `read/_image.ts`, `read/_pdf.ts`, `export/pdf.ts`); the Words table's
   **original** row names it.
4. `git mv src/reader/_detail.ts src/reader/_close-up.ts`; `Detail` → `CloseUp`; `reader.ts`
   field `detail` → `closeUp`; `FrameSlot.detail` → `closeUp` in `_slots.ts` and its readers
   (`_loupe.ts:157`, `_tools/_pen.ts:20`, `_slots.ts:70`); CSS `.detail` → `.close-up` and the
   `el('canvas', 'detail')` calls at `_close-up.ts:65-83`. `e.detail` at `_cuts/_editor.ts:109`
   is the DOM event's and stays. `docs/reader-split-spec.md:45` and `TODO.manual.md:30,239`.
5. `ARCHITECTURE.md`: "the tool on top" and "the tool in use" → "the active tool".
6. `DONE = 2`; `npm test`, `npm run build`.

## Stage 3: markings, aspects, named excerpts, delete and remove

1. `markings/placed.ts`: `PlacedMark` → `PlacedMarking`, `MarkColors` → `MarkingColors`,
   `markColors` → `markingColors`, `setMarkColors` → `setMarkingColors`, `markExtent` →
   `markingExtent`; `markings/store.ts` `loadMarkColors`, `saveMarkColors` → `loadMarkingColors`,
   `saveMarkingColors`; `git mv src/library/_mark-colors.ts src/library/_marking-colors.ts`,
   `openMarkColors` → `openMarkingColors`; CSS `.mark-colors-row` → `.marking-colors-row` in
   `library.css` and `_marking-colors.ts:15`. Follow every importer (`grep -rnw` each old name).
2. `face/dialog.ts:168-185`: `mark`, `releaseMark`, `placeMarks` → `tick`, `releaseTick`,
   `placeTicks`; `el('div', 'mark')`, `el('div', 'mark release')` → `tick`, `tick release`; CSS
   `.mark`, `.mark.release` → `.tick`, `.tick.release` in `face.css`.
3. `shapes` → `aspects`: `library/_host.ts:27`, `library/library.ts:53` and its uses (lines
   207-209, 443, 459), `_scores-section.ts:119,175`, `_setlists-section.ts:138`;
   `originals/read/original.ts:101-111` private field; prose "page shapes" → "aspects" in the six
   places the spec lists.
4. Named excerpts: `git mv src/dialogs/excerpts.ts src/dialogs/named-excerpts.ts` (and its test
   if any); rename its exports as the spec's row says, and `ExcerptHost` → `NamedExcerptHost`;
   fix importers (`library/_host.ts`, `library/_scores-section.ts`, `library/library.ts`,
   `reader/_title-menu.ts`). `scores/excerpts.ts:191` `removeName` → `deleteNamedExcerpt`, line
   196 "a score's names" → "a score's named excerpts"; `reader/_title-menu.ts:284` `deleteNamed`
   → `askToDeleteNamedExcerpt`.
5. Delete and remove: `markings/symbol-library.ts:84` `removeGroup` → `deleteGroup`, line 118
   `removeSymbol` → `deleteSymbol`, with their importers (`reader/_tools/_symbol.ts`,
   `_symbol-library-editor.ts`, `_symbol-panel.ts`, the tests); the editor's local `deleteGroup`
   at `_symbol-library-editor.ts:96` → `askToDeleteGroup`. `face/dialog.ts:117,157`: the
   confirmation becomes `Delete “${g.name}”?`, "Its trials are deleted with it.", button
   "Delete"; `docs/face-gestures-spec.md` and `TODO.manual.md` where they describe that button.
6. `DONE = 3`; `npm test`, `npm run build`.

## Stage 4: originals, face, status

1. `git mv src/originals/trash-fs.ts src/originals/removed-fs.ts` (and `trash-fs.test.ts` if
   any); importers in `originals/` (`handles/_roots.ts:11`, `library-files.ts:17`,
   `misc-files.ts:16`, `inbox-fs.ts`), `library/_storage.ts`, `main.ts`; `STORAGE.md:388`.
   `_removedDir` → `_removedFolder`.
2. `originals/drive/_api.ts`: `trash(fileId)` → `bin(fileId)`, `untrash` → `unbin`, the comments
   at lines 2, 14, 16, 22; `drive/_root.ts:182-186`; `drive/_fake.ts` and `_api.test.ts`,
   `_root.test.ts`, `score-fs.test.ts` where they call it. Prose "Drive's trash" → "Drive's bin"
   in `_record-model.ts:27`, `STORAGE.md:107,423,424`, `README.md:32,33,44,64`,
   `TODO.manual.md:451,454`, unless the sentence quotes Google's own label.
3. `git mv src/originals/misc-files.ts src/originals/incoming-files.ts` (and its test if any);
   importers (`library/_incoming.ts`, `library/_removed.ts`, `library/library.ts`) and the
   comments at `inbox-fs.ts:2` and `removed-fs.ts:3`; the `originals/order.test.ts` list.
4. `dir` → `folder`: `drive/_byte-cache.ts:28` and its uses, `handles/_roots.ts:19` (`this.dir` →
   `this.folder`), `inbox-fs.ts:11` (`dir(name)` → `folder(name)`), `library-files.ts:271`.
5. `page-cache/_disk.ts:60` `persist` → `saveIndex` (seven call sites in the file);
   `originals/read/_image.ts:91` `sheet` → `blankCanvas`; `reader/_saver.ts:1` header.
6. Pin: `originals/drive/score-fs.ts:116` `keepOriginalsOffline` → `pinOriginals`;
   `offline/pages.ts` `keepSetlistPagesOffline` → `pinSetlistPages`; `page-cache/cache.ts:123`
   `pinOffline` → `pinPages`; `library/library.ts:339` `keepOffline` → `pin`; the comments
   around each, and the `offline/` row of the layer table.
7. `git mv src/face/_model.ts src/face/_fit.ts` (and `_model.test.ts` → `_fit.test.ts`);
   `build` → `buildFit`; importers (`face/gestures.ts`, `face/store.ts`, `face/_settling.ts`,
   `face/dialog.ts`); header "A gesture's fit: what its trials give …"; the `face/` row of the
   layer table; `STORAGE.md:305`; `docs/face-gestures-spec.md` where it says "model".
8. Status: `originals/types.ts` `FolderState` → `FolderStatus`, `folderState` → `folderStatus`
   everywhere (`grep -rnw folderState`); `git mv src/face/button-state.ts src/face/button-status.ts`
   (and its test), `FaceButtonState` → `FaceButtonStatus`, `buttonState` → `buttonStatus`;
   importers (`reader/reader.ts`, `face/dialog.ts`, `face/face-button.ts`, `reader/_face-watch.ts`
   if it names it); `ARCHITECTURE.md` where it names `face/button-state.ts`.
9. `DONE = 4`; `npm test`, `npm run build`.

## Stage 5: pickers and thumbnails

1. `library/_drive-folders.ts`: header "The folder picker …", `chooseDriveFolder` →
   `pickDriveFolder`, `showDialog('Pick the scores folder', …)`; `library/library.ts:17,227-234`
   (`chooseDriveFolder` method → `pickDriveFolder`); `_setlists-section.ts:151,212-213`
   `chooseExcerpt` → `pickExcerpt`; `dialogs/setlists.ts` `chooseSetlist` → `pickSetlist` and
   `library/library.ts:5`; `originals/drive/score-fs.ts:2`, `drive/_api.ts:12`; `README.md:26`.
   Then `grep -rnwi "choose\|chosen\|chooser"` over the repository and turn each hit that means
   picking in a picker into pick/picked/picker; leave "choice" and sentences about the user's
   own choosing that are not this act.
2. Thumbnails: `git mv src/dialogs/thumb-strip.ts src/dialogs/thumbnail-strip.ts`,
   `git mv src/reader/_cuts/_thumbs.ts src/reader/_cuts/_thumbnails.ts`; `ThumbStrip` →
   `ThumbnailStrip`, `thumbCanvas` → `thumbnailCanvas`, every `thumb` variable → `thumbnail`;
   CSS and `el()` classes `.thumbs` → `.thumbnails`, `.thumb-frame` → `.thumbnail-frame`,
   `.thumb` → `.thumbnail`, `.thumb-space` → `.thumbnail-space` in `base.css:78`,
   `dialogs.css:3-21`, `library.css:121`, `reader.css:215-218`, `ui.css:33`, and in
   `dialogs/thumbnail-strip.ts:35,52`, `reader/_cuts/_insert-picker.ts:16,27`; importers of both
   files (`dialogs/excerpt-picker.ts`, `dialogs/open-score.ts`, `library/_host.ts`,
   `library/_incoming.ts`, `library/library.ts`, `reader/_title-menu.ts`, `_cuts/*`); the
   `dialogs/` row of the layer table; `TODO.md:110`, `TODO.manual.md:31`.
3. `DONE = 5`; `npm test`, `npm run build`.

## Stage 6: the sweep

1. For every row of the spec's table, `grep -rnwi` the retired spelling over the whole
   repository (`src`, the `.md` files, `index.html`, `public/lab` excluded) and read every hit.
   Fix any that mean the concept; list in the commit message any that stay and why.
2. Read `ARCHITECTURE.md` and `STORAGE.md` top to bottom once, for sentences that still use a
   retired spelling or name a renamed file.
3. Remove the `stage` gating from `src/vocabulary.test.ts` (every entry now applies), and
   `git rm docs/vocabulary-spec.md docs/vocabulary-plan.md`, as finished plans go, once
   `ARCHITECTURE.md` says everything the spec says.
4. `npm test`, `npm run build`.

## Manual checks, in the app, after the last stage

- Open a score, zoom in: the close-up is sharp; drag a symbol: the loupe shows.
- Pen, highlighter and eraser work; the Marking colours dialog opens from the library's ⋯ menu
  and changes the colour of new strokes.
- Long-press Symbols: pick a symbol, open the library editor, delete a group (the button says
  Delete).
- Face gestures: the dialog's sliders show their ticks; a gesture's Delete button asks "Delete
  “…”?" and removes the row.
- Link a Google Drive folder where a client is configured: the dialog is titled "Pick the scores
  folder"; remove a score: it goes to Recently removed and to Drive's bin; put it back.
- A setlist's row shows how much is saved for offline; its pages open offline afterwards.
- The excerpt picker and the incoming-files screen show their thumbnails as before.
