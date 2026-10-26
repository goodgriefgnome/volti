# How Volti's code is put together

Read this before changing `src/`. It names the things the code talks about, says which directory
holds what and what each may use, and lists the files to touch for the changes made most often.
Every module also starts with a comment saying what belongs in it; give a new module one too.

## Words

The code uses these words, always in these senses.

| Word | Means | Type |
| --- | --- | --- |
| **original** | A PDF, or an image read as one page: in the linked scores folder, or added to the app. Its id is the SHA-256 of its contents, so renaming or moving it keeps everything made from it. It is read only as a PDF, whatever the file is. There is one `Original` for each id. | `Original` (`originals/original.ts`) |
| **original page** | One page of an original. 0-based in the code (`cut.page`), 1-based to pdf.js and to the user. | |
| **aspects** | Each original page's shape, height / width. Lengths on a page are in page widths. | `Aspects` (`scores/model.ts`) |
| **score** | What is shown of an original: its cuts in played order, its archived cuts and its named excerpts. Its id is its original's. | `Score` |
| **cut** | A horizontal band of one original page (`y0`..`y1`, fractions of its height). A score is its cuts, stacked in the order they are played. | `Cut` |
| **ink**, **marking** | A marking is one thing drawn on the music (so far, pen and highlighter strokes); a score's ink is its markings, kept by the cut that holds most of each. | `Marking`, `ScoreInk` |
| **state** | A score and its ink, which every edit keeps in step. | `State` |
| **frame** | One of the score's own pages: cuts stacked down it until it is full, shaped like the original page of its first cut. What the user calls a score's "pages" are its frames. | `Frame` (`scores/frames.ts`) |
| **screen** | The frames shown at once: one, or two of the other orientation, side by side or one above the other. | `render/screen.ts` |
| **slot** | A frame on the reader's screen, with its canvases. | `FrameSlot` (`reader/spread.ts`) |
| **span** | Which of a score's cuts are played, as the ids of the first and last; a missing end is the score's start or end. Spans follow edits to the cuts. | `Span` (`excerpts/span.ts`) |
| **excerpt** | The part of a score a span plays. A **named excerpt** ("Kyrie") is a name on a span, kept on the score. | `ExcerptName` |
| **setlist**, **entry** | A setlist is a list of entries, read as one continuous score; each entry plays a span of a score. | `Setlist`, `Entry` (`setlists/model.ts`) |
| **pictures** | Saved images of the original pages setlists play, so they show at once. | `pictures/` |

## Layers

Each directory of `src/` is in a layer, and imports only from its own files and from lower layers.
`src/layers.test.ts` holds the table and fails on an import that goes sideways or up, so a change
that needs one is a sign the code belongs somewhere else.

What a directory offers the rest of the app is its `index.ts`, which re-exports it; other
directories import it from there (`'../originals'`), never from a file inside it, and the test
fails on one that does. Files in a directory import each other directly, never through their own
index. Something only a directory's own files use stays out of its index, even when it is exported
between them. Tests may reach into another directory for test helpers (`scores/testing.ts`).
`package.json` says only the CSS does anything when loaded (`sideEffects`), so the build leaves out
what an index re-exports but nothing uses (the service worker takes `putInbox` without pdf.js):
keep it true, and do any start-up work from `main.ts`.

| Layer | Directory | What it holds |
| --- | --- | --- |
| 10 | `src/*.ts` | Start-up (`main.ts`), taking new versions (`updates.ts`), the service worker (`sw.ts`) |
| 9 | `library/` | The Library screen |
| 8 | `reader/` | The score screen: reading a score, an excerpt or a setlist, writing on it, editing its cuts |
| 7 | `dialogs/` | Dialogs both screens open: choosing an excerpt, the named excerpt dialogs, adding scores to a setlist, renaming and filing a score's file, exporting, setlist names and menus, a PDF's password |
| 6 | `export/`, `pictures/` | Exporting PDFs (with pdf-lib); saving pictures of the pages setlists play |
| 5 | `render/` | What is on a screen: fitting frames to it (`layout`, `screen`), zoom maths (`zoom`), drawing a frame on a canvas (`paint`) |
| 4 | `setlists/` | Setlists and their entries, and keeping them on the same music when a score's cuts change |
| 3 | `excerpts/` | Spans of a score's cuts (`span`) and the names on them (`names`) |
| 2 | `scores/`, `originals/` | A score: its data (`model`), edits (`edits`), frames (`frames`), which cut owns a marking (`ownership`), storage (`store`). Originals: an original (`original`), what one holds as a PDF (`contents`, told by `file-kind`), listing them (`originals`), the linked folder (`folder`), added scores (`imported`), hashes, file names, opening one's pages and passwords (`open`), drawing them through the page cache (`pages`) with pdf.js (`pdf`) |
| 1 | `markings/`, `ui/` | What can be drawn on the music, and how (`draw`); generic pieces of the interface: elements (`dom`), menus and dialogs one at a time (`overlay`), asking for a line of text (`ask-text`), toasts |
| 0 | `storage/`, `types/` | The IndexedDB key-value store, with every key in `keys.ts`; missing DOM types |

`styles/` holds the CSS, one file per part of the app, imported in order by `main.ts`.

Other rules, the first also tested:

- Only the `store.ts` files and `originals/` use the kv store, and `storage/keys.ts` names the
  module that reads and writes each key.
- Files that say **Pure** at the top use no DOM and no storage, and are unit tested next to them
  (`*.test.ts`). Most of the rules of the app (`scores/edits.ts`, `excerpts/span.ts`,
  `setlists/model.ts`, `reader/reading.ts`) are pure; keep them so.
- A dialog that only one screen opens lives with that screen (`reader/cuts/insert-picker.ts`);
  one both open goes in `dialogs/` (`dialogs/add-scores.ts`, `dialogs/score-files.ts`).

## The two screens

**The reader** (`reader/reader.ts`) shows the frames and turns them, and takes edits. Around it:

- `reading.ts`: *what* is read (a score, an excerpt or a setlist's items) and the setlists; an edit
  to a score goes through `Reading.edited`, which carries it to the score's named excerpts and to
  every setlist's entries. No DOM: tested in `reading.test.ts`.
- `view.ts`: `ReaderView`, the reader as every part sees it (the current score's state, page
  shapes and pages, the frames and slots, the zoom), each read afresh. The cut editor
  (`cuts/host.ts`), the tools (`tools/tool.ts`), pointer input (`input.ts`) and the close-up
  (`detail.ts`) each get the view plus the few things they may ask the reader to do.
- `toolbar.ts` builds the toolbar; `toolbar-menus.ts` holds what its menus and dialogs do.
- `open-scores.ts` opens each score's original when it is near the one read, `saver.ts` saves
  scores and setlists together, `history.ts` keeps undo.
- An edit is a function from `State` to `State` (`scores/edits.ts`); whatever makes it calls
  `commit(state, focus)`, which records undo, carries the edit through `Reading`, saves and
  redraws.

**The library** (`library/library.ts`) holds what it has read (the folder, originals, setlists,
saved scores) and opens the reader. It is the `LibraryHost` (`host.ts`) for the parts that show
it: `folder-banner.ts`, `setlists-section.ts` and `scores-section.ts`, which only show the data and
ask the Library to change it (`change`, `update`, `refresh`).

## Recipes

**A new kind of marking** (text, a fingering): add it to the `Marking` union in
`markings/model.ts` and pick it out in `behaviour()`; give its `KindBehaviour` in a file of its own
beside `stroke.ts`; add a tool to make it (below). Cut edits, the eraser, drawing and exporting then
work for it, through `markings/model.ts`.

**A new tool**: a file in `reader/tools/` exporting a `Tool` (its toolbar label, and what a pointer
does from going down to lifting), and a line in `TOOLS` in `reader/tools/index.ts`. Its button
appears in the toolbar. A tool changes the score by calling `host.commit` with a new state.

**A new edit to the cuts**: a pure function from `State` to `State` in `scores/edits.ts`, with a
test in `edits.test.ts`; then a menu item that calls `host.commit` with it, in `reader/cuts/menus.ts`.
Spans and names follow it by themselves, but check `followEdit`'s cases in `excerpts/span.ts` if it
moves cuts in a new way.

**Something another directory needs**: export it from its file and add it to the directory's
`index.ts`, beside the rest of that file's names.

**Something new to store**: a key in `storage/keys.ts`, saying what it holds and which module uses
it, and the loading and saving in that module's `store.ts` (or in `originals/`).

**A toolbar button**: a button in `reader/toolbar.ts` (and its state in `sync`), an action in
`ToolbarActions`, and what it does in `reader/reader.ts` or, for a menu or dialog,
`reader/toolbar-menus.ts`.

**An item in a library menu**: the `⋯` menus are built in `library/setlists-section.ts` (setlists
and their entries) and `library/scores-section.ts` (scores and their named excerpts); what they
change goes through the `LibraryHost`. The reader's `⋯` menu (`reader/toolbar-menus.ts`, `more`)
has the same items for what it reads, so add the item there too.

**A dialog**: `ui/ask-text.ts` for one that asks for a line of text; otherwise `showDialog` from
`ui/overlay.ts`, filled with `el`, `button` and `buttonRow` from `ui/dom.ts` and `ui/overlay.ts`.
It goes with the screen that opens it, or in `dialogs/` when both do.

## Checking a change

`npm test` runs the unit tests and `layers.test.ts`; `npm run build` type-checks and builds. Then
try the change in the app (`npm run dev`), on a tablet where it matters: the manual checks waiting
to be done are in `TODO.md`.
