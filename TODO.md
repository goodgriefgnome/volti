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

- **Callers catch `NoAccess`:** the library (opening for a dialog, giving a password, opening a
  setlist), the reader (`lockedOut`, `allowAccess`) and `reader/open-scores.ts` check for a locked
  scores folder before reading a folder score. An original's methods now ask for access themselves
  and throw `NoAccess` (`originals/folder.ts`) when they can't get it: catch that instead, keeping
  what follows access being allowed (the library reading the folder again, the reader redrawing).
  `dialogs/score-files.ts` can then drop its `allowWriting` calls, as `o.move` asks itself.
- **Exports ask for their own access:** `exportExists` and `saveExport` ask for write access and
  throw `NoAccess`, as an original's methods do; `allowWriting` then leaves `originals/index.ts`.

The next three, in this order:

- **One root for the library:** the linked scores folder when there is one, the origin private
  file system (OPFS) when there isn't (before one is linked, or where the browser can't link
  one). Both are folders with true paths, read, moved, removed and listed by the same code; what
  differs between them (asking for access, the listing remembered while locked) belongs to the
  root, not to each original. So added scores are kept at their paths in OPFS, not under their
  hashes (no moving over: there are no added scores yet), and with one root there are no copies
  of a file in two places to choose between, nor an Added badge.
  - Added files go into the root, at its top.
  - Unlinking leaves the library empty: scores, markings and setlists stay, kept by hash, for
    when the folder is linked again.
  - **Recently removed:** removing a score moves its file into a private store in OPFS (with
    where it was and when), deleted for good after a week (looked at on start-up). A list of
    them, from the library's ⋯ menu, restores one to where it was (through the screen below
    where that path is taken). Its cuts, markings and named excerpts stay, as for any score
    whose file is missing. The storage breakdown (`library/storage.ts`) gets a part of its own
    for them, Trash, beside Added scores and Setlist cache.
  - Files deleted outside Volti (in the Files app) aren't in the list: Volti only finds them gone.
- **Incoming files:** a screen for files coming into the library, shared from another app or
  from Add PDFs, which always opens for them: shared files wait in the inbox until access to the
  folder is allowed, then open in it. Each file is a row with:
  - a preview: the excerpt picker's zoomable strip (`dialogs/excerpt-picker.ts`), split out of
    it and used read-only, showing the file's pages as a new score starts (each page one cut);
    a locked PDF asks for its password when previewed;
  - its name, which can be changed (often a phone's or a download's: IMG_2041.jpg);
  - its folder, the top by default, chosen from the library's subfolders or a new one, and one
    for every row at once;
  - what happens to it: new; already in the library (the same file, by hash, perhaps under
    another name: left out, saying where it is); or its path taken by a different file, which
    needs a new name or folder, or replacing that file (which then goes to Recently removed).
  Changing a name or folder checks again. Leaving a file out, or cancelling, drops it.
- **Linking a folder with scores in OPFS:** they move into the folder at their paths, without
  overwriting anything. One the folder already has (the same hash) is dropped from OPFS. Those
  whose path the folder has for a different file are listed in the same screen, to rename, put
  in another folder, replace, or leave out; one left out stays in OPFS, out of the library while
  the folder is linked, and an item in the library's ⋯ menu opens the screen for them again.

## Manual check

Things to try on the tablet.

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
- **Locked scores:** a password-protected PDF whose password hasn't been given shows a lock in
  the library and in Add scores (one that only stops printing or copying doesn't); adding it to a
  setlist asks for the password, Cancel leaves it out, and once given the lock goes.
- **Added scores after the update:** each added score is where it was, under its folder in the
  library, with its markings and setlists (their files are now kept under their ids: they are
  moved over once, the first time the library is read). Moving and renaming one; adding a file
  whose name an added score in another folder has.
- **Opening times:** opening a large PDF, and a large phone photo, now that every original is read
  as a PDF (a PDF is read by pdf-lib too, to see whether it is encrypted; an image is made into a
  one-page PDF): how long the first page takes, compared with before.
- **Password-protected and restricted PDFs:** ones from Acrobat (often AES-128, even when they
  only stop printing) and ones with a password open sharp, as before, now that our fork of
  pdf-decrypt reads them; export says "Original quality" for them.
- **New PDFs appear on coming back:** add a PDF to the scores folder in the Files app, switch
  back to Volti after half a minute or more: it appears in the library without asking.

## Confirmed features which require more thought

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
