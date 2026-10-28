# TODO

A score is what is shown of its original (a PDF), as cuts; a setlist is a list of excerpts of
scores.

**How to work through this list** (when asked to work on the immediate features):

- Work on `main` directly: one commit per item, pushed as it is done.
- Each item's commit takes the item out of this file; what then needs trying on the tablet goes
  under Manual check.
- Before each push: `npm test`, `npm run build`, and check the change in the running app.
- Ideas raised in conversation are filed here, in the right section, not built, unless asked.

## Work for the immediate future

Two moves of code, one commit each. Nothing is meant to change in what the app does, so the
checks are `npm test` and `npm run build` (which type-checks every moved import).

- **Fold `excerpts/` into `scores/excerpts.ts`:** spans and excerpt names are about a score's
  cuts, and the names are already kept on the score (`ExcerptName` in `scores/model.ts`).
  - Make `src/scores/excerpts.ts`: `span.ts`'s code first, then `names.ts`'s (which uses it).
    Merge the two header comments into one that says the file holds spans (which cuts an excerpt
    plays, as the ids of its first and last cut) and the names on them, and stays **Pure**. Import
    from `./frames` and `./model` instead of `../scores/…`.
  - Drop `_ends` (from `names.ts`): it is the same function as `ends`. Its callers in the file use
    `ends`.
  - Every export keeps its name: `Span`, `spanOf`, `spanCuts`, `spanLabel`, `spanFor`,
    `followEdit`, `sameSpan`, `ends`, `nameOf`, `excerptName`, `sortedNames`, `nameProblem`,
    `setName`, `removeName`, `followNames`.
  - Merge `span.test.ts` and `names.test.ts` into `src/scores/excerpts.test.ts`, keeping their
    `describe` blocks as they are.
  - Point every import of `../excerpts/span` and `../excerpts/names` at `../scores/excerpts`
    (one import per file where a file had both): `dialogs/add-scores.ts`,
    `dialogs/excerpt-picker.ts`, `dialogs/excerpts.ts`, `export/pdf.ts`, `library/_host.ts`,
    `library/_scores-section.ts`, `library/_setlists-section.ts`, `library/library.ts`,
    `pictures/maker.ts`, `reader/_reading.ts`, `reader/_reading.test.ts`, `reader/_toolbar-menus.ts`,
    `reader/reader.ts`, `setlists/model.ts`, `setlists/model.test.ts`. Comments naming
    `excerpts/` (`scores/model.ts`, `setlists/model.ts`) name
    `scores/excerpts.ts`.
  - Delete `src/excerpts/`. In `src/layers.test.ts`, remove `excerpts` from `LAYERS` and move every
    layer above it down by one, so there is no gap.
  - `ARCHITECTURE.md`: in the layer table, remove the `excerpts/` row, renumber the rows above it
    to match `LAYERS`, and add spans and excerpt names (`excerpts`) to the `scores/` row. Update
    the glossary's **span** row (`Span` in `scores/excerpts.ts`), the list of pure rules, and "check
    `followEdit`'s cases in `scores/excerpts.ts`".
- **Fold `pictures/` into `library/_offline-pages.ts`:** since the page cache, `pictures/` holds
  only `maker.ts`, which works out the pages setlists play and tells the page cache to keep them
  offline; only `library/library.ts` uses it.
  - `git mv src/pictures/maker.ts src/library/_offline-pages.ts`, and fix its imports (`../…` stay
    as they are; nothing in it imports from `library/`).
  - Rename `makePictures` to `keepSetlistPagesOffline`, and its call sites in `library/library.ts`.
    Its header comment says what it does, not "pictures".
  - Delete `src/pictures/`. In `src/layers.test.ts`, remove `pictures` from `LAYERS` (layer 5,
    after the renumbering above, keeps `export`).
  - `ARCHITECTURE.md`: remove `pictures/` (and `maker`) from the layer table's row, and add to the
    `library/` row that it keeps setlists' pages offline (`_offline-pages`). The comment at the top of
    `render/screen.ts` names `pictures/maker.ts`: make it `library/_offline-pages.ts`.

## Manual check

Things to try on the tablet.

- **Source files and originals:** no lock icon anywhere. A password-protected PDF asks for its
  password the first time it is opened, previewed in the incoming screen, or added to a setlist
  (from a score's ⋯ menu or Add scores; Cancel leaves it out), then never again. One that only
  stops printing doesn't ask. A phone photo shows upright, sharp at every width and in the
  zoomed close-up, and exports at original quality (a turned JPEG says it was recompressed).
- **Ids after updating:** opening the library doesn't read every score again ("Reading new scores"
  doesn't appear), both with a folder linked and without one. Then add, rename, move, remove, put
  back, link, and unlink: each keeps scores, markings and setlists.
- **Linking with scores in Volti's own folder:** link a folder after adding some PDFs without one:
  they move into the folder at their paths (in the Files app too), one the folder already has is
  dropped, and one whose name the folder has for another file opens the incoming screen. Leave it
  out: the library's ⋯ menu offers "Move the score left in Volti…" to open the screen again.
- **Incoming files:** Add PDFs, and sharing from another app, open the screen: each file's pages
  (pinch and drag), its name and folder (and one folder for all), and New, Already in the library
  (left out, saying where), or a path taken (another name or folder, or Replace). A locked PDF
  shows its pages once its password is given. Shared files before Allow access open after it.
  Putting back a removed file whose place is taken opens the screen for it.
- **One root for the library:** with no folder linked, Add PDFs and sharing put files at the top
  of Volti's own folder; moving and renaming them; unlinking leaves the library empty, with markings and setlists back when it is linked again. With a
  folder linked, Add PDFs and sharing put files at the top of the folder (in the Files app too);
  before Allow access they wait, and are added once it is tapped. No Added badge anywhere.
- **Recently removed:** Remove in a score's ⋯ menu (library and reader) takes its file out of
  the folder (gone in the Files app too); the library's ⋯ menu lists it under Recently removed,
  and Put back puts it where it was, with its cuts and markings. A week later it is gone from the
  list. The storage view shows Trash.
- **Access asked for by what reads the folder:** after a restart, before tapping Allow access:
  opening a score from the folder, adding a locked one to a setlist, opening one for a dialog
  (Add excerpt), and renaming or moving one each ask for access themselves; refusing says so,
  allowing goes on and the library reads the folder again. Exporting into the folder asks for
  write access when Export is tapped. In a setlist played from its saved
  pictures, a page not saved, Edit cuts and Export ask for it, and Allow access redraws.
- **Turning on the press:** the page turns as the finger goes down, anywhere with the toolbar
  hidden; with it showing, only in the shaded band at each side (a cut tab there still takes the
  press first), and a tap elsewhere hides the toolbar. The chevron at the top right shows it, and
  the one at the toolbar's right end hides it. Nothing turns while the pen is down or just after
  it lifts. Watch for a palm landing in a band before the pen touches, and a pinch or pan whose
  first finger lands in a band: they turn the page. Turning no longer puts the pen away.
- **Setlists without folder access:** after a restart, before tapping Allow access, play a
  setlist whose pages are saved: it opens without asking. Turn the tablet (pages not saved at
  that size): the page asks for access, and Allow access shows it.
- **The library keeps its place:** scroll down the library, open a score, go back: the library
  is where it was (also after renaming the score in the reader).
- **After the code was reorganised** (no change meant to what it does): writing with the pen and
  erasing, zoomed in and out, with the palm resting; editing cuts by long press and by dragging
  tabs; opening a password-protected score; exporting into the scores folder; Allow access after a
  restart.
- **Exporting with no folder linked** (the share sheet). Exporting into the folder works.
- **Linking a big folder:** the library shows at once with the scores already known, and the new
  ones appear one by one, with "Reading new scores: n left…".
- **Markings in an exported PDF:** open the export in another PDF app (Acrobat, Xodo, the
  browser): the pen (thicker where pressed harder) and highlighter (notes under it still black)
  look as in Volti, and the app lists them as annotations it can hide or delete.
- **Opening times:** opening a large PDF, and a large phone photo, now that a photo is drawn from
  its bitmap rather than made into a PDF first (a PDF is still read by pdf-lib too): how long the
  first page takes, and turning to and zooming in on a big photo.
- **Password-protected and restricted PDFs:** ones from Acrobat (often AES-128, even when they
  only stop printing) and ones with a password open sharp, as before, now that our fork of
  pdf-decrypt reads them; export says "Original quality" for them.
- **Exporting a PDF whose pages have to be drawn** (one with an encryption pdf-decrypt doesn't
  know): it exports, with the pictures of its pages as sharp as in the reader, and the dialog says
  it was rasterized; plain PDFs and images export at original quality, as before.
- **New PDFs appear on coming back:** add a PDF to the scores folder in the Files app, switch
  back to Volti after half a minute or more: it appears in the library without asking.
- **The page cache:** reading, turning quickly, zooming in and out, and close-ups on a PDF and a
  photo look as before; setlists before Allow access play their saved pages (a page not saved says
  Volti needs access); the storage view shows Setlist pages and Page cache as two parts; a long
  setlist doesn't run the tablet out of memory.

## Confirmed features which require more thought

- **After the split into source files and originals**, left as they were for now: the library
  shows one row per id, the first copy of two identical files (one source file per id in the
  root); an image's decoded bitmap is held while its pages are open (about 48 MB for a 12 MP
  photo) rather than decoded again at each width; setlists save pictures of images as of PDFs; a
  removed file isn't read to preview it in Recently removed; and there is no way yet to take a
  PDF's password off as it comes in (a copy kept without it, by choice), which would leave Volti
  nothing to remember.
- **Progressive drawing for thumbnails when they are first drawn** [needs thought]: the page
  cache can give stand-ins (`Original.drawProgressive`), but no caller uses it yet; thumbnails
  would show a nearby width at once and sharpen.
- **The cache giving room back when the origin runs short of quota** [needs thought]: pinned
  pages are never evicted and the others only to stay within 30% of the quota; nothing shrinks the
  cache when the origin as a whole (scores added, metadata) runs out of room.
- **Showing offline progress on the setlist's row:** `keepPagesOffline` reports how many of the
  pages setlists play are saved; nothing shows it yet.
- **An original whose pages have to be drawn is drawn again for each use** [needs refinement]:
  where a PDF's music can't be had as it is (an encryption pdf-decrypt doesn't know, or a PDF
  pdf-lib can't read), `pdfOf` draws every page with pdf.js into a PDF of pictures
  (`pagesDrawn`), and nothing keeps it. The export dialog (`openExportPdf`) draws it once to learn
  `lossyReason` in `drawnOriginals`, and exporting (`open` in `export/pdf.ts`) draws it again for
  `o.pdf()`, as `PdfContent` holds what it worked out only until the first `pdf()` takes it
  (pdf.js takes the bytes it is given): twice an export. `o.aspects()` draws it a third time, but
  only while its aspects aren't stored yet. Reading such a score draws every page up front too.
  To work out: where the drawn PDF should be kept, and for how long (it can be large), and
  whether the reason can be known without drawing.
- **`Original.aspects()` opens the pages outside the shared source**: where an original's aspects
  aren't stored yet, `aspects()` (`originals/original.ts`) opens `content.pages()` itself and
  destroys them, rather than through its id's source in `_sources.ts`. So an original drawn for
  the first time is opened in pdf.js twice, once for its aspects and once by the source that draws
  it (for one whose pages have to be drawn, `pagesDrawn` runs twice). Once per original, as the
  aspects are then stored. The fix is for `_sources.ts` to give the open pages to `aspects()` too,
  counted as a use, so the 5 s close applies to it.
- **Naming what `keepOffline` is given** (`page-cache/types.ts`): `OfflineScore` is an
  original's pages to pin (its id is the original's, and nothing of a score's cuts or ink is in
  it), and `OfflinePage` one cache entry to pin (a page at an exact width, with its aspect). Rename
  them to say so, as `PinnedOriginal` and `PinnedPage` say, or pass a `Map` of pinned pages by id
  with the sources alongside; `keepPagesOffline` (`originals/original.ts`) and the maker follow.
- **Purging a removed score's data** [needs discussion]: once a removed file is deleted for good,
  its score (cuts, markings, named excerpts, reading position) is still kept by hash, as for any
  score whose file is missing. Eventually there should be a way to purge it.

- **What metadata holds, in the storage view:** tapping the Metadata line opens what it holds, as a
  small stacked bar of its own (as the main bar is) with its parts as labelled chips under it
  (option 3 in https://claude.ai/artifact/Bt8AySBf7E2dZC13NQcqF7):
  - **Markings** (`ink:` records), **Cuts and excerpts** (`score:` records), **Setlists**
    (`setlist:` records and their order), **Library index** (hashes, titles, page shapes, the
    remembered folder listing, passwords, locks, filed folders, closed folder lists, reading
    places), **Waiting to be added** (the `inbox`: files shared to Volti not yet added, by
    their sizes).
  - Each worked out by Volti from its own records (the size of each written out, as JSON), so
    close to what is stored but not exact; **Unaccounted** is what is left of the browser's
    figure for the database (old copies of changed records Chrome hasn't cleared yet, and its
    own bookkeeping), never below nothing.
  - The kv store gets a way to go through all its records (keys and values) for this; `keys.ts`
    groups each key into one of the parts.
  - To think through: how to group the records. Passwords may be a part of their own; much of the
    “Library index” is a cache that can be rebuilt from the files (`hashes`, `folder-files`,
    `aspects:`, `locks`, `titles`), while `added-folders`, `closed-folders`, `last-added-to` and
    `pos:` are choices that can't. One split: your work (`score:`, `ink:`, setlists), settings,
    passwords, file metadata cache, waiting to be added.
- **Text and symbol markings**, beside the pen and highlighter, each exported as a PDF annotation
  with its own vector appearance, as they are (`export/_annotations.ts`; the drawing interface in
  `markings/draw.ts` would need fills, and text or glyph outlines):
  - *Text:* typed on the music ("rit.", cues, bar numbers), with an optional shape behind it: a
    plain rectangle with a see-through fill, or a rectangle pointing left or right (a tag). A
    FreeText annotation, its appearance drawing the shape, then the text.
  - *Symbols:* fingerings (finger numbers 1–5, and substitutions such as 4–5) and organ pedal
    marks (toe and heel, for the left and right foot, as above or below the staff). Stamp
    annotations, each symbol's outline drawn as vector paths from an open music font (Bravura,
    SIL Open Font License, SMuFL's keyboard pedal glyphs), so nothing depends on the viewer's
    fonts. Placed with a tap, then moved and resized.
  - To think through: the toolbar (one tool with a palette of symbols rather than a button each;
    text entry and editing on the music); sizes relative to the staff; colours; how the eraser and
    undo treat them; and keeping each on its original page and cut, as strokes are.
- **Cropping, in batches of pages:** a mode of its own, like Edit cuts, for trimming the margins
  of the original's pages, applied to several pages at once. To think through: what a batch is (a
  range of pages, odd and even pages apart for scans of a book); whether it trims all four sides
  or only left and right (cuts already trim top and bottom); how it changes the pages' shape, and
  so frames and orientation; markings, which are placed on the page and must stay on the music;
  and exports and thumbnails, which would show the cropped pages.
- **Turning back so forward restores the screen:** turning back should show the screen that
  turning forward from would come back to the current one. With the first frame on screen f:
  frames f−2 and f−1 when f−2 would open a screen of two; otherwise f−1 alone (also when f−1 would
  open a screen of two, which would take in f). For now it goes back by as many frames as show.
- **Square frames:** a frame neither wider nor taller is both portrait and landscape; decide how
  it lays out on the screen (for now, as portrait).
- **Several images as one original**: a set of images ordered by file name, scaled to a common
  width, as one score (single images are already 1-page scores).
- **Page-turn strategies** (half-page turns and the like): to be discussed separately.
- **Exporting the library** (scores, setlists, markings, reading positions) as files, for backup
  and for moving to another device; probably written into the linked scores folder.

## Speculative future ideas

- **Watching the scores folder:** with the File System Observer API (`FileSystemObserver`, a
  Chrome origin trial from version 129, not yet a standard), Volti would hear of PDFs added,
  removed, renamed or changed in the scores folder (recursively) as it happens, and update the
  list quietly, reading only what changed. Feature-detected (`'FileSystemObserver' in self`),
  with reading the folder again as the fallback. Waiting for it to be standardised.
- **Read only the parts of a PDF that are needed:** open originals through a range transport
  (`PDFDataRangeTransport`, slices of the File) instead of copying the whole file to pdf.js;
  saves some of the ~0.65 s pdf.js spends copying and parsing a 42 MB scan.
- **Synthetic pages** (systems arranged by hand), **jump markers** (D.S., coda) that generate the
  played order, and **tags** for search.
- **Named excerpts from the PDF's bookmarks** (outline), made the first time a score is opened.
- **A new edition of an original:** replacing a score's PDF isn't supported, as cuts and ink refer
  to page positions.
