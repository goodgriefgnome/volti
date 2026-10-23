# TODO

A score is what is shown of its original (a PDF), as cuts; a setlist is a list of excerpts of
scores.

## Work for the immediate future

- **While the keyboard is open, a dialog fills the screen** above it and scrolls as a whole, so the
  excerpt picker's thumbnails don't scroll on their own (today the dialog shrinks to fit above the
  keyboard, and the thumbnails scroll inside it). Checked on the tablet: pinching and panning the
  thumbnails is smooth.
- **Bigger cut tabs:** the tabs for dragging a cut's edges are a little too small on the tablet
  (long press works fine).
- **Renaming a PDF in the scores folder** asked for write access, then said "Could not rename it"
  and left the file as it was. A fallback that copies the file when moving it fails is pushed but
  not yet tried on the tablet; if it still fails, the message now names the error.
- Check on a real tablet: exporting a score with markings; exporting with no folder linked (the
  share sheet). Exporting into the folder works.
- Scores and setlists saved before scores were keyed by hash still use the old path ids: their
  setlists show those scores as Missing. Remove and add them again, or clear the app's data.
- Linking a big folder (each PDF is read whole once to hash it) works but could be faster.
- Excerpts of a score whose original hasn't been opened since page shapes were kept are named by
  original pages ("Original pages 2–3") until it is opened once.
- Export PDF is only in the Library's menus, not the reader's toolbar.

## Confirmed features which require more thought

- **Named excerpts from the PDF's bookmarks** (outline), made the first time a score is opened.
- **Whiteout** tool, for hiding a 1st ending on the 2nd time through (an annotation, not a cut).
- **Images as an original**: a set of images ordered by file name, scaled to a common width,
  beside the PDF reader in `src/originals/`.
- **Page-turn strategies** (half-page turns and the like): to be discussed separately.
- **A new edition of an original:** replacing a score's PDF isn't supported, as cuts and ink refer
  to page positions.
- Pages of different shapes in one PDF aren't handled specially: a page taller than the first is
  clipped.
- **Orientation:** scores store portrait/landscape, but frames per screen still come from the
  toolbar's Auto / 1 page / 2 pages setting.
- **Exporting the library** (scores, setlists, markings, reading positions) as files, for backup
  and for moving to another device; probably written into the linked scores folder.

## Speculative future ideas

- **Synthetic pages** (systems arranged by hand), **jump markers** (D.S., coda) that generate the
  played order, and **tags** for search.
- **Ink as vectors in exported PDFs**, rather than an image over each page (2000 pixels wide).
