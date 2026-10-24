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

- **The library's ⋯ menu, with storage:** the scores folder's ⋯ beside the name becomes the
  library's general menu, there whether or not a folder is linked (Link scores folder and Allow
  access stay buttons beside it, as now).
  - A “Scores folder: <name>” section, when one is linked: Check for new scores (reads the folder
    again, as the library does on opening: new and changed PDFs are read, with “Reading new
    scores: n left…”, and ones gone are dropped; it asks for access first if it isn't allowed
    yet), Change folder…, Unlink.
  - A “Storage used on this tablet” section: the total, one stacked bar of the parts in
    proportion, and each part's size listed under it (Metadata is too thin to see in the bar):
    - **Metadata**: cuts, markings, named excerpts, setlists, positions, passwords (IndexedDB;
      shared files waiting to be added count here too).
    - **Added scores**: the copies in `imported/` (OPFS), summed from the files' sizes.
    - **Setlist cache**: the saved pictures in `page-pictures/` (OPFS), summed from the files' sizes.
    - **Offline binary**: the app and pdf.js kept for offline use (Cache Storage).
    IndexedDB and Cache Storage come from `navigator.storage.estimate()`'s `usageDetails`
    (Chrome); worked out each time the menu opens, showing “Working out…” meanwhile. No delete
    button. As in https://claude.ai/artifact/Bt8AySBf7E2dZC13NQcqF7 (option A).
- **Reading the folder again on coming back to Volti:** when Volti comes back into view
  (`visibilitychange` to `visible`) with the library showing and a scores folder linked and
  allowed, it reads the folder again quietly, so a PDF added in the Files app shows without
  asking (only “Reading new scores: n left…” when there are new ones). Not while the reader is
  open, and not after less than half a minute away, so quick switches don't each read it.
- **Move to folder… for scores in the scores folder too:** a score from the scores folder gets
  Move to folder… in its ⋯ menu (in the library and the reader), with the same dialog as an
  added score's (a list of the subfolders there are, or a new path typed in; None for the top of
  the folder), but it moves the file itself: it makes the folders on the path that aren't there
  yet (`getDirectoryHandle(part, { create: true })`) and moves the file into the last one
  (`move(dir)`, or copying then deleting where moving fails, as renaming does). The same write
  permission renaming asks for covers it, as it is granted for the whole folder and everything
  in it. Its hint says so (“Moves “Mass.pdf” into Masses/Latin in the scores folder”); a file of
  that name already there is refused, saying so. The score keeps its id, so its hash is noted at
  the new path and it shows in its new list at once (as a rename will). A folder left empty
  stays, as Volti doesn't delete your folders.

## Manual check

Things to try on the tablet.

- **After the code was reorganised** (no change meant to what it does): writing with the pen and
  erasing, zoomed in and out, with the palm resting; editing cuts by long press and by dragging
  tabs; opening a password-protected score; exporting into the scores folder; Allow access after a
  restart.
- **Exporting with no folder linked** (the share sheet). Exporting into the folder works.
- **Linking a big folder:** the library shows at once with the scores already known, and the new
  ones appear one by one, with "Reading new scores: n left…".
- **One access prompt per session:** after a restart, Allow access (or opening a score from the
  folder) asks once, to edit files; Rename… and Export PDF… then don't ask again.
- **The Update button:** with Volti left open after a change is published, coming back to it (or
  within half an hour) shows Update in the library's banner; tapping it loads the new version.
- **A dialog with the keyboard open** sits centred in the space above the keyboard, with the field
  being typed into in view.
- **The reader's back arrow:** with the toolbar hidden, the small arrow at the top left goes back
  to the library without getting in the way of the music or of turning back a page.
- **Scores grouped by subfolder:** the lists, closing them (remembered after a restart), searching,
  Move to folder… for an added PDF, and Add scores' collapsed lists.
- **Exporting a password-protected score:** its music comes out sharp when zoomed (vectors, or the
  scan as it was), and the dialog says “Original quality”.
- **Setlists open at once:** a while after making or changing a setlist, opening it, and turning
  from one of its scores to the next, shows the music straight away, scans included; zooming in
  still works. Reading with the tablet turned the other way is slow the first time only.
- **Markings in an exported PDF:** open the export in another PDF app (Acrobat, Xodo, the
  browser): the pen (thicker where pressed harder) and highlighter (notes under it still black)
  look as in Volti, and the app lists them as annotations it can hide or delete.
- **Locked scores:** a password-protected PDF whose password hasn't been given shows a lock in
  the library and in Add scores (one that only stops printing or copying doesn't); adding it to a
  setlist asks for the password, Cancel leaves it out, and once given the lock goes.
- **Images as scores:** a photo of a page taken on the tablet, in the scores folder and added
  with Add PDFs (or shared from the Gallery): it shows the right way up, zooms in sharply, takes
  markings, and exports as the photo itself (“Original quality”). HEIC photos may not open, if the
  tablet's browser can't show them.
- **Turning on to the next score:** in a score's reader (not a setlist), turning past the last
  page says “Tap again for …”, and turning again opens the library's next score at its start;
  back from the first page opens the one before at its end. Try it with the pedal too.
- **The reader's ⋯ menu:** in a score, a named excerpt and a setlist, its items do what the
  library's do (renaming a score's file in the scores folder, Move to folder…, Add scores…,
  Archive), and the library shows the changes on going back. Removing the entry being read, or
  deleting the named excerpt being read, goes on to the next.
- **Setlists start at the top:** tapping a setlist opens its first score even after reading part
  of it; tapping one of its scores opens that one.
- **Renames show at once:** renaming a score in the scores folder (from the library or the
  reader) shows the new name straight away; a moment later the list is still right.
- **Reader opens with the toolbar hidden:** a score, excerpt or setlist shows only the music and
  the back arrow; a tap in the middle brings up the toolbar.

## Confirmed features which require more thought

- **Text and symbol markings**, beside the pen and highlighter, each exported as a PDF annotation
  with its own vector appearance, as they are (`export/annotations.ts`; the drawing interface in
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
