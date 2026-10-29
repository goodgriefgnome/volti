# TODO

A score is what is shown of its original (a PDF or an image), as cuts; a setlist is a list of excerpts of
scores.

**How to work through this list** (when asked to work on the immediate features):

- Work on `main` directly: one commit per item, pushed as it is done.
- Each item's commit takes the item out of this file; what then needs trying on the tablet goes
  in `TODO.manual.md`, as a group of its own.
- Before each push: `npm test`, `npm run build`, and check the change in the running app.
- Ideas raised in conversation are filed here, in the right section, not built, unless asked.

## Work for the immediate future

## Confirmed features which require more thought

- **Left as they were after the split into source files and originals:**
  - The library shows one row per id: of two identical files, only the first copy (one source
    file per id, at its canonical path).
  - An image's decoded bitmap is held while it is open (about 48 MB for a 12 MP photo), that is
    while any original of it isn't closed, rather than decoded again at each width
    (`ImageSource`, `originals/_image-source.ts`).
  - The offline job saves pictures of an image's page as of a PDF's, though an image draws quickly
    from its file.
  - A file in Recently removed isn't read to show its pages.
  - There is no way to take a PDF's password off as it comes in (keeping a copy without it, by
    choice), which would leave Volti nothing to remember.
- **The cache giving room back when the origin runs short of quota** [needs thought]: pinned
  pages are never evicted, and the others only to stay within 30% of the quota (`diskBudget`,
  `page-cache/_budget.ts`); nothing shrinks the cache when the origin as a whole (scores added,
  records) runs out of room.
- **Exporting works out each PDF's music twice, and draws a drawn one twice** [needs refinement]:
  exporting a score or a setlist as a PDF (`dialogs/export-pdf.ts`, `export/pdf.ts`) needs each
  original's music as a PDF pdf-lib can read: `Original.pdf()`, for a PDF `pdfOf`
  (`originals/_pdf-source.ts`). It reads the whole file, decrypts it if it is encrypted, and
  parses it with pdf-lib; where pdf-decrypt doesn't know the encryption, or pdf-lib can't read it,
  it draws every page with pdf.js, 2000 px wide, into a PDF of pictures (`pagesDrawn`). Nothing
  keeps the result. (Reading scores doesn't go through `pdfOf`: only exporting does.)
  - The export dialog's quality line ("Checking quality…") calls `drawnOriginals`, which runs
    `pdf()` on every original in the export only to learn its `lossyReason`. Exporting then runs
    `pdf()` again for each (`open`). So each PDF is read, decrypted and parsed twice an export,
    and one that has to be drawn is drawn twice. An image makes its one-page PDF for the check,
    though the dialog doesn't show the only reason it can give (`recompressed`).
  - The idea: split `pdfOf`'s deciding (decrypt, try pdf-lib: the bytes to use, or why they have
    to be drawn) from the drawing, which only exporting does; the reason is known before
    `pagesDrawn` is called. Store the reason in the original's record beside its password, as it
    is fixed by the file's contents too, so the quality line reads it, and works it out only for
    a file not checked yet. Images skip the check.
  - To work out: whether "needs no drawing" is stored too (`''`, as for the password), so a file
    checked once isn't parsed again; and whether the reason is worked out as files arrive (see
    "The first open of a PDF still lags").
- **How the pages kept offline are worked out** [needs thought]: the offline job works out the
  widths each setlist's pages are drawn at from the screen's size, in both orientations, and pins
  exactly those (`library/_offline-pages.ts`). Open:
  - A score whose aspects were never measured and whose file can't be read now (folder locked, no
    password): neither its pages nor their widths can be worked out, as a score's cuts, its
    frames' shapes and the widths a screen shows them at all follow from its pages' aspects. Its
    earlier pins are left as they are, and its setlist waits.
  - Both orientations double the pages and the drawing. Eventually the user says which
    orientation each frame is played in, and only that is kept.
  - It assumes the reader fills the screen: if full screen is refused, the stage is the window,
    and a saved page only serves a request within 1% of its width (`page-cache/_match.ts`).
  - A change of `devicePixelRatio` (display size in Android's settings) changes every width.
- **Naming what is pinned** (`page-cache/types.ts`): `OfflinePage` is one cache entry to pin (a
  page at an exact width, with its aspect), and `OfflineKey` one pinned page. Rename them to say
  so, as `PinnedPage` and `PinnedKey` would; `pinOffline`, `saveOffline` and the offline job
  follow.
- **Showing whether storage is persistent:** `main.ts` asks for it (`navigator.storage.persist()`)
  at each start and ignores the answer, and nothing shows it. Chrome grants it by itself, mostly
  to an installed app; in a browser tab it may not, and then Volti's own folder (scores added
  without a linked folder), and the cuts, markings and setlists, can be cleared when the tablet
  runs low on space, without a word. The storage bar (the library's ⋯ menu, `library/_storage.ts`)
  could say whether it is (`navigator.storage.persisted()`), and where it isn't, suggest
  installing Volti (Add to home screen). Where it is, the page cache's 30% of the quota is room
  only Volti gives back (see the item on the cache giving room back).
- **Purging a removed score's data** [needs discussion]: once a removed file is deleted for good
  (its record then says `gone`), its score (cuts, markings, named excerpts) is still kept by its
  id, as for any score whose file is missing. Eventually there should be a way to purge it.
- **What metadata holds, in the storage bar:** tapping the Metadata line opens what it holds, as a
  small stacked bar of its own (as the main bar is) with its parts as labelled chips under it
  (option 3 in https://claude.ai/artifact/Bt8AySBf7E2dZC13NQcqF7).
  - What is stored (`storage/keys.ts`): `score:` (cuts and named excerpts) and `ink:` (markings)
    by original; `setlist:` and `setlists` (their order); `original:` records (where each file
    is, its page shapes, its password); and a few settings and places: `folder`,
    `closed-folders`, `last-added-to`, `last-read`. (Files shared to Volti and not added yet are
    in OPFS now, not in metadata.)
  - Each part's size worked out by Volti from its own records (each written out as JSON), so close
    to what is stored but not exact; **Unaccounted** is what is left of the browser's figure for
    the database (old copies of changed records Chrome hasn't cleared yet, and its own
    bookkeeping), never below nothing.
  - The kv store gets a way to go through all its records (keys and values) for this; `keys.ts`
    groups each key into one of the parts.
  - To think through: how to group them. One split: your work (`score:`, `ink:`, setlists), the
    library's records (`original:`, which hold the passwords too: they could be a part of their
    own), and settings and places. Most of an `original:` record can be worked out again from the
    files (page shapes; where a folder file is); a password, and where a file in Volti's own
    folder or Recently removed is, can't.
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
  open a screen of two, which would take in f). For now it goes back by as many frames as show
  (`turnFrom`, `reader/_turning.ts`).
- **Square frames:** a frame neither wider nor taller is both portrait and landscape; decide how
  it lays out on the screen. For now it counts as portrait (`isLandscape`, `scores/frames.ts`), so
  two sit side by side.
- **Several images as one original**: a set of images ordered by file name, scaled to a common
  width, as one score (single images are already 1-page scores).
- **Page-turn strategies** (half-page turns and the like): to be discussed separately.
- **Exporting the library** (scores, setlists, markings, reading positions) as files, for backup
  and for moving to another device; probably written into the linked scores folder.
- **The first open of a PDF still lags** [needs thought]: the first time a PDF is opened since
  PDFs skipped pdf-lib is still noticeably slow, even for one opened before, whose aspects are
  stored. What only that open does is `readPdf`'s check (`originals/_pdf-source.ts`): `f.file()`,
  then `encrypted`, which reads the file's first and last 64 KB (and for an encrypted one, a
  pdf.js open to check its password). Any read now stores what it finds (`''` for a PDF that
  opens without a password), so the check is paid once per file; the offline job only reads
  scores with pages left to save, so most files pay it on their first tap.
  - Reading 128 KB should be quick; the suspicion is the last 64 KB. A file in the linked folder
    is read through Android's storage framework, which may get to its end by reading through the
    whole file. To be confirmed on the tablet: time `encrypted` alone against reading the whole
    file.
  - A file never opened is also measured (every page's aspect) before its first screen, though
    with the same open file that draws it, and has no page saved yet.

  The idea: check a file as it arrives (found in the scores folder when it is read, shared to
  Volti, or added), in the background, so its password check (and its aspects) are stored before
  it is first opened. One that needs a password stays unchecked until it is tapped, as it can't be
  asked for.
  - To work out: where arrivals are noticed (`library-files.ts`'s reading of the folder, the
    inbox, adding scores); how files already in the library, never checked, get checked; and how a
    burst of new files (a folder linked for the first time) is paced so it doesn't hold up the
    library or the reader's draws.
  - If the end of the file is what is slow, whether the check can do without it: a linearized PDF
    names `/Encrypt` near its start too, but an ordinary one only at its end.
- **The reader shows its first screen twice** [needs thought]: a `ResizeObserver` reports the
  stage's size as soon as it starts watching, which `Reader` does once full screen has settled,
  just after starting `goTo` (`reader/reader.ts`). 150 ms later its report runs `show()` again,
  for the same widths, which the cache now holds: it costs little, but it redraws the screen for
  nothing. To work out: whether to skip the observer's first report, or only show again when the
  size differs from the one last shown.

## Speculative future ideas

- **A format version in each stored key's name, so no code reads old formats:**
  - In `storage/keys.ts`, each key or prefix carries its format version in its name:
    `'score@2:' + id`, `'folder@2'`.
  - Changing a key's format means bumping that number. The new name finds nothing, so what was
    stored is dropped: the no-migration rule, applied by itself. `kv` doesn't change at all.
  - Start-up tidying deletes every key `keys.ts` doesn't know, which includes every older
    version.
  - Together these replace the old-format code there is now: `_asLink`'s bare-handle branch
    (`originals/device-score-fs.ts`), and `OLD_KEYS` and `OLD_PREFIXES` in `tidyStorage`
    (`originals/library-files.ts`).
  - The risk is forgetting a bump: old values then read as the new format. A test that records
    each stored type's declaration next to its key's version, and fails when one changes without
    the other, would catch it.
- **Schemas for what is stored, checked as it is read:** describe each stored type with a schema
  library (such as zod) in place of its TypeScript interface, and derive the type from the schema.
  `kv.get` takes the key's schema, and a value that doesn't match is deleted and read as absent.
  - This catches a changed format without anyone remembering to bump a version, and catches
    corrupt values too.
  - It costs a dependency, a schema per stored type in place of its interface, and a check on
    every read (ink can be large).
  - It's an alternative to versioned key names, not an addition.

- **Watching the scores folder:** with the File System Observer API (`FileSystemObserver`, a
  Chrome origin trial from version 129, not yet a standard), Volti would hear of PDFs added,
  removed, renamed or changed in the scores folder (recursively) as it happens, and update the
  list quietly, reading only what changed. Feature-detected (`'FileSystemObserver' in self`),
  with reading the folder again as the fallback. Waiting for it to be standardised.
- **Read only the parts of a PDF that are needed:** open originals through a range transport
  (`PDFDataRangeTransport`, slices of the File) instead of copying the whole file to pdf.js;
  saves some of the ~0.65 s pdf.js spends copying and parsing a 42 MB scan.
- **Check a PDF's password from its encryption dictionary, without pdf.js:** where an encrypted
  PDF's password is checked by opening it with pdf.js (once per file), check it from `/Encrypt`
  alone: `/U` and `/O` let a guess be tested with a few hashes (revisions 2–4 with the trailer's
  `/ID`, AES-256 revisions 5–6 by salted SHA-256), `''` included.
  - Our pdf-decrypt fork already has the checks (`validateUserPasswordRC4`,
    `validateOwnerPasswordRC4`, `validateUserPasswordAES256`, `validateOwnerPasswordAES256`), but
    feeds them from a whole-file pdf-lib parse (`readEncryptParams`). The fork would export them
    taking plain values, with a small reader of the dictionary.
  - The hard part is finding the dictionary: the last trailer's `/Encrypt n g R` (in an xref
    stream's dictionary for PDF 1.5+), then `n g obj`, which may be anywhere in the file (never in
    an object stream), with `/O` and `/U` as literal or hex strings.
  - It saves one pdf.js open per encrypted file, ever, and must agree with pdf.js on odd files:
    keep the pdf.js open as the fallback where the reader can't tell. Only worth it if the first
    tap on an encrypted PDF is noticeably slow.
- **Synthetic pages** (systems arranged by hand), **jump markers** (D.S., coda) that generate the
  played order, and **tags** for search.
- **Named excerpts from the PDF's bookmarks** (outline), made the first time a score is opened.
- **A new edition of an original:** replacing a score's PDF isn't supported, as cuts and ink refer
  to page positions.
