# TODO

A score is what is shown of its original (a PDF), as cuts; a setlist is a list of excerpts of
scores.

## Work for the immediate future

- **Setlist entry numbers line up with their titles:** in an expanded setlist in the Library,
  each entry's number sits lower than its title. Align them.
- **No "Play the whole score" in a setlist entry's menu:** remove it from the ⋯ menu of an entry
  in a setlist in the Library (Change excerpt… can choose Whole score in its dropdown).

## Manual check

Things to try on the tablet.

- **Renaming a PDF in the scores folder:** it asked for write access, then said "Could not rename
  it" and left the file as it was. A fallback that copies the file when moving it fails is pushed;
  check it renames now. If it still fails, the message names the error.
- **Exporting a score with markings.**
- **Exporting with no folder linked** (the share sheet). Exporting into the folder works.
- **Adding a PDF with Add PDFs** (it failed on the tablet: the copy came out empty): it opens,
  and Come_People_Of_The_Risen_King.pdf is titled without the digits Android added.
- **Dialogs with the keyboard open** fill the screen above it and scroll as a whole; dragging the
  excerpt picker's thumbnails scrolls the dialog. (The keyboard is taken to be open when the visible
  area is under 85% of the page's height, unzoomed.)
- **Cut tabs** are bigger (64×48 to touch, 40×20 showing, solid enough for 3:1 contrast): easy to
  hit, and not hiding too much music.
- **Linking a big folder:** the library shows at once with the scores already known, and the new
  ones appear one by one, with "Reading new scores: n left…".
- **Updating:** after a change is published, closing and reopening Volti shows the start screen
  (perhaps "Updating Volti…"), then the new version, never the old one first; with Volti left
  open, it doesn't reload by itself.
- **Tapping into a highlighted name** (Rename…, New setlist, Export PDF…): one tap gives a
  cursor where it lands, without the cut/copy menu.

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
