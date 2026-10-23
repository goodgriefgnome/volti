# TODO

A score is what is shown of its original (a PDF), as cuts; a setlist is a list of excerpts of
scores.

## Work for the immediate future

- **While the keyboard is open, a dialog fills the screen** above it and scrolls as a whole, so the
  excerpt picker's thumbnails don't scroll on their own (today the dialog shrinks to fit above the
  keyboard, and the thumbnails scroll inside it). Checked on the tablet: pinching and panning the
  thumbnails is smooth.
- **Bigger cut tabs:** the tabs for dragging a cut's edges are a little too small on the tablet
  (long press works fine).
- Linking a big folder (each PDF is read whole once to hash it) works but could be faster.
- Excerpts of a score whose original hasn't been opened since page shapes were kept are named by
  original pages ("Original pages 2–3") until it is opened once.
- Export PDF is only in the Library's menus, not the reader's toolbar.
- **No old version while a new one loads:** at start-up, show a plain start screen and ask the
  server for a newer service worker before showing the library. No update (or offline): show the
  library. An update: say "Updating Volti…" until it takes over, then reload into it. Give up
  after about 3 seconds and open the version already installed, which then updates at the next
  launch rather than reloading under you. Today the old version shows and reloads by itself a few
  seconds later once the new one has downloaded, which can happen mid-read.
- **An empty setlist offers Add scores:** expanding a setlist with no scores shows "No scores yet.
  Use ⋯ › Add scores." Show an Add scores button there instead.
- **Add to setlist… in the Library, and a default setlist:** every score's and named excerpt's ⋯
  menu gets "Add to setlist…", as the reader's toolbar has (an excerpt adds itself, not the whole
  score). One setlist is the default, and these menus also get "Add to <default setlist>". A
  setlist's ⋯ menu has "Set as default". The only setlist is always the default; with no
  setlists, there is no "Add to <default setlist>" item.

## Manual check

Things to try on the tablet.

- **Renaming a PDF in the scores folder:** it asked for write access, then said "Could not rename
  it" and left the file as it was. A fallback that copies the file when moving it fails is pushed;
  check it renames now. If it still fails, the message names the error.
- **Exporting a score with markings.**
- **Exporting with no folder linked** (the share sheet). Exporting into the folder works.

## Confirmed features which require more thought

- **Images as an original**: a set of images ordered by file name, scaled to a common width,
  beside the PDF reader in `src/originals/`.
- **Page-turn strategies** (half-page turns and the like): to be discussed separately.
- Pages of different shapes in one PDF aren't handled specially: a page taller than the first is
  clipped.
- **Orientation:** scores store portrait/landscape, but frames per screen still come from the
  toolbar's Auto / 1 page / 2 pages setting.
- **Exporting the library** (scores, setlists, markings, reading positions) as files, for backup
  and for moving to another device; probably written into the linked scores folder.

## Speculative future ideas

- **Synthetic pages** (systems arranged by hand), **jump markers** (D.S., coda) that generate the
  played order, and **tags** for search.
- **Ink as vectors in exported PDFs**, rather than an image over each page (2000 pixels wide).
- **Named excerpts from the PDF's bookmarks** (outline), made the first time a score is opened.
- **Whiteout** tool, for hiding a 1st ending on the 2nd time through (an annotation, not a cut).
- **A new edition of an original:** replacing a score's PDF isn't supported, as cuts and ink refer
  to page positions.
