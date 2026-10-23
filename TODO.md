# TODO

A score is what is shown of its original (a PDF), as cuts; a setlist is a list of excerpts of
scores.

**How to work through this list** (when asked to work on the immediate features):

- Work on `main` directly: one commit per item, pushed as it is done.
- Each item's commit takes the item out of this file; what then needs trying on the tablet goes
  under Manual check.
- Before each push: `npm test`, `npm run build`, and check the change in the running app.
- Ideas raised in conversation are filed here, in the right section, not built, unless asked.

## Work for the immediate future

- **Markings exported as vectors:** in an exported PDF, markings are lines in the page's own
  content, placed exactly as the reader places them (not clipped to their cut), instead of a
  2000-pixel picture over each page.
  - Pen strokes: segment by segment with round ends, each segment's width following the pen's
    pressure, as on screen. Highlighter strokes: one see-through line per stroke, so a stroke
    doesn't darken where it crosses itself; darken-only ("multiply") over the music, so notes
    under it stay black, as on paper (on screen it lightens them slightly).
  - Markings stay part of the page (not PDF annotations, which other apps could remove but which
    can't follow pen pressure and differ between viewers).
  - Markings draw through a small drawing interface (move, line, width, colour, transparency)
    that the screen's canvas and the PDF exporter each implement, so each kind of marking, text
    or post-its later too, is written once and exports as it shows.
  - The picture of the markings goes. Music pdf-lib can't read (password-protected PDFs) is still
    drawn as a picture.

## Manual check

Things to try on the tablet.

- **Exporting with no folder linked** (the share sheet). Exporting into the folder works.
- **Linking a big folder:** the library shows at once with the scores already known, and the new
  ones appear one by one, with "Reading new scores: n left…".
- **One access prompt per session:** after a restart, Allow access (or opening a score from the
  folder) asks once, to edit files; Rename… and Export PDF… then don't ask again.
- **The Update button:** with Volti left open after a change is published, coming back to it (or
  within half an hour) shows Update in the library's banner; tapping it loads the new version.
- **A dialog with the keyboard open** sits centred in the space above the keyboard, with the field
  being typed into in view.
- **The reader's back arrow:** with the toolbar hidden, the small arrow at the top left goes back
  to the library without getting in the way of the music or of turning back a page.
- **Scores grouped by subfolder:** the lists, closing them (remembered after a restart), searching,
  Move to folder… for an added PDF, and Add scores' collapsed lists.

## Confirmed features which require more thought

- **Cropping, in batches of pages:** a mode of its own, like Edit cuts, for trimming the margins
  of the original's pages, applied to several pages at once. To think through: what a batch is (a
  range of pages, odd and even pages apart for scans of a book); whether it trims all four sides
  or only left and right (cuts already trim top and bottom); how it changes the pages' shape, and
  so frames and orientation; markings, which are placed on the page and must stay on the music;
  and exports and thumbnails, which would show the cropped pages.
- **Turning back so forward restores the screen:** turning back should show the screen that
  turning forward from would come back to the current one. With the first frame on screen f:
  frames f−2 and f−1 when f−2 would open a screen of two; otherwise f−1 alone (also when f−1 would
  open a screen of two, which would take in f). For now it goes back by as many frames as show.
- **Square frames:** a frame neither wider nor taller is both portrait and landscape; decide how
  it lays out on the screen (for now, as portrait).
- **Images as an original**: a set of images ordered by file name, scaled to a common width,
  beside the PDF reader in `src/originals/`.
- **Page-turn strategies** (half-page turns and the like): to be discussed separately.
- **Exporting the library** (scores, setlists, markings, reading positions) as files, for backup
  and for moving to another device; probably written into the linked scores folder.

## Speculative future ideas

- **Synthetic pages** (systems arranged by hand), **jump markers** (D.S., coda) that generate the
  played order, and **tags** for search.
- **Named excerpts from the PDF's bookmarks** (outline), made the first time a score is opened.
- **A new edition of an original:** replacing a score's PDF isn't supported, as cuts and ink refer
  to page positions.
