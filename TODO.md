# TODO

## Scores and setlists

A score is what is shown of its original (a PDF), as cuts; a setlist is a list of excerpts of
scores. Still to do:

- **Named excerpts** on a score ("Verse 1", "Short ending"), which setlists refer to instead of
  holding their own span, so changing one changes every setlist that plays it. Not designed yet.
  Known so far: an entry would refer to the excerpt in place of its `first` and `last`; edits to the
  score's cuts must keep named excerpts on the same music, as they do for entries' spans
  (`followEdit` in `src/setlists/model.ts`); and deleting one that setlists use should probably copy
  its span into those entries, so they keep playing the same music.
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
