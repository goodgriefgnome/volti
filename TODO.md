# TODO

## Pieces, systems and setlists (designed, not built)

Decisions so far; a working sketch is the "Volti reflow" prototype.

- A **source** is a PDF, an image, or a set of images (ordered by file name). Any page image can
  come from any source.
- A **clip** is a rectangle on a source page, normally one system. Systems are the atomic unit.
  Systems can be found automatically (rows of ink grouped into staves) and adjusted by hand.
- A **piece** has a title and a key (tags come later, for search) and a played order: a list of
  spans, each "play from system X to system Y" in page order. A repeat is another span, e.g.
  1a→1c, 1b→1c, 1d→2d. Reordering single systems should almost never be needed, so the UI works
  in passes built on the page itself. The page normally edits system outlines; "Add a pass" arms
  the next two taps: the system where the pass starts, then where it ends (possibly on a later
  page). Each pass shows as a numbered bar in a gutter beside the page, next to the systems it
  plays.
- A piece comes from **one PDF**, or from a set of images whose page widths are meant to match.
- The reader **reflows** the played systems onto the screen: stacked down a column, as many as
  fit, then the next column, then the next screen. Forward always means "next screenful",
  whatever jumps the played order makes.
- Systems keep **one consistent scale** within a piece, measured in page widths: the widest
  stretch of the played systems fills the column, and every system keeps its printed size and
  position across the page (an indented first system stays indented, a short last line stays
  short). Only a system taller than the screen is shrunk.
- **Ink** belongs to one system within one pass, stored relative to the clip. A marking on the 2nd
  time through a repeat does not appear on the 1st. Hiding a 1st ending on the 2nd time is an
  annotation (a whiteout tool), not part of the played order.
- A new file becomes one piece in page order; it can be split or rearranged later.
- A **setlist** is a list of pieces with its own copy of each piece's spans; cuts shorten or split
  passes; hiding part of a system is an annotation. When a piece changes, offer a checkbox per setlist that contains it to
  update that setlist. Archived setlists are frozen.
- Replacing a PDF with a new edition is not supported yet.
- Later: synthetic pages (systems arranged by hand), jump markers (D.S., coda) that generate the
  played order, tags.

## Data export

- Export the library (pieces, setlists, markings, reading positions) as files, for backup and for
  moving to another device. Probably written into the linked scores folder, which needs write
  access. Low priority.
