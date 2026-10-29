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

## Manual check

Things to try on the tablet, grouped so each group can be done in one go. Some groups need
DevTools (Application → IndexedDB → `volti-scores` → `kv`) to watch the records.

- **Reading, with any score open** (no setup):
  - Turning: the page turns as the finger goes down, at the sides with the toolbar hidden; with it
    showing, only in the shaded band at each side (a cut tab there still takes the press first),
    and a tap elsewhere hides the toolbar. The chevron at the toolbar's right end hides it.
  - The pen: nothing turns while the pen is down or just after it lifts, and turning no longer
    puts the pen away. Watch for a palm landing in a band before the pen touches, and a pinch or
    pan whose first finger lands in a band: they turn the page.
  - Writing with the pen and erasing, zoomed in and out, with the palm resting. Editing cuts by
    long press and by dragging tabs.
  - Drawing: reading, turning quickly, zooming in and out and close-ups look as before, on a PDF
    and on a phone photo. Rotate the tablet: pages show at once, soft, then sharpen. Turn quickly:
    no page from an earlier screen flashes onto a later one.
  - Thumbnails: the excerpt picker on a long score, the cut editor's insert picker and the
    incoming screen's preview each fill at once, then sharpen.
  - A phone photo shows upright, and sharp at every width and in the zoomed close-up.
  - Opening times: how long the first page of a large PDF and of a large photo takes, and turning
    to and zooming in on a big photo.
  - A long setlist doesn't run the tablet out of memory.
  - With a setlist whose pages aren't all saved yet (the library shows it saving), open a PDF
    score: its first page shows as quickly as with nothing saving.
  - In the installed app, with the tablet in landscape, let a setlist of portrait PDF pages finish
    saving, then turn on airplane mode and play it: each page is sharp at once, with no blurred
    stand-in first.
- **Full screen at the tap:**
  1. With the scores folder open, open a PDF score, an image score and a setlist from the library:
     full screen starts at the tap, and the first screen shows once, at full size, with no jump.
  2. Close Volti so the scores folder locks (the library says so), then open a score: access is
     asked for and the score opens (going full screen as late as before, or not at all if Chrome
     refuses it). Open a setlist while locked: it goes full screen at the tap.
  3. A score that fails to open (refuse its password): the library shows again, not in full
     screen, at the place it was scrolled to.
  4. Going back to the library still leaves full screen, at the place it was scrolled to.
- **A PDF that opens without a password is marked checked by any read:** with a setlist holding a
  PDF not opened since PDFs stopped going through pdf-lib, restart Volti and wait for the setlists'
  pages to finish saving; then open that score from the library: it opens without the first-open
  lag.
- **Reader's middle tap and band icons:**
  1. With the toolbar hidden, press near the left and right edges, and just inside 40% from each
     side: the page turns as the finger goes down.
  2. Tap the middle: the toolbar shows. Drag or long-press in the middle: nothing happens.
  3. There is no button at the top right; the back arrow at the top left still goes to the
     library.
  4. With the toolbar showing, each band shows its triangle, centred, over both dark stage and
     white paper. Tapping a band turns the page, and the pen writes in a band as before.
  5. With a pen tool selected and the toolbar hidden, the pen in the middle shows the toolbar
     rather than writing.
- **Reading PDFs without pdf-lib:**
  1. Open a large unencrypted PDF that isn't saved yet: its first page shows noticeably sooner
     than before.
  2. Add an encrypted PDF with a user password: the password is asked for once; a wrong one asks
     again, saying so. Close and open it again, and after a restart: not asked.
  3. Open a PDF that is encrypted with only an owner password (it opens in Chrome without one): no
     password is asked, and it shows.
  4. A setlist with an encrypted PDF never opened: the setlists section says it needs its
     password; opening the score asks for it, and then its pages are saved.
  5. Export a score from each of 2 and 3, and from a PDF whose encryption pdf-decrypt doesn't
     know (if one is at hand): the export works, or for the last says why it is pictures.
- **Passwords and unusual PDFs:**
  - No lock icon anywhere.
  - A password-protected PDF asks for its password the first time it is opened, previewed in the
    incoming screen, or added to a setlist (from a score's ⋯ menu or Add scores; Cancel leaves it
    out), then never again. One that only stops printing doesn't ask.
  - Ones from Acrobat (often AES-128, even when they only stop printing) and ones with a password
    open sharp.
- **Exporting:**
  - With no folder linked, it goes to the share sheet. With a folder linked, it goes into Exports,
    and asks for write access when Export is tapped if it isn't allowed yet.
  - Open an export in another PDF app (Acrobat, Xodo, the browser): the pen (thicker where pressed
    harder) and highlighter (notes under it still black) look as in Volti, and the app lists them
    as annotations it can hide or delete.
  - Plain PDFs, password-protected and Acrobat ones, and photos export at "Original quality". A
    turned JPEG says it was recompressed.
  - A PDF with an encryption pdf-decrypt doesn't know exports with its pages drawn as sharp as in
    the reader, and the dialog says it was rasterized.
- **Starting with no folder linked** (a fresh install, or after unlinking):
  - Add two PDFs with Add PDFs. The incoming screen shows each file's pages (pinch and drag), its
    name and folder (and one folder for all), and New, Already in the library (left out, saying
    where), or a path taken (another name or folder, or Replace).
  - They go at the top of Volti's own folder, with two `original:` records whose `where.kind` is
    `internal`. Opening one gives its record `aspects`. No Added badge anywhere.
  - Move and rename them.
- **Linking a folder** (straight after the group above):
  - Link a folder holding one of the same PDFs, one new one, and one whose name matches a
    different file in Volti's own folder.
  - The scores in Volti's own folder move into it at their paths (in the Files app too). The one
    the folder already has is dropped: its record becomes `folder`, and its file is gone from OPFS
    `library/`. The one whose name is taken opens the incoming screen. Leave it out: the library's
    ⋯ menu offers "Move the score left in Volti…" to open it again.
  - On a big folder, the library shows at once with the scores already known, and new ones appear
    one by one with "Reading new scores: n left…". Each is hashed once: reload, and nothing is
    hashed again.
  - Rename and move a score from the app: its `path` changes, and nothing is hashed again.
  - Duplicates: copy a PDF in the folder under another name. The library shows it once, and the
    record keeps the old path. Delete the original copy and check the folder: the record moves to
    the copy's path.
  - Add a PDF to the folder in the Files app, and switch back to Volti after half a minute or more:
    it appears without asking.
  - Unlink: the library is empty. Relink the same folder: scores, markings and setlists are back,
    and nothing is hashed again. Link a different folder: the old folder's records become `gone`.
- **Removing and putting back:**
  - Remove a score from its ⋯ menu, in the library and in the reader. Its file leaves the folder
    (gone in the Files app too), its record is `removed`, and the file is in OPFS `removed/`.
  - The library's ⋯ menu lists it under Recently removed. Put back puts it where it was, with its
    cuts and markings: the record is `folder` again, and `removed/` is empty.
  - Putting back a file whose place is now taken opens the incoming screen for it.
  - The storage view shows Trash.
  - Purge: set a removed record's `removedAt` to 8 days ago in DevTools and reload. The record is
    `gone`, its bytes are deleted, and it has left the list.
- **Sharing from another app** (Android):
  - Share a PDF while Volti is closed. Its record is `inbox`, with bytes in OPFS `inbox/`. Open
    Volti: the incoming screen shows it. Cancel: it's in Recently removed. Share it again: it's in
    the inbox again, and `removed/` no longer has it.
  - Share a PDF the library has: nothing changes, and no inbox entry appears.
  - With no folder linked, a shared file goes at the top of Volti's own folder. With one linked, it
    goes at the top of the folder (in the Files app too).
- **After a restart, before tapping Allow access** (folder linked):
  - The library lists the folder's scores from their records.
  - Shared files wait, and are added once Allow access is tapped.
  - These each ask for access themselves: opening a score, adding a password-protected one to a
    setlist, opening one for a dialog (Add excerpt), and renaming or moving one. Refusing says so.
    Allowing goes on, and the library reads the folder again.
  - Play a setlist whose pages are saved: it opens without asking. Turn the tablet: its pages show
    soft, from the saved ones. Edit cuts and Export ask for access, and Allow access redraws
    sharp.
  - The storage view shows Setlist pages and Page cache as two parts.
- **A setlist with a score whose file is gone** (delete one score's PDF in the Files app, then
  check the folder): rotate the tablet while playing the setlist. The gone score's pages show
  soft, from the saved ones. "Not saved for this screen" shows only for a page with nothing saved
  at all.
- **On a device that had an earlier version:**
  - After the first start, the old keys and the `volti` database are gone, and scores, ink and
    setlists are all still there.
  - A folder linked before the storage change is still linked (`folder` held a bare handle then).

## Confirmed features which require more thought

- **After the split into source files and originals**, left as they were for now: the library
  shows one row per id, the first copy of two identical files (one source file per id in the
  root); an image's decoded bitmap is held while its pages are open (about 48 MB for a 12 MP
  photo) rather than decoded again at each width; setlists save pictures of images as of PDFs; a
  removed file isn't read to preview it in Recently removed; and there is no way yet to take a
  PDF's password off as it comes in (a copy kept without it, by choice), which would leave Volti
  nothing to remember.
- **The cache giving room back when the origin runs short of quota** [needs thought]: pinned
  pages are never evicted and the others only to stay within 30% of the quota; nothing shrinks the
  cache when the origin as a whole (scores added, metadata) runs out of room.
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
- **Showing whether storage is persistent:** `main.ts` asks for it (`navigator.storage.persist()`)
  at each start and ignores the answer, and nothing shows it. Chrome grants it by itself, mostly
  to an installed app; in a browser tab it may not, and then Volti's own folder (scores added
  without a linked folder), and the cuts, markings and setlists, can be cleared when the tablet
  runs low on space, without a word. The storage view could say whether it is
  (`navigator.storage.persisted()`), and where it isn't, suggest installing Volti (Add to home
  screen). Where it is, the page cache's 30% of the quota is room only Volti gives back (see the
  item on the cache giving room back).
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
- **The first open of a PDF still lags** [needs thought]: opening a score is much faster since
  PDFs skip pdf-lib, but the first time a file is opened since then is still noticeably slow, even
  for files opened before, whose aspects are stored. For those, what only the first open does is
  `readPdf`'s check (`originals/_pdf-source.ts`): `f.file()`, then `encrypted`, which reads the
  file's first and last 64 KB (and for an encrypted one, a pdf.js open to check its password).
  - Reading 128 KB should be quick; the suspicion is the last 64 KB. A file in the linked folder
    is read through Android's storage framework, which may get to its end by reading through the
    whole file. To be confirmed on the tablet: time `encrypted` alone against reading the whole
    file. (Before pdf-lib was dropped, every open paid this, unnoticed among the rest.)
  - For a file never opened, `Original.aspects()` (`originals/original.ts`) also opens the PDF in
    pdf.js to measure every page (see "`Original.aspects()` opens the pages outside the shared
    source" above), and no page of it is saved yet.

  The idea: inspect a file as it arrives (found in the scores folder when it is read, shared to
  Volti, or added), in the background, so its password check (and its aspects) are stored before
  it is first opened.
  - A background check may store `''` for a PDF that needs no password; one that needs a password
    stays unchecked until it is tapped, as it can't be asked for.
  - To work out: where arrivals are noticed (`library-files.ts`'s reading of the folder, the
    inbox, adding scores); how files already in the library, never checked, get checked; and how a
    burst of new files (a folder linked for the first time) is paced so it doesn't hold up the
    library or the reader's draws.
  - If the end of the file is what is slow, whether the check can do without it: a linearized PDF
    names `/Encrypt` near its start too, but an ordinary one only at its end.
- **The reader shows its first screen twice** [needs thought]: a `ResizeObserver` reports the
  stage's size as soon as it starts watching (`observer.observe` at the end of `Reader`'s
  constructor, `reader/reader.ts`), so 150 ms after opening a second `show()` runs. It asks for
  the same widths, which the cache now holds, so it costs little, but it redraws the screen for
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
