# TODO

A score is what is shown of its original (a PDF), as cuts; a setlist is a list of excerpts of
scores.

## Work for the immediate future

- **One prompt per session covers reading and writing:** when the linked folder is locked after a
  restart, the tap that unlocks it ("Allow access", or opening a score from the folder) asks for
  read and write access together, so Rename… and Export PDF… don't ask again. (Chrome only shows a
  permission prompt from a tap, so Volti can't ask on load.)
- **The scores folder up in the banner:** move the scores folder panel (its name, Allow access,
  Change, Unlink, or Link scores folder) up into the masthead row beside "Volti", so Allow access
  is in plain sight when the library opens locked.
- **Setlist entry number and title centred in their row:** the number now lines up with the
  title, but both sit high in the row; centre them vertically, as the drag handle and ⋯ are (and
  an excerpt's name in its pill). A title that wraps is centred as a block, the number beside it.
- **Password-protected PDFs:** one (Come_People_Of_The_Risen_King3420.pdf) is added but can't be
  opened ("Could not open … It may have been moved or renamed"); other PDFs work. Ask for its
  password when it is first opened, and only once: remember it on the tablet, by the score's id,
  across restarts (pdf.js takes a password; pdf-lib can't read such a PDF, so its exports are
  drawn by pdf.js, as already happens). A wrong password asks again.
- **Undo the guess about made-up names:** adding a PDF drops trailing digits from a name without
  ".pdf" (importName), on the theory that Android had added "3420" to that name. It hadn't: the
  file is called that, and the picker only clipped it. Keep a name as it comes (adding ".pdf"), and
  keep reading each added file once.
- **The dialog with the keyboard open stays a dialog:** today it turns into a full-width sheet,
  which doesn't look nice. Keep it a dialog (margins, rounded corners), grown to a large share of
  the screen's width and to the height left above the keyboard; when the thumbnails are zoomed in
  past that, the dialog scrolls vertically. Keep the thumbnail strip itself from scrolling
  vertically (that part is liked).
- **A taller thumbnail strip in the excerpt picker:** by default about 25% of the screen's height,
  so the pages can be read without zooming every time.
- **Taller cut tabs:** what shows of a tab can be taller than its 20 pixels now.

## Manual check

Things to try on the tablet.

- **Exporting a score with markings.**
- **Exporting with no folder linked** (the share sheet). Exporting into the folder works.
- **Linking a big folder:** the library shows at once with the scores already known, and the new
  ones appear one by one, with "Reading new scores: n left…".

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
