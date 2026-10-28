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
| **score** | What is shown of an original: its cuts in played order, its archived cuts and its named excerpts. Its id is its file's. It stays when its file is gone. | `Score` |
| **cut** | A horizontal band of one original page (`y0`..`y1`, fractions of its height). A score is its cuts, stacked in the order they are played. | `Cut` |
| **ink**, **marking** | A marking is one thing drawn on the music (so far, pen and highlighter strokes); a score's ink is its markings, kept by the cut that holds most of each. | `Marking`, `ScoreInk` |
| **state** | A score and its ink, which every edit keeps in step. | `State` |
| **frame** | One of the score's own pages: cuts stacked down it until it is full, shaped like the original page of its first cut. What the user calls a score's "pages" are its frames. | `Frame` (`scores/frames.ts`) |
| **screen** | The frames shown at once: one, or two of the other orientation, side by side or one above the other. | `render/screen.ts` |
| **slot** | A frame on the reader's screen, with its canvases. | `FrameSlot` (`reader/_spread.ts`) |
| **span** | Which of a score's cuts are played, as the ids of the first and last; a missing end is the score's start or end. Spans follow edits to the cuts. | `Span` (`excerpts/span.ts`) |
| **excerpt** | The part of a score a span plays. A **named excerpt** ("Kyrie") is a name on a span, kept on the score. | `ExcerptName` |
| **setlist**, **entry** | A setlist is a list of entries, read as one continuous score; each entry plays a span of a score. | `Setlist`, `Entry` (`setlists/model.ts`) |
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
| 10 | `src/*.ts` | Start-up (`main.ts`), taking new versions (`updates.ts`), the service worker (`sw.ts`) |
| 9 | `library/` | The Library screen |
| 8 | `reader/` | The score screen: reading a score, an excerpt or a setlist, writing on it, editing its cuts |
| 7 | `dialogs/` | Dialogs both screens open: choosing an excerpt (over a strip of a score's frames, `thumb-strip`), the named excerpt dialogs, adding scores to a setlist, renaming and filing a score's file, exporting, setlist names and menus, a PDF's password |
| 6 | `export/`, `pictures/` | Exporting PDFs (with pdf-lib); working out which pages setlists play and telling the page cache to keep them offline (`maker`) |
| 5 | `render/` | What is on a screen: fitting frames to it (`layout`, `screen`), zoom maths (`zoom`), drawing a frame on a canvas (`paint`) |
| 4 | `setlists/` | Setlists and their entries, and keeping them on the same music when a score's cuts change |
| 3 | `excerpts/` | Spans of a score's cuts (`span`) and the names on them (`names`) |
| 2 | `scores/`, `originals/` | A score: its data (`model`), edits (`edits`), frames (`frames`), which cut owns a marking (`ownership`), storage (`store`). Originals, in fourteen files, each importing only from those before it: file names, folders, titles and what happens to files arriving at paths (`path-utils`), general helpers for walking and writing folders and hashing (`_filesystem-utils`), the public types (`types`) and those private to the directory (`_types`), everything only about PDFs (`_pdf-source`: pdf.js, passwords, decryption, a PDF's music for export) and only about images (`_image-source`), the open pages of each original, one set per id for the whole app (`_sources`), a source file read into an original that draws through the page cache (`original`), the linked folder with its id cache and Exports (`device-score-fs`), Volti's own folder in OPFS with its exact record of ids (`internal-score-fs`), the inbox (`inbox-fs`) and Recently removed (`trash-fs`), the library's root and its files and listing (`library-files`), and files held outside the library (`misc-files`)|
| 1 | `page-cache/`, `markings/`, `ui/` | The page cache: pages drawn in memory under a budget and saved in OPFS under an epoch, the scheduling of draws (two at once, `now` before `ahead` before `later`, a draw shared by its requesters), and stand-ins for progressive drawing; it knows nothing about files, and is given a `PageSource` to draw from (`cache`, with `_match`, `_budget`, `_memory`, `_scheduler` and `_disk`). What can be drawn on the music, and how (`draw`); generic pieces of the interface: elements (`dom`), menus and dialogs one at a time (`overlay`), asking for a line of text (`ask-text`), toasts |
| 0 | `storage/`, `types/` | The IndexedDB key-value store, with every key in `keys.ts`; missing DOM types |

`styles/` holds the CSS, one file per part of the app, imported in order by `main.ts`.

Other rules, the first also tested:

- Only the `store.ts` files and `originals/` use the kv store, and `storage/keys.ts` names the
  module that reads and writes each key.
- Files that say **Pure** at the top use no DOM and no storage, and are unit tested next to them
  (`*.test.ts`). Most of the rules of the app (`scores/edits.ts`, `excerpts/span.ts`,
  `setlists/model.ts`, `reader/_reading.ts`) are pure; keep them so.
- A dialog that only one screen opens lives with that screen (`reader/cuts/_insert-picker.ts`);
  one both open goes in `dialogs/` (`dialogs/add-scores.ts`, `dialogs/score-files.ts`).

## The two screens

**The reader** (`reader/reader.ts`) shows the frames and turns them, and takes edits. Around it:

- `_reading.ts`: *what* is read (a score, an excerpt or a setlist's items) and the setlists; an edit
  to a score goes through `Reading.edited`, which carries it to the score's named excerpts and to
  every setlist's entries. No DOM: tested in `reading.test.ts`.
- `_view.ts`: `ReaderView`, the reader as every part sees it (the current score's state, page
  shapes and pages, the frames and slots, the zoom), each read afresh. The cut editor
  (`cuts/_host.ts`), the tools (`tools/_tool.ts`), pointer input (`_input.ts`) and the close-up
  (`_detail.ts`) each get the view plus the few things they may ask the reader to do.
- `_toolbar.ts` builds the toolbar; `_toolbar-menus.ts` holds what its menus and dialogs do.
- `_open-scores.ts` reads each score's file and opens its pages when it is near the one read, `_saver.ts` saves
  scores and setlists together, `_history.ts` keeps undo.
- An edit is a function from `State` to `State` (`scores/edits.ts`); whatever makes it calls
  `commit(state, focus)`, which records undo, carries the edit through `Reading`, saves and
  redraws.

**The library** (`library/library.ts`) holds what it has read (the folder, its files, setlists,
saved scores) and opens the reader. It is the `LibraryHost` (`_host.ts`) for the parts that show
it: `_folder-banner.ts`, `_setlists-section.ts` and `_scores-section.ts`, which only show the data and
ask the Library to change it (`change`, `update`, `refresh`).

## Recipes

**A new kind of marking** (text, a fingering): add it to the `Marking` union in
`markings/model.ts` and pick it out in `behaviour()`; give its `_KindBehaviour` in a file of its own
beside `stroke.ts`; add a tool to make it (below). Cut edits, the eraser, drawing and exporting then
work for it, through `markings/model.ts`.

**A new tool**: a file in `reader/tools/` exporting a `Tool` (its toolbar label, and what a pointer
does from going down to lifting), and a line in `TOOLS` in `reader/tools/_tools.ts`. Its button
appears in the toolbar. A tool changes the score by calling `host.commit` with a new state.

**A new edit to the cuts**: a pure function from `State` to `State` in `scores/edits.ts`, with a
test in `edits.test.ts`; then a menu item that calls `host.commit` with it, in `reader/cuts/_menus.ts`.
Spans and names follow it by themselves, but check `followEdit`'s cases in `excerpts/span.ts` if it
moves cuts in a new way.

**Something another directory needs**: drop the underscore from its name (and from its file's, if
the file is `_`-prefixed), and import it from the file where it is defined.

**Something new to store**: a key in `storage/keys.ts`, saying what it holds and which module uses
it, and the loading and saving in that module's `store.ts` (or in `originals/`).

**A toolbar button**: a button in `reader/_toolbar.ts` (and its state in `sync`), an action in
`ToolbarActions`, and what it does in `reader/reader.ts` or, for a menu or dialog,
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
