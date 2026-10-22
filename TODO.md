# TODO

## Scores and setlists

A score is what is shown of its original (a PDF), as cuts; a setlist is a list of excerpts of
scores. Still to do:

- **Named excerpts, later:** create them from the PDF's bookmarks (outline) the first time a score
  is opened; a list of them in the score's reader, for jumping to one and managing them.
- "Add scores" searches score titles only; the Library's search also finds excerpt names.
- Excerpts of a score whose original hasn't been opened since page shapes were kept are named by
  original pages ("Original pages 2–3") until it is opened once.
- Check pinching the excerpt picker's thumbnails on a real tablet.
- **Missing entries:** match a re-added original back to its score, so a Missing entry plays again.
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
