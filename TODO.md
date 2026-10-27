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

Nothing waiting: ideas to take up are under Confirmed features below.

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
- **New PDFs appear on coming back:** add a PDF to the scores folder in the Files app, switch
  back to Volti after half a minute or more: it appears in the library without asking.

## Confirmed features which require more thought

- **After the split into source files and originals**, left as they were for now: the library
  shows one row per id, the first copy of two identical files (one source file per id in the
  root); an image's decoded bitmap is held while its pages are open (about 48 MB for a 12 MP
  photo) rather than decoded again at each width; setlists save pictures of images as of PDFs; a
  removed file isn't read to preview it in Recently removed; and there is no way yet to take a
  PDF's password off as it comes in (a copy kept without it, by choice), which would leave Volti
  nothing to remember.
- **One page cache for the app, kept between sessions** [needs discussion]: today each opener
  (the reader's scores, a dialog's score, an export, the pictures maker, an incoming preview)
  opens its own `PageCache`, so one original can be open in pdf.js twice, with its pages drawn
  twice. Instead, one cache keyed by original id (a hash, so never stale): openers take and
  release a hold on an original, pdf.js closes it once none is held, and drawn pages share one
  memory budget, the least recently used dropped first. Kept between sessions, it would take over
  from the saved pictures (`pictures/`), which are already a stored page cache for the pages
  setlists play: the pictures maker would only mark those pages to keep. To think through: how
  much room it may take, and which pages are worth storing (thumbnails, zoom steps, sizes no
  longer shown); the cost of encoding WebP against drawing again (small for vector pages, large
  for scans); a version in its keys, as a new pdf.js or supersampling draws differently; that a
  password-protected PDF's pages are stored readable, as pictures are now; and Trash in the
  storage view for a removed score's pages.
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
