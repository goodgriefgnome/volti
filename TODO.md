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

- **Markings exported as PDF annotations, with their own vector appearances:** in an exported PDF,
  each marking is an annotation placed exactly as the reader places it (not clipped to its cut),
  instead of a 2000-pixel picture over each page. Other PDF apps can then hide or delete them,
  and viewers show them as drawn.
  - Each annotation carries its appearance (`/AP /N`, a form XObject drawn in vector operators,
    `/BBox` equal to its `/Rect`), flagged to print (`/F 4`), with a unique `/NM`, listed in its
    page's `/Annots`.
  - Pen: an Ink annotation (`/InkList` of the points, `/C`, a nominal `/BS /W`); its appearance draws
    the stroke segment by segment with round ends, each segment's width from the pen's pressure,
    as on screen.
  - Highlighter: an Ink annotation whose appearance is one see-through line per stroke (so it
    doesn't darken where it crosses itself), darken-only (`/BM /Multiply` in an ExtGState), so
    notes under it stay black, as on paper.
  - Markings draw through a small drawing interface (move, line, width, colour, transparency,
    blending) that the screen's canvas and the PDF appearance writer each implement, so each kind
    of marking is written once and exports as it shows.
  - The picture of the markings goes. Music pdf-lib can't read (password-protected PDFs) is still
    drawn as a picture.
- **Encrypted PDFs export as vectors:** export decrypts an encrypted original with
  `@pdfsmaller/pdf-decrypt` (MIT, ~92 KB, loaded with pdf-lib only to export) before
  `PDFDocument.load`, using the score's saved password, or none for a permissions-only PDF. The
  music then stays vector instead of being drawn as a JPEG.
  - It handles RC4 and AES-256 but not AES-128 (`/V 4 /R 4`, common from Acrobat 7–9); those, and
    anything else it can't read, still fall back to the JPEG picture.
  - When any of the music will be a picture, the export dialog (where the file is named) says so,
    under the name, like the hint for missing scores: e.g. ““Mass A” will be exported as pictures
    of its pages, not as the original's music, so it will be larger and less sharp when zoomed.”
    The dialog opens at once and checks the originals in the background (read each one's
    encryption from its `/Encrypt` dictionary, or try the decrypt), adding the warning when found.

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

- **Text and symbol markings**, beside the pen and highlighter, each exported as a PDF annotation
  with its own vector appearance (see the immediate item on exported markings):
  - *Text:* typed on the music ("rit.", cues, bar numbers), with an optional shape behind it: a
    plain rectangle with a see-through fill, or a rectangle pointing left or right (a tag). A
    FreeText annotation, its appearance drawing the shape, then the text.
  - *Symbols:* fingerings (finger numbers 1–5, and substitutions such as 4–5) and organ pedal
    marks (toe and heel, for the left and right foot, as above or below the staff). Stamp
    annotations, each symbol's outline drawn as vector paths from an open music font (Bravura,
    SIL Open Font License, SMuFL's keyboard pedal glyphs), so nothing depends on the viewer's
    fonts. Placed with a tap, then moved and resized.
  - To think through: the toolbar (one tool with a palette of symbols rather than a button each;
    text entry and editing on the music); sizes relative to the staff; colours; how the eraser and
    undo treat them; and keeping each on its original page and cut, as strokes are.
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
