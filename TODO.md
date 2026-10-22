# TODO

## Pieces, pages and setlists (built for PDFs, except setlists)

The full design is in [docs/frames-design.md](docs/frames-design.md), with a working prototype in
[docs/prototypes/volti-frames.html](docs/prototypes/volti-frames.html). Summary:

- A **source** is a PDF, an image, or a set of images (ordered by file name). A piece comes from
  **one PDF**, or from a set of images whose page widths are meant to match.
- A **piece** has a title, a key and an orientation (portrait or landscape); tags come later, for
  search. Its played order is a list of **pages**, and a page can appear more than once (a repeat
  lists the page again). A new file becomes one piece, every page once, in order.
- The played order is a flat list of **cuts** (cuttings): horizontal bands of source pages. Music
  between two cuts of the same page has been cut out; two cuts that touch are a **split**.
- **Reflow**: frames have the page's own shape and scale (landscape shows two side by side). Parts
  are stacked in order; a part goes on the current frame if it fits, otherwise it starts the next.
  Splits are never joined automatically.
- **Editing happens in the frame view**, never on the raw page:
  - Menus open only on a right-click or a long press (half a second without moving), never on a
    tap. On the music of a cut: cut here, insert pages before or after this cut (a picker with thumbnails
    of the piece's pages; tap one page, or two for a range), or remove the cut. On blank space
    above a frame's first cut or below its last: insert pages here.
  - Every part has a faint tab at its top left (its start) and its bottom right (its end). Tabs
    sit flush against the frame's side, square where they meet the seam and the edge.
    Dragging a tab moves that edge; the music being cut stays visible, hatched, until you let go,
    and then the score reflows. Bringing music back always grows the cut downwards: dragging the
    top tab up keeps the cut's top where it is and pushes the music below it down, just as
    dragging the bottom tab down does. Dragging an edge across the whole cut removes it.
  - A grey tab at the top right of each frame adds white space above the music (stored on the
    part, used only when that part starts a frame).
  - When the frame before is more than a fifth empty, a faint shading shows how much would fit
    there (always on; no setting). "Cut here" inside it moves the top part onto the frame before.
  - A tab's menu: restore the music cut out above/below
    (joins the two cuts), join a split, restore a trimmed page top/bottom, remove the cut; the white-space tab
    offers "remove the white space". Not covered yet: bringing back a part that was removed.
- **Ink** belongs to one cut of the played order (not to the source page), so a marking on the
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
