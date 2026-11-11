# How Volti's code is put together

Read this before changing `src/`. It names the things the code talks about, says which directory
holds what and what each may use, and lists the files to touch for the changes made most often.
Every module also starts with a comment saying what belongs in it; give a new module one too.

## Words

The code uses these words, always in these senses.

| Word | Means | Type |
| --- | --- | --- |
| **source file** | A PDF, or an image, that Volti can read as music: at its path in the library's **root** (the linked scores folder, or the app's own folder in OPFS while none is linked), or held outside it (coming in, or left in the app's folder). Its id is the SHA-256 of its contents, so renaming or moving it keeps everything made from it. There is one for each id in the root. A file in the root lives in a **score filesystem**: the device one (the linked folder) or the internal one (Volti's own folder), whichever is the root. | `SourceFile` (`originals/types.ts`) |
| **original** | A source file Volti has read: its pages to draw (a PDF's by pdf.js, an image's from its bitmap) and its music as a PDF (a `RenderedPdf`), for export. Reading a PDF asks for its password the first time it needs one. | `Original` (`originals/types.ts`) |
| **original page** | One page of an original. 0-based in the code (`cut.page`), 1-based to pdf.js and to the user. | |
| **aspects** | Each original page's shape, height / width. Lengths on a page are in page widths. | `Aspects` (`scores/model.ts`) |
| **score** | What is shown of an original: its cuts in played order, its ink and its named excerpts. Its id is its file's. It stays when its file is gone. | `Score` |
| **cut** | A horizontal band of one original page (`y0`..`y1`, fractions of its height), and which pass of its page it plays. A score is its cuts, stacked in the order they are played. | `Cut` |
| **pass** | Which time a page's music is played: each cut has one, from 1, and a marking may be limited to one. | `Cut.pass`, `passOf` |
| **ink**, **marking** | A marking is one thing drawn on the music (pen and highlighter strokes, and symbols and text placed whole); a score's ink is its markings by page of the original; a marking may belong to one pass. A cut shows the markings of its page whose anchor it holds, of its pass or of none. | `Marking`, `ScoreInk` |
| **state** | A score and its ink, which every edit keeps in step. | `State` |
| **frame** | One of the score's own pages: cuts stacked down it until it is full, shaped like the original page of its first cut. What the user calls a score's "pages" are its frames. | `Frame` (`scores/frames.ts`) |
| **screen** | The frames shown at once: one, or two of the other orientation, side by side or one above the other. | `render/screen.ts` |
| **slot** | A frame on the reader's screen, with its canvases. | `FrameSlot` (`reader/_spread.ts`) |
| **excerpt** | Which of a score's cuts are played, as the ids of the first and last; a missing end is the score's start or end, so no ends is the whole score. Excerpts follow edits to the cuts. A **named excerpt** ("Kyrie") is an excerpt with a name, kept on the score | `Excerpt`, `NamedExcerpt` (`scores/excerpts.ts`) |
| **setlist**, **entry** | A setlist is a list of entries, read as one continuous score; each entry plays an excerpt of a score. | `Setlist`, `Entry` (`setlists/model.ts`) |
| **page cache** | The one cache of drawn original pages for the app: pages held in memory under a budget, and saved in OPFS (the pages setlists play, kept for good; other pages worth saving, least recently used first). | `page-cache/` |

## Layers

Each directory of `src/` is in a layer, and imports only from its own files and from lower layers.
`src/layers.test.ts` holds the table and fails on an import that goes sideways or up, so a change
that needs one is a sign the code belongs somewhere else.

There are no index files that re-export a directory: other directories import from the file that
defines a name (`'../originals/path-utils'`). A name starting with an underscore is internal: a file
`_foo.ts` is imported only by files of its own directory (the test fails on one that isn't), and
an export `_foo` is used only by its own directory's files. So the files without an underscore are
what a directory offers the rest of the app, and a name that has to be used from another directory
loses its underscore (and its file moves out of the `_` ones). Tests may reach into another
directory for test helpers (`scores/testing.ts`). `package.json` says only the CSS does anything
when loaded (`sideEffects`), so the build leaves out a module nothing uses (the service worker
takes `putInbox` without pdf.js): keep it true, and do any start-up work from `main.ts`.

| Layer | Directory | What it holds |
| --- | --- | --- |
| 9 | `src/*.ts` | Start-up (`main.ts`), taking new versions (`updates.ts`), bringing the stored data up to the app's version (`stored-data.ts`), the service worker (`sw.ts`) |
| 8 | `library/` | The Library screen; keeping the pages setlists play offline (`_offline-pages`) and saying how much of each is saved (`_offline-status`); the folder chooser for linking a Google Drive folder (`_drive-folders`) |
| 7 | `reader/` | The score screen: reading a score, an excerpt or a setlist, writing on it, editing its cuts |
| 6 | `dialogs/` | Dialogs both screens open: choosing an excerpt (over a strip of a score's frames, `thumb-strip`), the named excerpt dialogs, adding scores to a setlist, renaming and filing a score's file, exporting, setlist names and menus, a PDF's password |
| 5 | `export/` | Exporting PDFs (with pdf-lib) |
| 4 | `render/` | What is on a screen: fitting frames to it (`layout`, `screen`), zoom maths (`zoom`), drawing a frame on a canvas (`paint`) |
| 3 | `setlists/` | Setlists and their entries, and keeping them on the same music when a score's cuts change |
| 2 | `face/` | Face gestures the person defines: a gesture and its settings (`gestures`), its template fitted from its trials and a frame's score (`template`, `model`, `recording`, `settling`), watching the front camera with MediaPipe (`watcher`), and the button that shows it |
| 2 | `scores/`, `originals/` | A score: its data (`model`), edits (`edits`), frames (`frames`), excerpts of its cuts and their names (`excerpts`), which cut a marking is on and which cuts show it (`ownership`), storage (`store`). Originals, in twenty-six files (and two stand-ins that only tests import: for the handle API, `_fake-handles`, and for Google Drive, `_fake-drive`), each importing only from those before it: file names, folders, titles and what happens to files arriving at paths (`path-utils`), general helpers for walking and writing folders and hashing (`_filesystem-utils`), the public types (`types`) and those private to the directory (`_types`), what is recorded about each original and every rule about where its bytes are (`_record-model`, pure), the records in IndexedDB with a copy in memory (`_record-store`), the bytes of Recently removed, and the removals listed there, files in a root's own bin included (`trash-fs`), the bookkeeping of one scan of the linked folder with its duplicate rules (`_folder-scan`, pure), the roots that are folders of handles, Volti's own and the linked one, with the file operations on them and the linked one's scan (`_directory-handle-roots`), the Google client given at build time (`_drive-config`), signing in to Google with PKCE and its tokens (`_drive-auth`), the Drive API requests (`_drive-api`), copies of Drive files' bytes in OPFS (`_byte-cache`), the root over a Drive folder, listed by checksums (`_drive-root`), everything only about PDFs (`_pdf-source`: pdf.js, passwords, decryption, a PDF's music for export) and only about images (`_image-source`), the open pages of each original, one set per id for the whole app (`_sources`), a source file read into an original that draws through the page cache (`original`), the link under `folder`, on the device or in Drive, read by the service worker too (`_folder-link`), the device folder (picking it, asking for access, its root) (`device-score-fs`), the Drive folder (signing in, the chooser's folders, its root, the copies kept) (`drive-score-fs`), the linked folder of either kind (linking, unlinking, its state and root) (`linked-folder`), Volti's own folder in OPFS (`internal-score-fs`), the bytes of the inbox, which the service worker fills (`inbox-fs`), pointed to by a record, the library's root and its files, scanning the linked folder into the records, the library's files worked out from the records, Exports and start-up tidying (`library-files`), and files held outside the library (`misc-files`)|
| 1 | `fonts/` | The bundled fonts, reading them and shaping text into glyphs (fontkit), SMuFL's glyph names (`smufl`); nothing about markings |
| 1 | `page-cache/`, `markings/`, `ui/` | The page cache: pages drawn in memory under a budget and saved in OPFS under an epoch, the scheduling of draws (two at once, `now` before `ahead` before `later`, a draw shared by its requesters), and stand-ins for progressive drawing; it knows nothing about files, and is given a `PageSource` to draw from (`cache`, with `_match`, `_budget`, `_memory`, `_scheduler` and `_disk`). What can be drawn on the music, and how (`draw`); generic pieces of the interface: elements (`dom`), menus and dialogs one at a time (`overlay`), asking for a line of text (`ask-text`), toasts |
| 0 | `storage/`, `types/` | The IndexedDB key-value store, with every key in `keys.ts`, all described in `STORAGE.md`; missing DOM types |

`styles/` holds the CSS, one file per part of the app, imported in order by `main.ts`.

Other rules, the first also tested:

- Only the `store.ts` files, `originals/` and `stored-data.ts` use the kv store, and `storage/keys.ts` names the
  module that reads and writes each key.
- Files that say **Pure** at the top use no DOM and no storage, and are unit tested next to them
  (`*.test.ts`). Most of the rules of the app (`scores/edits.ts`, `scores/excerpts.ts`,
  `setlists/model.ts`, `reader/_reading.ts`) are pure; keep them so.
- A dialog that only one screen opens lives with that screen (`reader/cuts/_insert-picker.ts`);
  one both open goes in `dialogs/` (`dialogs/add-scores.ts`, `dialogs/score-files.ts`).

## The two screens

**The reader** (`reader/reader.ts`) shows the frames and turns them, and takes edits. Around it:

- `_reading.ts`: *what* is read (a score, an excerpt or a setlist's items) and the setlists; an edit
  to a score goes through `Reading.edited`, which carries it to the score's named excerpts and to
  every setlist's entries. No DOM: tested in `_reading.test.ts`.
- `_view.ts`: `ReaderView`, the reader as every part sees it (the current score's state, page
  shapes and pages, the frames and slots, the zoom), each read afresh. The cut editor
  (`cuts/_host.ts`), the tools (`tools/_tool.ts`), pointer input (`_input.ts`) and the close-up
  (`_detail.ts`) each get the view plus the few things they may ask the reader to do.
- The reader (`reader.ts`, `_input.ts`) has what is the same whatever the tool: deciding who gets each press, the selection (found in the ink by identity, ended when its marking is gone), lending, a chrome layer for each tool in each frame (only the tool in use shows it), telling tools when they are equipped, unequipped or the selection changes, and committing edits, undo, painting, the loupe and zoom. A tool (`tools/_tool.ts`, `Tool`) has its button's face and panel, which markings are its own (`ownsMarking`), what a press does on the music, its chrome (`drawChrome`, `isChromeAt`) and its own state: Text its typing field and ghost, Symbols the library and current symbols. `makeTools` (`tools/_tools.ts`) makes them for one reader, each with a host of its own (its layers, its button's face). A tool never asks whether a press is a finger or the stylus: only `Input` does, for palm rejection and the stylus's eraser button.
- `Input` decides who gets a press in this order: an open menu is only closed; chrome marked `data-own-presses` (the delete button, the typing field) keeps its presses; a tool that suppresses `allPresses` (Text while typing) takes them; palm rejection; a second finger pinches, unless the tool suppresses `pinching` (it holds a marking); cut tabs; page turns at the sides, with every tool and the stylus (`turnFor`); with the toolbar hidden only a tap in the middle; the stylus's eraser button lends Erase for the press; selecting, unless the tool suppresses `selecting` (Pen, Highlight, Erase): the active tool's chrome (`isChromeAt`), else the nearest marking some tool owns within 12 px (`markingAt`, by `hitDistance` from `markings/model.ts`), selected, which lends its owner, else a selection only ends; then the tool's `start`, and the hand tool's when it declines. `_route` (tested) is the order once the pointer is known to be a single press.
- The hand tool (`tools/_hand.ts`) is the tool when no other is equipped by its button, and has no button: a press pans, a tap hides or shows the toolbar, a long press opens the cut menu while Cuts is on.
- Lending (`_lending.ts`, `LendStack`): the tool equipped by its button is at the bottom; selecting a marking lends its owner, and the eraser button lends Erase for its press. The toolbar lights the tool on top. A tool is equipped when it goes on the stack and unequipped when it leaves it (`onEquipped`, `onUnequipped`); being covered by a lend is neither.
- The pages sit under the toolbar and are moved only by `drag` and `pinch` (`render/zoom.ts`), which keep or increase how much of the spread is in the view below the toolbar; a new screen is placed by `placeFresh`.
- The reader sets `data-theme="light"` on the document while it is open and puts the app's theme back when it closes; its colours are the `--stage` and `--bar*` tokens in `styles/base.css`.
- Each tool's settings for new markings (colours, text's font and background) are one `ToolSettings` (`markings/tool-settings.ts`), kept in the kv store under `tool-settings`; the reader holds them in `settings`, and tools read and change them through `host.settings()` and `host.setSettings`.
- A tool sets its button's face (`host.setButtonFace`, a `ButtonFace` from `tools/_faces.ts`), and the toolbar draws it again only when its `key` changes. Text and Symbols show a `Look`: the selected marking's, else the settings'; each applies a choice from its panel to the selected marking, the settings and (for symbols' background) the library symbol.
- The Symbols panel (`reader/_symbol-panel.ts`) is the library (tap to pick, drag to arrange through `moveSymbol` in `markings/library.ts`) beside the symbols' settings; the Symbols tool (`tools/_symbol.ts`), which owns the library, keeps each group's current symbol and the tool's symbol in place across a move (`moveSymbolTo`).
- A placing tool (`reader/tools/_placing.ts`) shows a `ghost` under a pressed finger that has moved on empty music, on whichever slot is under it (`slotUnder`, `reader/_spread.ts`), and places on lifting over a slot. Text's ghost is "Ag", shaped ahead by Text (`prepareGhost`, `tools/_text.ts`), which also owns its typing field (`tools/_typing.ts`, moving the music through `host.lift`).
- `reader/_loupe.ts` draws the loupe from the slots' canvases; `_placing.ts` shows it on every drag (placing, move, resize), given the finger's screen point that `Input` passes to `ToolPointer.move`. The loupe asks `draw` for the music around the finger at its own magnification (one region per slot at a time, up to 2048 px across) and draws the ink sharp itself.
- A long press on a tool's button (`ui/long-press.ts`) opens that tool's panel when it has one (`showPanel`; `reader/_tool-panels.ts`, with rows from `reader/_swatches.ts`); a tap still picks the tool.
- Every page turn, from a tap, a key, a pedal or a face gesture, goes through `act` and the 100 ms gate (`_turn-gate.ts`, `gateTurn`). With the toolbar hidden, a button at the top right (`face/face-button.ts`) watches the front camera (`face/watcher.ts`) for the gestures defined in the Face gestures dialog (`dialogs/face-gestures.ts`), where each is recorded and fitted; `_face-watch.ts` decides when watching is on, and `face/button-state.ts` what the button shows.
- `_toolbar.ts` builds the toolbar; `_toolbar-menus.ts` holds what its menus and dialogs do; `_title-menu.ts` the menu under the title, with the controls that change a setlist's entries and a score's named excerpts.
- `_open-scores.ts` reads each score's file and opens its pages when it is near the one read, `_saver.ts` saves
  scores and setlists together (a change stays to be saved until a write of it succeeds), `_history.ts` keeps undo.
- An edit is a function from `State` to `State` (`scores/edits.ts`); whatever makes it calls
  `commit(state, focus)`, which records undo, carries the edit through `Reading`, saves and
  redraws.

**The library** (`library/library.ts`) holds what it has read (the folder, its files, setlists,
saved scores) and opens the reader. It follows `libraryFiles`, which works its files out from the
records, so every change Volti makes shows without a scan; it scans (`scanRoot`) only where the
folder may have changed outside Volti, or the root changed: opening, coming back after a while,
Check for new scores, linking, unlocking, unlinking and access allowed. It is the `LibraryHost` (`_host.ts`) for the parts that show
it: `_folder-banner.ts`, `_setlists-section.ts` and `_scores-section.ts`, which only show the data and
ask the Library to change it (`change`, `update`, `refresh`).

## Recipes

**A new kind of marking** (a post-it, say): add it to the `Marking` union in
`markings/model.ts` and pick it out in `behaviour()`; give its `_KindBehaviour` in a file of its own
beside `stroke.ts` and `placed.ts`; add a tool to make it (below). Which cuts show it, the eraser, drawing and exporting then
work for it, through `markings/model.ts`.

**A new tool**: a file in `reader/tools/` exporting a function from its host to a `Tool` (its name in
`ToolName` and `TOOL_LABELS` in `tools/_tool.ts`, its button's face through `host.setButtonFace`, and
what `start` does for a press, from going down to lifting), a line in `makeTools` in `tools/_tools.ts`,
and its place in `TOOLBAR`: its button then appears in the toolbar. A tool that places markings
whole is `placingTool(host, spec)` (`_placing.ts`), given what it places, its ghost, what a second tap
does and what a resize sets (`_symbol.ts`, `_text.ts`). A tool changes the score by calling
`host.commit` with a new state.

**A new edit to the cuts**: a pure function from `State` to `State` in `scores/edits.ts`, with a
test in `edits.test.ts`; then a menu item that calls `host.commit` with it, in `reader/cuts/_menus.ts`.
Excerpts and their names follow it by themselves, but check `followEdit`'s cases in `scores/excerpts.ts` if it
moves cuts in a new way.

**Something another directory needs**: drop the underscore from its name (and from its file's, if
the file is `_`-prefixed), and import it from the file where it is defined.

**Something new to store**: a key in `storage/keys.ts`, saying what it holds and which module uses
it, and the loading and saving in that module's `store.ts` (or in `originals/`); and in `STORAGE.md`.
A change to what is already stored adds a step: raise `DATA_VERSION` in `src/stored-data.ts` and add
the step from the version before to `STEPS`, a function that brings the whole store up (run again
after failing partway, it finishes what is left). The steps run at start-up, on the start screen,
before anything else reads the store; after them, the code reads only the new form.

**A toolbar button** that isn't a tool's: a button in `reader/_toolbar.ts` (and its state in `sync`),
an action in `ToolbarActions`, and what it does in `reader/reader.ts` or, for a menu or dialog,
`reader/_toolbar-menus.ts`.

**An item in a library menu**: the `⋯` menus are built in `library/_setlists-section.ts` (setlists
and their entries) and `library/_scores-section.ts` (scores and their named excerpts); what they
change goes through the `LibraryHost`. The reader's `⋯` menu (`reader/_toolbar-menus.ts`, `more`)
has the same items for what it reads, so add the item there too.

**A dialog**: `ui/ask-text.ts` for one that asks for a line of text; otherwise `showDialog` from
`ui/overlay.ts`, filled with `el`, `button` and `buttonRow` from `ui/dom.ts` and `ui/overlay.ts`.
It goes with the screen that opens it, or in `dialogs/` when both do.

## Checking a change

`npm test` runs the unit tests and `layers.test.ts`; `npm run build` type-checks and builds. Then
try the change in the app (`npm run dev`), on a tablet where it matters: the manual checks waiting
to be done are in `TODO.md`.
