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

- **The scores folder in a ⋯ menu:** the banner row is cluttered. The folder is set and forget, so
  its panel (name, Change, Unlink) moves into a ⋯ menu at the end of the banner row. One button
  stays in the banner row itself: "Allow access" while the folder is locked, or "Link scores
  folder" in its place while none is linked (so a first visit finds it); none once it is ready.
- **An Update button when a new version is ready:** while Volti is open, look for a new version now
  and then (when it comes back to the front, and every 30 minutes or so; not while offline). Once
  one has downloaded, show "Update" in the library's banner row, never in the reader; tapping it
  switches to the new version and reloads. Untapped, the next start takes it anyway, as now.

## Manual check

Things to try on the tablet.

- **Exporting a score with markings.**
- **Exporting with no folder linked** (the share sheet). Exporting into the folder works.
- **Linking a big folder:** the library shows at once with the scores already known, and the new
  ones appear one by one, with "Reading new scores: n left…".
- **One access prompt per session:** after a restart, Allow access (or opening a score from the
  folder) asks once, to edit files; Rename… and Export PDF… then don't ask again.
- **A password-protected PDF** (Come_People_Of_The_Risen_King3420.pdf): opening it asks for the
  password once; after a restart it opens without asking.
- **A dialog with the keyboard open** stays a dialog (margins, rounded corners), most of the
  screen wide; zooming the thumbnails makes it scroll as a whole, not the strip.
- **The excerpt picker's thumbnails** are a quarter of the screen tall: readable without zooming?
- **Cut tabs** show 40×28 now (were 40×20): tall enough?
- **Page shapes and orientation:** in landscape, portrait pages two side by side and landscape pages
  one at a time; in portrait, the reverse (landscape pages stacked); rotating keeps the place. A
  score mixing A4 and Letter shares frames; one mixing portrait and landscape pages changes frame
  shape where they change.

## Confirmed features which require more thought

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
