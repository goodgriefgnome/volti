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

- **A setlist plays a score whose file is gone, from its saved pages.** Today an entry whose
  score isn't in the library is "Can't find" (`setlistItems` sets `missing: !original`,
  `reader/_reading.ts`, and `OpenScores.ensure` gives up on an item without an `original`,
  `reader/_open-scores.ts`). Yet everything needed is kept: a `gone` record keeps `aspects` and
  `path` (STORAGE.md), the score and its ink stay, and the offline keeper keeps the setlist's
  pages pinned in the page cache. One commit.
  - **`originals/types.ts`:** split what can be drawn out of `Original`:
    ```ts
    /** What can be read of an original: its page shapes, and its pages drawn. */
    export interface Pages {
      readonly id: string;
      aspects(): Promise<number[]>;
      draw(page: number, pxWidth: number, options?: DrawOptions): Promise<Drawn>;
      drawProgressive(page: number, pxWidth: number, options?: DrawOptions): AsyncIterable<Drawn>;
      /** False when only the pages saved in the page cache can be drawn. */
      readonly whole: boolean;
    }
    export interface Original extends SourceFile, Pages { pdf(): Promise<RenderedPdf> }
    ```
    `FileOriginal` (`originals/original.ts`) has `whole = true`.
  - **`originals/original.ts`:** add
    ```ts
    /**
     * An original's saved pages, by id, whether or not its file can be read: drawn only from the
     * page cache. Null when its page shapes aren't known or none of its pages is saved.
     */
    export async function savedPages(id: string): Promise<Pages | null>
    ```
    - `aspects` comes from `knownAspects(id)`, and `hasSaved(id)` says whether any page is saved.
    - `draw` is `drawPage` with no `source`, as the fallback in `openPages` does now.
    - `whole` is false.
    - **Its `drawProgressive` ends quietly** after yielding at least one stand-in, when the exact
      draw then throws `NotSaved`. A missing exact page is expected for these objects. If it
      yielded nothing, it rethrows `NotSaved`. This applies only to the objects `savedPages`
      returns: `FileOriginal.drawProgressive` and the page cache don't change.
  - **`reader/_open-scores.ts`:**
    - `openPages(id: string, o: SourceFile | undefined, ask: boolean)`:
      1. With `o`, read it, as now.
      2. With no `o`, or when reading throws `NoAccess` or `PasswordNotGiven`, use
         `savedPages(id)`. Its `draw` and `aspects` replace the inline fallback there today.
      3. If that is null, throw: the error from reading, or, with no `o`, a new `FileGone` error
         (`class FileGone extends Error { name = 'FileGone' }`, in this file).

      It returns `readable: pages.whole`. Fix the two callers in `reader/reader.ts`.
    - `OpenScore.original` becomes optional.
    - `OpenScores.ensure` no longer returns early for an item without an `original`. Passing
      `it.original` (maybe undefined) to `open`, `FileGone` marks the item `missing`, as other
      failures do.
    - `Item` gains `fileGone?: boolean`: no file in the library, so its saved pages are all it can
      show.
  - **`reader/_reading.ts`:** `setlistItems` sets `fileGone: !original` and no longer sets
    `missing`.
  - **`reader/reader.ts`:**
    - `showUnread` and `blankBox` (`reader/_setlist.ts`) take a reason,
      `'access' | 'missing' | 'unsaved'`, instead of the `needsAccess` boolean:
      - `'access'` is today's needs-access card and toast
      - `'missing'` is "Can't find"
      - `'unsaved'` labels the box "Not saved for this screen", with the toolbar info "Not saved"
        and no toast
    - In `show()`, a `NotSaved` on a `fileGone` item is `'unsaved'`. On any other item it stays
      `'access'`, as now.
    - `allowAccess()`: for a `fileGone` item, don't offer access (it wouldn't help). Say "The
      file for this score is gone, so only its saved pages can be shown." and return false. Editing
      cuts and choosing an excerpt go through `withAccess`, so they are refused with that message.
  - **Menus:** an item with no `original` offers no file operations (rename, move, remove,
    export). `npm run build` finds each place once `OpenScore.original` is optional.
    `_toolbar-menus.ts:281` already leaves such items out of exports.
  - **Known gap:** the reader draws with `draw`, which shows only pages saved at exactly the width
    asked for. The offline keeper saves the widths for the current window size and orientation
    (`readPageWidths`), so this works as long as the tablet is held as it was. After rotating, the
    pages of a gone file show "Not saved for this screen". The next item, progressive drawing,
    closes the gap.
  - **Tests:** `reader/_reading.test.ts`: `setlistItems` marks an entry with no original
    `fileGone`, not `missing`. `savedPages` and the reader need the page cache and IndexedDB, so
    they are checked by hand.
  - **Manual check** (add under Manual check):
    1. Make a setlist of two scores and let its pages save offline (open it once).
    2. Delete one score's PDF from the linked folder, and check the folder.
    3. Play the setlist: the gone score shows from its saved pages, with its title.
    4. Editing cuts or choosing an excerpt on it says the file is gone.
    5. Rotate the tablet: its pages say "Not saved for this screen". Rotate back: they show again.
- **The reader and thumbnails draw progressively.** Do this after the item above: it relies on
  `Pages` and `savedPages`. Today every caller draws with `draw`, exact widths only, and waits
  for it. `drawProgressive` (`page-cache/cache.ts`, `drawPageProgressive`) first yields a
  stand-in, the closest width held or saved (`exact: false`), then the exact page. A stand-in
  paints correctly as it is:
  - `drawFrame` scales a page canvas of any width to the slot (`render/paint.ts`)
  - ink is painted on its own layer, in page fractions (`paintSlotInk`, `reader/_spread.ts`)

  This also closes that item's known gap: after rotating, a gone file's pages show their
  stand-ins, because `savedPages`' `drawProgressive` ends quietly. One commit.
  - **Opening:** `openPages` (`reader/_open-scores.ts`) also returns
    `drawProgressive: (page, pxWidth, options?) => AsyncIterable<Drawn>`, from the `Pages` it
    opened. `OpenScore` gains `drawProgressive?` next to `draw`: set and cleared with it, in
    `open`, `accessAllowed`, `keepNear` and `destroy`. `ReaderView` (`reader/_view.ts`) gains
    `drawProgressive()`.
  - **The main screen** (`show()`, `reader/reader.ts`):
    - Draw each page with `drawProgressive`, at `priority: 'now'` as now.
    - Paint the screen once every page has its first yield, stand-in or exact. Then, as each
      exact page arrives, put it in `this.pages` and repaint the slots that show it
      (`this.paint(s, this.state)`).
    - Every repaint checks `seq !== this.seq` first, so a later screen is never overwritten by an
      earlier one's pages. When `seq` moves on, stop iterating: the `ahead` abort already stops
      the draws.
    - **A failure with no yield at all** is handled as now (`NoAccess`, `NotSaved`, or "Could not
      draw this page").
    - **A failure after a stand-in** keeps the stand-in on the screen. Log the error, and set
      `this.toolbar.info` to "Could not draw this page".
    - There is no marker on a stand-in: it sharpens when the exact page arrives. A gone file's
      stand-in stays slightly soft.
  - **Unchanged, exact only:** `predraw` (it only warms the cache) and the close-up
    (`reader/_detail.ts`), which exists to be sharp. For a gone file the close-up doesn't
    sharpen; that is fine.
  - **The cut editor's thumbnails** (`reader/cuts/`):
    - `EditorHost.thumb(page, width): Promise<HTMLCanvasElement>` becomes
      `thumbs(page, width): AsyncIterable<HTMLCanvasElement>` (`_host.ts`). The reader gives it
      from `drawProgressive` (`reader.ts:181`).
    - `thumbCanvas` (`_thumbs.ts`) draws each yield into its canvas as it comes, while the
      dialog is open.
    - `_insert-picker.ts`, which draws thumbnails one after another, waits for each page's
      generator to finish before the next, as it waits for `thumb` now.
  - **`ThumbStrip`** (`dialogs/thumb-strip.ts`), used by the excerpt picker, opening a score and
    the incoming screen:
    - `ExcerptSource.page(page, w): Promise<HTMLCanvasElement>` becomes
      `pages(page, w): AsyncIterable<HTMLCanvasElement>`.
    - Its three makers give it from `drawProgressive`: `library/_incoming.ts` and
      `dialogs/open-score.ts` from the `Original`, and `reader/_toolbar-menus.ts` from
      `OpenScore.drawProgressive`.
    - The strip's first draw becomes two passes:
      1. **Stand-ins,** every frame in order: take each page's first yield only, then stop
         iterating it (`return()` on the iterator), and paint the frame if every page gave
         something. The strip shows at once.
      2. **Exact,** every frame in order, as `draw(i, w)` does now: iterate each page to its
         last yield, and paint the frame from the last canvases.
    - Zoom redraws (`redraw`) use the second pass only.
    - A frame whose page fails in pass 2 keeps what pass 1 painted.
  - **Tests:** none new. Drawing needs the page cache and the DOM. `npm run build` finds every
    caller of the changed signatures.
  - **Manual check** (add under Manual check):
    1. Open a score, rotate the tablet: pages show at once, soft, then sharpen.
    2. Turn pages quickly: no page from an earlier screen flashes onto a later one.
    3. Open the excerpt picker on a long score: the strip fills at once, then sharpens.
    4. The same with the cut editor's insert picker, and the incoming screen's preview.
    5. With the previous item's gone file: rotate in its setlist, and its pages show (soft)
       instead of "Not saved for this screen".
- **Each setlist's row shows how much of it is saved for offline: a ring by its ⋯ button.**
  Mock-up C at https://claude.ai/artifact/6rNbsaf5VYmBqJZERRrcRC.
  - The ring fills (green, `--part-setlists`) as the setlist's pages save.
  - It becomes a filled green circle with a tick when every page is saved.
  - It becomes a dashed warning ring with "!" when the keeper has finished but some pages can't
    be saved.

  Today `keepPagesOffline` reports one `{ done, of }` for all setlists together, and nothing shows
  it. One commit.
  - **The page cache says which pages are saved** (`page-cache/types.ts`, `page-cache/cache.ts`):
    ```ts
    export interface OfflineKey { id: string; page: number; pxWidth: number }
    export interface OfflineProgress {
      done: number; of: number;
      /** Pages saved since the last progress: on the first, every page already saved. */
      saved: OfflineKey[];
    }
    ```
    `keepRun` fills `saved`: on its first yield, the pages it found saved already; then each page
    as it is written. When the generator ends, every page not in any `saved` is one it couldn't
    save (its score has no `source`, or drawing it failed). Nothing else changes in the cache.
  - **A pure file for the status, `library/_offline-status.ts`** (**Pure**, with a test):
    ```ts
    /** Why a score's pages can't be saved now. */
    export type Blocked = 'access' | 'password' | 'missing';
    export type OfflineStatus =
      | { kind: 'saving'; done: number; of: number }
      | { kind: 'ready' }
      | { kind: 'blocked'; done: number; of: number; why: Blocked; title: string }; // title: the first blocked score's
    /**
     * Each setlist's status, from the pages each needs (keys as `${id}/${page}/${pxWidth}`), the
     * pages saved so far, whether the keeper has finished, and why each blocked score is blocked.
     */
    export function offlineStatus(needs: ReadonlyMap<string, readonly string[]>, saved: ReadonlySet<string>, finished: boolean, blocked: ReadonlyMap<string, { why: Blocked; title: string }>): Map<string, OfflineStatus>
    ```
    - All pages saved: `ready` (even while the keeper is still running).
    - Otherwise, while running: `saving`.
    - Otherwise, once finished: `blocked`, with the reason of the first score in the setlist
      whose pages are missing. If that score isn't in `blocked` (drawing failed), use `'missing'`.

    Test those three cases, a page needed by two setlists counting for both, and an empty
    `needs` list (no status).
  - **`library/_offline-pages.ts`:**
    - `make()` already works out each score's pages. It also builds `needs` per setlist (the keys
      of every page its entries play), and `blocked` per score:
      - no file in the library: `'missing'`
      - `read()` throws `NoAccess`: `'access'`
      - `read()` throws `PasswordNotGiven`: `'password'`

      Today it swallows that error with `.catch(() => undefined)`. Keep swallowing it, but note
      the reason.
    - A score whose aspects are unknown (the `keep` list) has no pages to count. Its setlist is
      `blocked` with that score's reason until it is opened once.
    - `keepSetlistPagesOffline` gains a third argument, `heard: (s: Map<string, OfflineStatus>) =>
      void`. It is called after each progress, at most every 250 ms, and once when the run ends
      (`finished` true).
    - Archived setlists aren't kept, so they get no status.
  - **`library/library.ts`:** keep the latest map as `offline: Map<string, OfflineStatus>` (on
    `LibraryHost`, `library/_host.ts`). Pass `heard` to both calls of `keepSetlistPagesOffline`.
    On each update, call `setlistsSection.showOffline()` rather than re-rendering the list.
  - **`library/_setlists-section.ts`:**
    - Each row with a status gets a ring button (`button('', …, 'quiet ring')`, 44 px wide, the
      22 px ring drawn in an inline SVG) between the row's `open` button and its `more` button.
    - Rows with no status (empty, archived, or before the first progress) get none.
    - `showOffline()` updates each row's ring in place, without rebuilding the rows. Keep each
      ring element by setlist id.
    - The SVG is as in the mock-up:
      - `saving`: a `--line` track, with a `--part-setlists` arc of `done / of`
      - `ready`: a filled `--part-setlists` circle with a white tick
      - `blocked`: a dashed `--warn` ring with "!"
    - Its `aria-label` is the toast's words (below).
    - Tapping it says in a toast:
      - saving: "18 of 40 pages saved for offline."
      - ready: "Ready to play offline."
      - access: "Volti needs access to the scores folder to save the rest (22 pages)."
      - password: "“<title>” needs its password before its pages can be saved."
      - missing: "“<title>” can’t be found, so 6 of its pages can’t be saved."
    - CSS in `styles/library.css`: `.ring` and its parts, using the existing tokens, so both
      themes work.
  - **Manual check** (add under Manual check):
    1. Make a new setlist with three scores: its ring fills, then turns into a tick.
    2. Reload: the tick shows straight away (pages already saved).
    3. Add a score: the ring goes back to filling, then a tick.
    4. Reload with the linked folder locked, after adding a score never opened: that setlist's
       ring is the warning ring. Tapping it says Volti needs access.
    5. Archive a setlist: it has no ring.
    6. Check both themes.

## Manual check

Things to try on the tablet.

- **Excerpts, one word for both:** name an excerpt of a score (Excerpts → Add excerpt), reload: it is
  still there, and plays the same pages. Play it from the library and from a setlist entry, change
  its cuts, and add it to a setlist. On a device that had named excerpts from before this change,
  they are gone (dropped, not migrated).

- **Storage (`STORAGE.md`):** open DevTools → Application → IndexedDB → `volti-scores` → `kv` to watch the records as you go.
  - **Fresh start, no folder linked.** Add two PDFs with Add PDFs. There are two `original:`
    records with `where.kind` `internal`. Open one: its record gains `aspects`.
  - **Password.** Add a password-protected PDF and open it. The record gains `password`. Reload
    and open it again: you aren't asked.
  - **Link a folder** holding one of the same PDFs and one new one. The shared one's record becomes
    `folder`, and its file is gone from OPFS `library/` (DevTools → Application → Storage, or log
    `_internalFiles()`). The new one is hashed once. Reload: nothing is hashed again (no "Reading
    new scores").
  - **Duplicates.** Copy a PDF in the linked folder under another name. The library shows it once.
    The record keeps the old path. Delete the original copy and check the folder again: the record
    moves to the copy's path.
  - **Rename and move** a score from the app: `path` changes, and nothing is hashed again.
  - **Remove** a score: the record is `removed`, and the file is in OPFS `removed/`. Recently
    removed lists it. Put it back: the record is `folder` again, and `removed/` is empty.
  - **Share** a PDF from another app (Android) while the app is closed. Its record is `inbox`, with
    bytes in `inbox/`. Open the app: the incoming dialog shows it. Cancel: it's in Recently removed.
    Share it again: it's in the inbox again, and `removed/` no longer has it.
  - **Share** a PDF the library has: nothing changes, and no inbox entry appears.
  - **Unlink and relink the same folder:** nothing is hashed again. **Link a different folder:**
    the old folder's records become `gone`.
  - **Locked folder:** reload with the folder linked, before allowing access. The library lists
      the folder's scores from their records.
  - **Missing score title:** delete a PDF in the linked folder that is in a setlist, then check
      the folder. Its record is `gone`, and the setlist still shows its title.
  - **Last read.**
      - Open score A and turn a few pages, back to the library, open A again: same place.
      - Open B, then A again: A starts at the beginning.
      - Play a setlist, turn into its second entry, close and reopen the app, play it again: same
        place.
      - Tap one entry of the setlist instead: it starts at that entry. Turn a page, go back, and
        play the setlist: it resumes there.
      - Open an excerpt of A from the library, turn a page, go back, open it again: same place.
        Then open A itself: it starts at the beginning. Then the excerpt again: its beginning too.
  - **Purge.** Set a removed record's `removedAt` to 8 days ago in DevTools and reload: the record
      is `gone`, and its bytes are deleted.
  - **Old data.** On a device that had the previous version, after the first start the old keys
      and the `volti` database are gone, and scores, ink and setlists are all still there.

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
