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

- **A dialog with the keyboard open is centred:** it now sits at the top of the space above the
  keyboard; centre it there instead, as long as the field being typed into stays in view (when the
  dialog is taller than the space, keep that field visible rather than centring).
- **The excerpt picker's thumbnails a third of the screen tall** by default (now a quarter).
- **A back button always in the reader:** with the toolbar hidden, a small back icon at the top
  left goes back to the library. With the toolbar showing, its "Library" button becomes the same
  icon (still labelled Library for screen readers). The icon is a tap target of its own, so taps
  next to it still turn back a page; it sits over the corner of the music, so keep it small and
  unobtrusive.
- **Scores grouped by subfolder:** the library's Scores list shows the PDFs at the top of the
  scores folder (and the added ones), then one list per subfolder, headed with its path ("Masses /
  Latin"; folders inside subfolders get lists of their own, flat, not nested), sorted by path.
  - Each subfolder list collapses and opens from its heading, open at first; whether each is open
    is remembered on the tablet, across restarts. Headings show no count.
  - Rows lose the folder name from their second line (excerpt and setlist counts stay). Exports
    is an ordinary subfolder list.
  - Searching keeps matches under their headings, opens the lists holding matches for the
    search, and hides lists without any.
  - Added PDFs sit in the main list, but "Move to folder…" in their ⋯ menu files one under a
    subfolder path of your choosing, in Volti only. Its dialog has a text field for the path,
    with the existing subfolders offered as suggestions to pick from as you type (and None). It
    then shows in that subfolder's list beside the real files there, or in a list of its own when
    no such subfolder exists. The file itself stays where it is. A "None" choice moves it back to
    the main list.
  - Add scores groups the same way, its subfolder lists collapsed at first (not remembered).

## Manual check

Things to try on the tablet.

- **Exporting a score with markings.**
- **Exporting with no folder linked** (the share sheet). Exporting into the folder works.
- **Linking a big folder:** the library shows at once with the scores already known, and the new
  ones appear one by one, with "Reading new scores: n left…".
- **One access prompt per session:** after a restart, Allow access (or opening a score from the
  folder) asks once, to edit files; Rename… and Export PDF… then don't ask again.
- **The Update button:** with Volti left open after a change is published, coming back to it (or
  within half an hour) shows Update in the library's banner; tapping it loads the new version.

## Confirmed features which require more thought

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
- **Images as an original**: a set of images ordered by file name, scaled to a common width,
  beside the PDF reader in `src/originals/`.
- **Page-turn strategies** (half-page turns and the like): to be discussed separately.
- **Exporting the library** (scores, setlists, markings, reading positions) as files, for backup
  and for moving to another device; probably written into the linked scores folder.

## Speculative future ideas

- **Synthetic pages** (systems arranged by hand), **jump markers** (D.S., coda) that generate the
  played order, and **tags** for search.
- **Ink as vectors in exported PDFs**, rather than an image over each page (2000 pixels wide).
- **Named excerpts from the PDF's bookmarks** (outline), made the first time a score is opened.
- **Whiteout** tool, for hiding a 1st ending on the 2nd time through (an annotation, not a cut).
- **A new edition of an original:** replacing a score's PDF isn't supported, as cuts and ink refer
  to page positions.
