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

- **No tagline**: the library's masthead shows "Volti" and the tagline "volti subito · turn the
  page" (`library/library.ts:81`). Remove the tagline: the `p.tagline` element there and the
  `.tagline` rule in `styles/library.css`; the masthead is then the name and the folder's tools.
- **No dialog scrolls sideways**: a dialog scrolls in both directions (`.dialog`, `overflow: auto`,
  `styles/ui.css`), so anything in it wider than its inside makes the whole dialog scroll left and
  right. Seen on a phone in portrait in the face gestures dialog while naming a new gesture, and
  reproduced in Chromium at 320 to 350 px wide: the naming row (`.face-add`: the field, Add,
  Cancel) widens the dialog to 447 px, because a field's natural width (about 20 characters) counts
  toward its row's smallest width even with `min-width: 0`, and the dialog's column grows to it.
  With the first part below applied in the browser, the dialog stays 304 px at 320 wide and the
  field shrinks. Also at 360 px, a gesture's trials table with a channel shown (three numbers) is
  45 px too wide. Make a dialog's content always fit its width:
  - **The dialog's column can't be widened by its content.** `.dialog` is a grid with one implicit
    `auto` column, which grows to its widest child's smallest width. Give it
    `grid-template-columns: minmax(0, 1fr)`, so the column is the dialog's width and its children
    shrink to it. Also give `.dialog` `overflow-wrap: anywhere` (inherited), so a long file or
    gesture name breaks instead of pushing out. In a flex row in a dialog, the item holding a name
    needs `min-width: 0` to be allowed to shrink: check `.removed-row`, `.marking-colors-row`,
    `.pick-row`, `.face-named`, `.face-play-text` and `.incoming-fields`, and add it where missing.
  - **Layouts inside a dialog follow the dialog's width, not the screen's.** Make `.dialog` a size
    container: `container: dialog / inline-size` (its width never depends on its content, so this
    is safe). Turn the two screen-width rules that lay out dialog content into container queries,
    at the content width the screen width gave: `.face-ft`'s `@media (max-width: 560px)`
    (`styles/face.css`) becomes `@container dialog (width < 512px)`, and `.incoming-row`'s
    `@media (max-width: 600px)` (`styles/library.css`) becomes `@container dialog (width < 552px)`.
  - **The face trials table gets a narrow layout.** Its row (`.face-trials .tr`, `styles/face.css`)
    is a switch (44 px), the trial's number (2em), the trace (at least 60 px) and three numbers
    (4.4em each): about 390 px with its gaps, wider than a phone's dialog (about 327 px inside).
    Under `@container dialog (width < 400px)`: the columns become `44px 2em repeat(3,
    minmax(0, 1fr))` (`repeat(2, …)` for `.two`), the trace cell moves to a second line under the
    numbers (`.trace-cell { grid-row: 2; grid-column: 2 / -1; }`), and the head row's "trace" label
    (its third child, `face/_trials.ts:85`) is hidden.
  - **A gesture's head keeps its name readable.** At 360 px a gesture's head (`.face-view-head`:
    back, the name and its pencil, the direction, Delete…) squeezes the name to a few letters a
    line ("Rais / e / bro / ws"), as `.face-named` has `flex: 1` and `min-width: 0`. Give
    `.face-view-head .face-named` `flex: 1 1 8em` and `min-width: 8em`, so the row wraps the
    direction and Delete… to a second line before the name gets narrower than that.
  - **Strips scroll inside themselves.** The thumbnail strips (`.thumbnails`, `styles/base.css`)
    already scroll sideways in their own box; with the column fixed above they stay inside the
    dialog. Nothing else in a dialog may be wider than it.
  - The styles test: no `@media (max-width` in `ui.css`, `dialogs.css`, `face.css` or
    `library.css` (after the two above, none is left; only `reader.css`'s toolbar has one). Its
    message says content in a dialog uses `@container dialog`; add that rule to `STYLES.md`.
  - Check: with Playwright at 360 × 640 and 640 × 360, open every dialog (add a PDF first, made with
    pdf-lib, so Add scores, the Excerpt picker, the insert dialog, Export and importing can open;
    record a face gesture's trials by setting them in storage if the camera can't), and for each
    compare `scrollWidth` with `clientWidth`: none is wider. Then look at the face trials table and
    a channel's row at 360 wide.
- **A dialog's sticky bars cover its whole width**: in a dialog that scrolls, the bar of buttons at
  the bottom stays in sight (`.dialog .buttons`, `position: sticky`, `styles/ui.css`), and content
  scrolls under it. But the bar is only as wide as the dialog's content, not its padding, and the
  focus ring of a field (`:focus-visible`, `outline: var(--focus); outline-offset: 2px`,
  `styles/base.css`) reaches 5 px past the field into that padding. So a focused field scrolled
  under the bar shows the side of its ring beside the bar, as in the face gestures dialog with the
  keyboard up, while naming a gesture (seen on a phone; reproduced in Chromium at 640 × 360).
  Make the bar as wide as the dialog: `margin-inline: calc(-1 * var(--pad)); padding-inline:
  var(--pad);` on `.dialog .buttons` (the dialog's `--pad`, `styles/ui.css`). The face dialog's
  sticky head at the top (`.face-view-head-slot`, `styles/face.css`) has the same shape: give it
  the same. Check: in the face gestures dialog at 640 × 360, add three gestures, tap Add gesture…,
  focus the name field and scroll it under the bar: nothing of the ring shows beside the bar; open
  a gesture with a field and scroll it under the head: the same.
- **The reader's toolbar: two rows, or one on a short screen; back and ⋯ pinned**: today below
  680 px wide the tools take a row of their own that can't wrap, so on a phone they run off the
  screen and can't be reached; and the first row can wrap ⋯ onto a line of its own when the title
  is long. The toolbar's DOM (`reader/_toolbar.ts`, the constructor) is `.bar-main` holding
  `.group.left` (the back arrow and the title block), `.group.tools` (the tools, Cuts, Undo and
  Redo) and the ⋯ button (`.more`); its rules are in `styles/reader.css` (`.bar-main`,
  `.bar-main > …`, and the `@media (max-width: 679px)` block, which goes). The new layout:
  - **Which layout, by the screen's height.** Two rows take 112 px (two rows of `--control`, the
    8 px between them and the bar's 8 px padding above and below). Where that is more than a fifth
    of the screen's height, below 560 px tall (a phone in landscape), the toolbar is one row;
    otherwise it is two, at any width (a tablet too). In CSS: the two-row rules apply by default,
    the one-row rules under `@media (max-height: 559px)`, with a comment saying where 560 comes
    from. It changes by itself when the phone turns.
  - **In both, the back arrow is pinned at the left of the first row and ⋯ at its right.** Give the
    back button a class, `bar-back` (`this.button('close', '', act.close, 'bar-back')`), to place
    it; `.bar-main > .left { display: contents; }` in both layouts, so the back arrow and the
    title block are children of `.bar-main` themselves.
  - **Two rows**: `.bar-main { display: grid; grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas: "back title more" "tools tools tools"; gap: var(--space-2); }`, with
    `grid-area` set on `.bar-back`, `.title-block`, `.more` and `.tools`. The first row is the back
    arrow, the title and ⋯; the title shrinks to fit between them (it already cuts itself short
    with an ellipsis; `min-width: 0`), so ⋯ never moves. The second row is the tools.
  - **One row**: `.bar-main { display: flex; flex-wrap: nowrap; overflow-x: auto; }`. The back
    arrow `position: sticky; left: 0;` and ⋯ `position: sticky; right: 0;` (both `z-index: 1;
    background: var(--bar);`), so they stay at the ends while the title and the tools between them
    scroll sideways. The title block and the tools `flex: none` (the title at its own width, up to
    its 32ch); ⋯ `margin-inline-start: auto`, so it sits at the right end when everything fits.
  - **The row with the tools scrolls sideways when they don't fit**: in two rows, the tools' row
    (`.bar-main > .tools { flex-wrap: nowrap; overflow-x: auto; }`); in one row, the whole row as
    above. Either scroller: `overscroll-behavior: contain; touch-action: pan-x; scrollbar-width:
    none;` (and `::-webkit-scrollbar { display: none; }`). The tools stay centred when they fit and
    start at the left edge when they don't: instead of `justify-content: center`, give the tools'
    first and last children `margin-inline-start: auto` and `margin-inline-end: auto` (auto margins
    never push content out of reach, where centring would). A button cut part-way at an edge is
    the sign there is more. Cuts keeps showing only its icon below 680 px wide
    (`.bar .cuts-button .label`), now in a media query of its own.
  - A long press on a tool (its panel, `ui/long-press.ts`) is cancelled when the press turns into a
    scroll (the browser sends `pointercancel`), so scrolling never opens a panel. Menus are placed
    from their button's position when they open (`ui/overlay.ts:77`), so a panel or the title menu
    opens under its button wherever the row is scrolled.
  - **The toolbar's height**: `--bar-h` (which places the turn bands and the scope note) is set
    only in `syncBar` (`reader/reader.ts:578`), so turning the phone between one row and two leaves
    it stale. Observe the toolbar's element with a `ResizeObserver` and set `--bar-h` from it (and
    lower `minScale` as `syncBar` does).
  - Check (a phone, or Playwright at 360 × 640, 390 × 844, 640 × 360, 844 × 390 and a tablet's
    1024 × 768), with a long score title: tall screens have two rows, the back arrow and ⋯ at the
    ends of the first with the title cut short between them, and the tools below, scrolling
    sideways only if they must; short screens have one row whose back arrow and ⋯ stay put while
    the title and tools scroll; every tool is reachable; a long press still opens a panel; a swipe
    on the bar doesn't turn the page; turning the phone moves the turn bands to just below the bar.

## Confirmed features which require more thought

- **Reading on a phone, a system at a time**: on a phone in landscape, a whole page is too small to
  read; the wish is to see one system at a time. Cuts can already cut a page into systems, but a
  frame takes the shape of the page its first cut is from (`Frame.aspect`, `pack` in
  `scores/frames.ts`), so a system cut from a portrait page sits in a tall portrait frame. Reading
  a system at a time needs frames shaped otherwise than the page: wide, as the screen is.
  - To work out: whether the frame's shape is chosen per score, per device or per reading (the
    same score read on a tablet and on a phone); what fills a wide frame (one system, or as many as
    fit); and how this meets the cuts, padding and page turns, which all reason in frames today.
- **The cache giving room back when the origin runs short of quota**: pinned
  pages are never evicted, and the others only to stay within 30% of the quota (`diskBudget`,
  `page-cache/_budget.ts`); nothing shrinks the cache when the origin as a whole (scores added,
  records) runs out of room.
- **Exporting works out each PDF's music twice, and draws a drawn one twice**:
  exporting a score or a setlist as a PDF (`dialogs/export-pdf.ts`, `export/pdf.ts`) needs each
  original's music as a PDF pdf-lib can read: `Original.pdf()`, for a PDF `pdfOf`
  (`originals/read/_pdf.ts`). It reads the whole file, decrypts it if it is encrypted, and
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
- **How the pages kept offline are worked out**: the offline job works out the
  widths each setlist's pages are drawn at from the screen's size, in both orientations, and pins
  exactly those (`offline/pages.ts`). Open:
  - A score whose aspects were never measured and whose file can't be read now (folder locked, no
    password): neither its pages nor their widths can be worked out, as a score's cuts, its
    frames' aspects and the widths a screen shows them at all follow from its pages' aspects. Its
    earlier pins are left as they are, and its setlist waits.
  - Both orientations double the pages and the drawing. Eventually the user says which
    orientation each frame is played in, and only that is kept.
  - It assumes the reader fills the screen: if full screen is refused, the stage is the window,
    and a saved page only serves a request within 1% of its width (`page-cache/_match.ts`).
  - A change of `devicePixelRatio` (display size in Android's settings) changes every width.
- **Showing whether storage is persistent:** `main.ts` asks for it (`navigator.storage.persist()`)
  at each start and ignores the answer, and nothing shows it. Chrome grants it by itself, mostly
  to an installed app; in a browser tab it may not, and then Volti's own folder (scores added
  without a linked folder), and the cuts, markings and setlists, can be cleared when the tablet
  runs low on space, without a word. The storage bar (the library's ⋯ menu, `library/_storage.ts`)
  could say whether it is (`navigator.storage.persisted()`), and where it isn't, suggest
  installing Volti (Add to home screen). Where it is, the page cache's 30% of the quota is room
  only Volti gives back (see the item on the cache giving room back).
- **Purging a removed score's data**: once a removed file is deleted for good
  (its record then says `gone`), its score (cuts, markings, named excerpts) is still kept by its
  id, as for any score whose file is missing. Eventually there should be a way to purge it.
- **What metadata holds, in the storage bar:** tapping the Metadata line opens what it holds, as a
  small stacked bar of its own (as the main bar is) with its parts as labelled chips under it
  (option 3 in https://claude.ai/artifact/Bt8AySBf7E2dZC13NQcqF7).
  - What is stored (`storage/keys.ts`): `score:` (cuts and named excerpts) and `ink:` (markings)
    by original; `setlist:` and `setlists` (their order); `original:` records (where each file
    is, its aspects, its password); and a few settings and places: `folder`,
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
    files (aspects; where a folder file is); a password, and where a file in Volti's own
    folder or Recently removed is, can't.
- **Imported fonts** for text and symbol markings (the rest of markings is done; its spec and
  plans are gone, so what was decided is here). The user adds a font file (TTF, OTF, WOFF or
  WOFF2) from a **Fonts** section of the library editor, with import and remove; imported fonts
  are listed by name, and offered beside the bundled ones wherever a font is picked (a library
  symbol's font, the Font dropdown in the Text tool's long-press panel).
  - A font's id is the first 8 hex digits of the SHA-256 of its file, as for the bundled fonts
    (`fonts/fonts.ts`); the whole hash is never kept. Importing a file whose id is already a
    font's adds nothing.
  - Its bytes go in OPFS at `fonts/<id>`, and a new key `fonts` (owner `fonts/store.ts`, in
    `storage/keys.ts` and `STORAGE.md`) holds `FontRecord[]`: `{ id: string; name: string }`, the
    name being the family and style from the font. The storage bar gets a part for imported fonts.
  - Removing one removes its bytes and its record. Markings and library symbols made with it stay
    as they are, since each carries its glyphs; importing it again gives the same id, so its
    `glyph:` records still fit. Editing a text marking whose font is gone shapes it again in
    Academico Regular.
  - Read with fontkit, as now, only when something has to be shaped. Variable fonts are used at
    their default instance; collections (TTC) are not supported.
  - `fonts/` holds this and knows nothing about markings; the reader puts fonts and markings
    together.
  - Not in this: fonts from the system (the Local Font Access API isn't on Android) or the web;
    exporting imported fonts with the rest of the library; removing a font's glyph records with it.
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
- **Page-turn strategies** (half-page turns and the like): to be discussed separately.
- **Exporting the library** (scores, setlists, markings, reading positions) as files, for backup
  and for moving to another device; probably written into the linked scores folder.
- **The first open of a PDF still lags**: the first time a PDF is opened since
  PDFs skipped pdf-lib is still noticeably slow, even for one opened before, whose aspects are
  stored. What only that open does is `readPdf`'s check (`originals/read/_pdf.ts`): `f.file()`,
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
- **The reader shows its first screen twice**: a `ResizeObserver` reports the
  stage's size as soon as it starts watching, which `Reader` does once full screen has settled,
  just after starting `goTo` (`reader/reader.ts`). 150 ms later its report runs `show()` again,
  for the same widths, which the cache now holds: it costs little, but it redraws the screen for
  nothing. To work out: whether to skip the observer's first report, or only show again when the
  size differs from the one last shown.
- **Opening scores faster still: a small first page kept for each score**: keep
  each score's first screen, at a low resolution, so opening one shows it at once and sharpens
  after, as turning does now. To work out: how it sits with the page cache and the offline pages
  (`page-cache/`), which first pages (a score's start, or where it was last read), and the room
  they take.
- **A file put back appears in the library at once**: after **Put back**
  (`library/_removed.ts`) the file shows only after `lib.refresh()` has read the scores folder
  again; it should show at once, as a renamed file does.
- **Tapping low on the page for text**: with a finger, the music sometimes moves
  up too far, leaving a gap between the page and the keyboard (`lift`, `reader/_tools/_typing.ts`); with
  the pen, the keyboard shows and hides at once, so the field likely loses the focus as the pen
  lifts (its `blur` finishes the typing).
- **Typing text keeps the zoom**: when the keyboard goes away the zoom resets. The
  suspicion: `close` (`reader/_tools/_typing.ts`) turns `overlaysContent` off, the stage resizes, and
  `show()` sets `NO_ZOOM` (`reader/reader.ts`).
- **The selected marking's delete button keeps its size on screen**: it is 28 px in CSS
  (`.selection-delete`, `styles/reader.css`) inside the zoomed screen, so it grows with the zoom
  (84 px at 3×), while the box's line and handles keep their size (`SelectionBox.zoomed`,
  `reader/_tools/_selection.ts`). It should be scaled by `1 / s` there too, as they are.
- **What the tools' drawing calls are for**: to be explained, then perhaps merged.
  `ToolHost` has `drawInk(slot, extra)` (the frame's ink as it is, plus a marking still being
  made: a stroke, a ghost), `drawState(slot, s)` (the frame's ink as it would be in `s`, not taken:
  a marking being moved or resized), and `erased(s, slot)` (`s` taken, without an undo step yet:
  the eraser's sweep) (`reader/_tools/_tool.ts`, `reader/reader.ts`). Perhaps one
  `draw(slot, { state?, extra? })` for the first two.

## Speculative future ideas

- **Zoom out with a multi-finger gesture:** a gesture (a two-finger double tap, say) that zooms
  back out to the whole page, in place of the toolbar's **Fit page**, which the toolbar redesign
  drops. Without it, turning the page or hiding the toolbar zooms out.
- **A format version in each stored key's name, so no code reads old formats:**
  - In `storage/keys.ts`, each key or prefix carries its format version in its name:
    `'score@2:' + id`, `'folder@2'`.
  - Changing a key's format means bumping that number. The new name finds nothing, so what was
    stored is dropped: the no-migration rule, applied by itself. `kv` doesn't change at all.
  - Start-up tidying deletes every key `keys.ts` doesn't know, which includes every older
    version.
  - Together these would replace the steps of the stored data (`STEPS`, `stored-data.ts`) for
    changes that drop what was stored.
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
- **A Google client of your own, past the 100-user cap:** Volti's Google OAuth app is unverified
  (README.md, "Using it"), so at most 100 accounts can ever sign in with it. Past that, a user
  would make their own client and give Volti its client ID and secret, which Volti keeps in a new
  kv key (`drive-client: { clientId, clientSecret }`) and uses in place of the built-in one.
  - Making one, about ten minutes in the Cloud Console: a project with the Drive API on; its
    consent screen in production, unverified (in Testing, its tokens would last 7 days); a Web
    application client with Volti's URL (`https://goodgriefgnome.github.io/volti/`) as its
    redirect URI.
  - A refresh token works only with the client that issued it: changing client signs out.
  - A build with no client of its own (a fork) could then offer Drive through the user's.
  - To decide: where the setting lives (the library's ⋯ menu, or the "Link scores folder" dialog
    when there's no built-in client), and whether Volti shows the steps or links to a page.
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
- **Save a decrypted copy of an incoming encrypted PDF:** as a password-protected PDF is added or
  shared to Volti, offer to keep a copy without its password in its place, so Volti has no
  password to remember for it.
  - Little to gain now: the password is asked for once per file and stored in its record, and
    pdf.js decrypts in its worker.
  - The copy is another file, with another id (ids are the hash of the contents); pdf-decrypt
    doesn't know every encryption; and protected scores are often bought ones, whose protection
    is better not removed lightly.
- **Synthetic pages** (systems arranged by hand), **jump markers** (D.S., coda) that generate the
  played order, and **tags** for search.
- **Named excerpts from the PDF's bookmarks** (outline), made the first time a score is opened.
- **A new edition of an original:** replacing a score's PDF isn't supported, as cuts and ink refer
  to page positions.
- **Markings carry an id while a score is open, so a selection survives edits:** the selection is
  found by identity now (`includes(sel.marking)` in `refreshSelection`, `reader/reader.ts`), and an
  edit always makes a new object, so every edit to the selected marking has to hand the reader
  its replacement (`commit`'s `selected`). An `id` field on `Marking`, never stored, would let the
  reader find the selected marking again by id, on its page, after any commit; `commit` would lose
  `selected`.
  - Most edits spread the old marking, so the id comes along by itself (the panels, `movedTo`
    in `scores/placing.ts`). Cycling a symbol builds its replacement afresh (`cycle`,
    `reader/_tools/_placing.ts`) and must copy the id.
  - Every place a marking is made gives it a new id: loading a score (`scores/store.ts`), the pen,
    and placing a symbol or text.
  - Stripped when saving (`scoreEntries` in `scores/store.ts`), and kept out of the PDF export and
    of tests that compare states.
  - Undo and redo keep the selection when its marking is still there (they end it now).
  - To decide: whether strokes get ids too, for when they become selectable.
