# TODO

## Pieces, pages and setlists (designed, not built)

Decisions so far; a working sketch is the "Volti frames" prototype. (An earlier sketch built pieces
from systems; it was dropped as more complicated than it was worth.)

- A **source** is a PDF, an image, or a set of images (ordered by file name). A piece comes from
  **one PDF**, or from a set of images whose page widths are meant to match.
- A **piece** has a title, a key and an orientation (portrait or landscape); tags come later, for
  search. Its played order is a list of **pages**, and a page can appear more than once (a repeat
  lists the page again). A new file becomes one piece, every page once, in order.
- The played order is a flat list of **parts**: horizontal bands of source pages. A gap between two
  parts of the same page is a **cut**; parts that touch are a **split**.
- **Reflow**: frames have the page's own shape and scale (landscape shows two side by side). Parts
  are stacked in order; a part goes on the current frame if it fits, otherwise it starts the next.
  A split whose halves end up on the same frame is joined again.
- **Editing happens in the frame view**, never on the raw page:
  - "Insert pages" adds a page or a range of pages before or after the current frame.
  - Every seam between parts has a tab on the left above it (the end of the music above) and a tab
    on the right below it (the start of the music below). Dragging a tab moves that edge; the music
    being cut stays visible, hatched, until you let go, and then the score reflows. Dragging an edge
    across the whole part removes it.
  - "Add a cut" arms one drag over the music to cut out.
  - A "show room left" toggle: when the frame before is more than half empty, a faint band shows
    how much would fit there. Tapping its bottom edge splits the page at the nearest gap between
    systems above it and moves the top part onto the frame before, which is then shown.
- **Ink** belongs to one part of the played order (not to the source page), so a marking on the
  2nd time through a repeat doesn't appear on the 1st. Hiding a 1st ending is an annotation (a
  whiteout tool), not a cut.
- A **setlist** is a list of pieces with its own copy of each piece's played order, normally with
  more cuts. When a piece changes, offer a checkbox per setlist that contains it to update that
  setlist. Archived setlists are frozen.
- Replacing a PDF with a new edition is not supported yet.
- Later: synthetic pages, jump markers (D.S., coda), tags.

## Data export

- Export the library (pieces, setlists, markings, reading positions) as files, for backup and for
  moving to another device. Probably written into the linked scores folder, which needs write
  access. Low priority.
