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

- **A taller thumbnail strip in the excerpt picker:** by default about 25% of the screen's height,
  so the pages can be read without zooming every time.
- **Taller cut tabs:** what shows of a tab can be taller than its 20 pixels now.
- **Frames take their pages' shape; each screen shows 1 or 2 frames by orientation.**
  - *Frames:* cuts are stacked into frames as now, but a frame takes the shape of the original
    pages its cuts come from, not the first page's. A cut from a page whose aspect ratio differs
    by more than 10% from the frame's starts a new frame (A4 and US Letter in the same
    orientation share frames). Each cut is drawn at the frame's width, so small differences only
    scale. A page taller than the first is no longer clipped.
  - *Orientation:* a frame is landscape when wider than tall, otherwise portrait (square frames:
    see "more thought" below; for now, portrait). The screen's orientation is the reading area's
    shape, without the toolbar; rotating the tablet lays the screens out again, keeping the cut
    at the top of the screen.
  - *Screens:* a frame whose orientation is the screen's fills the screen alone. One of the other
    orientation opens a screen of two: side by side for portrait frames, one above the other for
    landscape ones. Only the screen's first frame decides: the second slot takes the next frame
    whatever its shape, shrunk to fit its half. Frames of different sizes in one screen (A4 beside
    Letter) are each fitted to their half.
  - *Turning:* forward moves on by the frames shown; back, for now, goes back by as many frames
    as are showing (near the start, to the first frame). A remembered place, or rotating, opens
    the screen starting at the frame holding the cut.
  - *Setlists:* each entry still starts on a fresh screen, and a half-empty last screen keeps the
    "Next" box in its second slot. Exports stay one frame per PDF page.
  - *Toolbar:* remove the Auto / 1 page / 2 pages setting: it is always this. The score's stored
    portrait/landscape (`Score.orientation`) goes, as each frame has its own.

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
