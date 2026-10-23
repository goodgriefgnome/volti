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
- **Frames take their pages' shape; each screen shows 1 or 2 frames by orientation.**
  - *Frames:* cuts are stacked into frames as now, but a frame takes the shape of the original
    pages its cuts come from, not the first page's. A cut from a page whose aspect ratio differs
    by more than 10% from the frame's starts a new frame (A4 and US Letter in the same
    orientation share frames). Each cut is drawn at the frame's width, so small differences only
    scale. A page taller than the first is no longer clipped.
  - *Orientation:* a frame is landscape when wider than tall, otherwise portrait (square frames:
    see "more thought" below; for now, portrait). The screen's orientation is the reading area's
    shape, without the toolbar; rotating the tablet lays the screens out again, keeping the cut
    at the top of the screen.
  - *Screens:* a frame whose orientation is the screen's fills the screen alone. One of the other
    orientation opens a screen of two: side by side for portrait frames, one above the other for
    landscape ones. Only the screen's first frame decides: the second slot takes the next frame
    whatever its shape, shrunk to fit its half. Frames of different sizes in one screen (A4 beside
    Letter) are each fitted to their half.
  - *Turning:* forward moves on by the frames shown. Back shows the screen that turning forward
    from would come back to the current one: with the first frame on screen f, frames f−2 and f−1
    when f−2 would open a screen of two; otherwise f−1 alone (also when f−1 would open a screen of
    two, which would then take in f). Near the start, the screen from the first frame. A
    remembered place, or rotating, opens the screen starting at the frame holding the cut.
  - *Setlists:* each entry still starts on a fresh screen, and a half-empty last screen keeps the
    "Next" box in its second slot. Exports stay one frame per PDF page.
  - *Toolbar:* remove the Auto / 1 page / 2 pages setting: it is always this. The score's stored
    portrait/landscape (`Score.orientation`) goes, as each frame has its own.

## Manual check

Things to try on the tablet.

- **Exporting a score with markings.**
- **Exporting with no folder linked** (the share sheet). Exporting into the folder works.
- **Linking a big folder:** the library shows at once with the scores already known, and the new
  ones appear one by one, with "Reading new scores: n left…".

## Confirmed features which require more thought

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
- **Ink as vectors in exported PDFs**, rather than an image over each page (2000 pixels wide).
- **Named excerpts from the PDF's bookmarks** (outline), made the first time a score is opened.
- **Whiteout** tool, for hiding a 1st ending on the 2nd time through (an annotation, not a cut).
- **A new edition of an original:** replacing a score's PDF isn't supported, as cuts and ink refer
  to page positions.
