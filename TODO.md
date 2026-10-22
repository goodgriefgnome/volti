# TODO

## Pieces and setlists

Pieces, cuts and frames are built for PDFs (`src/pieces/`, `src/viewer/edit.ts`). Still to do:

- **Setlists:** a list of pieces, each with its own copy of the piece's played order, normally
  with more cuts. When a piece changes, offer a checkbox per setlist that contains it to update
  that setlist. Archived setlists are frozen.
  - Copy-on-write: a setlist keeps the piece's cut ids until a cut changes. Its ink is a layer,
    `ink:<setlistId>` by cut id, read before the piece's; the first draw or erase on a cut in a
    setlist copies that cut's strokes into the layer. A cut whose shape changes in a setlist
    gets a new id that remembers the one it came from, so it reads the piece's ink until its own
    is first edited.
- **Whiteout** tool, for hiding a 1st ending on the 2nd time through (an annotation, not a cut).
- **Images as a source:** a set of images ordered by file name, scaled to a common width.
- **A piece's page range:** a PDF may hold several pieces; the insert picker should show the
  piece's pages first, with a way to reach the rest.
- **Orientation:** pieces store portrait/landscape, but frames per screen still come from the
  toolbar's Auto / 1 page / 2 pages setting. Not changing this yet.
- Pages of different shapes in one PDF aren't handled specially: a page taller than the first is
  clipped.
- Check long press (and Android's own `contextmenu` on a long press) on a real tablet.
- Page-turn strategies (half-page turns and the like): to be discussed separately.
- Replacing a PDF with a new edition is not supported yet: cuts and ink refer to page positions.
- Later: synthetic pages (systems arranged by hand), jump markers (D.S., coda) that generate the
  played order, tags for search.

## Data export

- Export the library (pieces, setlists, markings, reading positions) as files, for backup and for
  moving to another device. Probably written into the linked scores folder, which needs write
  access. Low priority.
