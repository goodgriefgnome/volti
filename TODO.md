# TODO

## Scores and setlists

A score is what is shown of its original (a PDF), as cuts; a setlist is a list of excerpts of
scores. Still to do:

- **Named excerpts, later:** create them from the PDF's bookmarks (outline) the first time a score
  is opened.
- Excerpts of a score whose original hasn't been opened since page shapes were kept are named by
  original pages ("Original pages 2–3") until it is opened once.
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
- Linking a big folder (each PDF is read whole once to hash it) works but could be faster.
- Scores and setlists saved before scores were keyed by hash still use the old path ids: their
  setlists show those scores as Missing. Remove and add them again, or clear the app's data.
- Export PDF is only in the Library's menus, not the reader's toolbar. Ink is exported as an image
  over each page (2000 pixels wide), not as vectors.
- **Whiteout** tool, for hiding a 1st ending on the 2nd time through (an annotation, not a cut).
- **Images as an original** (deferred): a set of images ordered by file name, scaled to a common
  width, beside the PDF reader in `src/originals/`.
- **Orientation:** scores store portrait/landscape, but frames per screen still come from the
  toolbar's Auto / 1 page / 2 pages setting. Not changing this yet.
- Pages of different shapes in one PDF aren't handled specially: a page taller than the first is
  clipped.
- Check long press (and Android's own `contextmenu` on a long press) on a real tablet.
- Page-turn strategies (half-page turns and the like): to be discussed separately.
- Replacing a score's original with a new edition is not supported yet: cuts and ink refer to page
  positions.
- Later: synthetic pages (systems arranged by hand), jump markers (D.S., coda) that generate the
  played order, tags for search.

## Data export

- Export the library (scores, setlists, markings, reading positions) as files, for backup and for
  moving to another device. Probably written into the linked scores folder, which needs write
  access. Low priority.
