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

- **Password-protected scores are locked until their password is given:** a score whose PDF
  needs a password Volti doesn't know shows a lock beside its title in the library (and in Add
  scores). It can't go into a setlist without its password, so a setlist never holds a score
  its saved pictures can't be made for.
  - Adding a locked score to a setlist (Add scores, Add to setlist…, Add to) first asks for its
    password, in the dialog used when opening it; Cancel leaves it out. Opening it, as now, asks
    too; either way the lock goes once the password is saved.
  - Knowing which are locked without opening each: when Volti reads a new PDF whole (to hash it),
    it notes whether it is encrypted (an `/Encrypt` entry); an encrypted one with no saved
    password is then opened by pdf.js in the background with no password, which tells a PDF that
    needs one from one that only limits what may be done with it (no lock). Remembered by score
    id, like the hashes, so it is worked out once.

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
- **Exporting a password-protected score:** its music comes out sharp when zoomed (vectors, or the
  scan as it was), and the dialog says “Original quality”.
- **Setlists open at once:** a while after making or changing a setlist, opening it, and turning
  from one of its scores to the next, shows the music straight away, scans included; zooming in
  still works. Reading with the tablet turned the other way is slow the first time only.
- **Markings in an exported PDF:** open the export in another PDF app (Acrobat, Xodo, the
  browser): the pen (thicker where pressed harder) and highlighter (notes under it still black)
  look as in Volti, and the app lists them as annotations it can hide or delete.
- **Reader opens with the toolbar hidden:** a score, excerpt or setlist shows only the music and
  the back arrow; a tap in the middle brings up the toolbar.

## Confirmed features which require more thought

- **Text and symbol markings**, beside the pen and highlighter, each exported as a PDF annotation
  with its own vector appearance, as they are (`export/annotations.ts`; the drawing interface in
  `markings/draw.ts` would need fills, and text or glyph outlines):
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

- **Read only the parts of a PDF that are needed:** open originals through a range transport
  (`PDFDataRangeTransport`, slices of the File) instead of copying the whole file to pdf.js;
  saves some of the ~0.65 s pdf.js spends copying and parsing a 42 MB scan.
- **Synthetic pages** (systems arranged by hand), **jump markers** (D.S., coda) that generate the
  played order, and **tags** for search.
- **Named excerpts from the PDF's bookmarks** (outline), made the first time a score is opened.
- **A new edition of an original:** replacing a score's PDF isn't supported, as cuts and ink refer
  to page positions.
