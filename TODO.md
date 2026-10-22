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
  in spans: select a system and choose "play from here" or "play to here".
- The reader **reflows** the entries onto the screen: stacked down a column at the column's
  width, as many as fit, then the next column, then the next screen. Forward always means "next
  screenful", whatever jumps the played order makes.
- **Ink and masks** belong to one system within one span, stored relative to the clip. A marking
  on the 2nd time through a repeat does not appear on the 1st.
- A new file becomes one piece in page order; it can be split or rearranged later.
- A **setlist** is a list of pieces with its own copy of each piece's spans; cuts shorten or split
  spans, or mask parts of systems. When a piece changes, offer a checkbox per setlist that contains it to
  update that setlist. Archived setlists are frozen.
- Replacing a PDF with a new edition is not supported yet.
- Later: synthetic pages (systems arranged by hand), jump markers (D.S., coda) that generate the
  played order, tags.

## Data export

- Export the library (pieces, setlists, markings, reading positions) as files, for backup and for
  moving to another device. Probably written into the linked scores folder, which needs write
  access. Low priority.
