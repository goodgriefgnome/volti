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
  - "Insert pages" shows thumbnails of the piece's pages; tap one page, or two for a range, and
    insert before or after the current frame.
  - Every part has a faint tab at its top left (its start) and its bottom right (its end). Tabs
    sit flush against the frame's side, square where they meet the seam and the edge.
    Dragging a tab moves that edge; the music being cut stays visible, hatched, until you let go,
    and then the score reflows. Dragging an edge across the whole part removes it.
  - A grey tab at the top right of each frame adds white space above the music (stored on the
    part, used only when that part starts a frame).
  - "Add a cut" arms one drag over the music to cut out.
  - A "show room left" toggle: when the frame before is more than a fifth empty, a faint band and a
    dashed ✂ line show how much would fit there. Tapping the line splits the page at the nearest
    gap between systems above it and moves the top part onto the frame before, which is then
    shown. No cue when the frame already continues the page from the frame before, or when the
    line would fall at the end of the frame's first part.
  - Deleting a cut: not designed yet (dragging its tabs back works, but is fiddly).
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
