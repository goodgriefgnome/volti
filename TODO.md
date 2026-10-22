# TODO

## Pieces, pages and setlists (designed, not built)

Decisions so far; a working sketch is the "Volti pages" prototype. (An earlier sketch built pieces
from systems; it was dropped as more complicated than it was worth.)

- A **source** is a PDF, an image, or a set of images (ordered by file name). A piece comes from
  **one PDF**, or from a set of images whose page widths are meant to match.
- A **piece** has a title, a key and an orientation (portrait or landscape); tags come later, for
  search. Its played order is a list of **pages**, and a page can appear more than once (a repeat
  lists the page again). A new file becomes one piece, every page once, in order.
- Each page in the played order is kept as one or more horizontal **parts**. A gap between parts
  is a **cut** (also at the top or bottom, to trim); two parts that touch are a **split**. Both are
  dotted lines dragged up and down on the page.
- **Reflow**: half-screens (landscape: two side by side) have the page's own shape and scale.
  Parts are stacked in order; a part goes on the current half-screen if it fits, otherwise it
  starts the next one. A split lets the top of a page join the half-screen before, so a page
  that was mostly cut away isn't followed by an early turn. While editing, a marker shows where
  the half-screen before runs out of room, so you can see where a split should go.
- **Ink** belongs to one page of the played order (not to the source page), so a marking on the
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
