# TODO

## Morning session

Each step is one commit to `main`, tested (`npm test`, `npm run build`) before it is pushed.

1. **Closing a menu doesn't tap what's beneath.** The tap outside a menu or dialog closes it when
   the finger goes down; the click when it lifts then lands on whatever is under it (often a score,
   which opens the reader). The tap that closes an overlay must only close it, everywhere.
2. **No "Whole score" button in the excerpt picker.** The dropdown of named excerpts always shows,
   even for a score with none (then it lists Whole score and Custom), and has Whole score.
3. **Dialogs above the keyboard.** When the on-screen keyboard opens (e.g. typing an excerpt's
   name), a dialog fits in the space left above it and scrolls, so its buttons stay reachable.
4. **Scores belong to their PDF's contents.** A score's id is the SHA-256 of its original, not its
   path, so renaming or moving the PDF keeps its cuts, markings, excerpts and setlist entries, and
   a re-added original plays its Missing entries again. Hashes are cached by path, size and
   modified time. The same file both in the folder and imported is one score: the imported copy is
   deleted, never the score's data. A changed PDF is a new score; the old one goes Missing. No
   migration of old data: keep the code clean rather than compatible.
5. **Rename an original.** "Rename…" in a score's ⋯ menu renames its PDF file (the file name only;
   the score's title is its file name). For the linked folder this asks for write access once.
6. **Reading a named excerpt.** Tapping a named excerpt in the Library reads it exactly as a
   setlist entry playing it would be read: just its cuts, stopping at its end, with the toolbar's
   Excerpt button changing the named excerpt's cuts and titled with its name. No reading position
   is kept for it.
7. **Excerpts in the score's reader.** An Excerpts button in the toolbar of a score's reader lists
   its named excerpts, to jump to one, add one, rename, change cuts or delete. Adding and changing
   use the excerpt picker.
8. **Named excerpts in "Add scores".** Each score's named excerpts are listed under it, indented,
   to add to the setlist without previewing.
9. **Export as PDF.** A score, a setlist or a named excerpt exports as a PDF that reads exactly as
   the reader does in 1-page mode: one page per frame, with its markings; each setlist entry starts
   on a new page. The user names the file. It is written into an `Exports` folder inside the
   linked scores folder (which then shows up in the Library, which is fine); with no linked
   folder, it is shared through the share sheet. pdf-lib, loaded only when exporting.

## Scores and setlists

A score is what is shown of its original (a PDF), as cuts; a setlist is a list of excerpts of
scores. Still to do:

- **Named excerpts, later:** create them from the PDF's bookmarks (outline) the first time a score
  is opened.
- "Add scores" searches score titles only; the Library's search also finds excerpt names.
- Excerpts of a score whose original hasn't been opened since page shapes were kept are named by
  original pages ("Original pages 2–3") until it is opened once.
- Check pinching the excerpt picker's thumbnails on a real tablet.
- **Whiteout** tool, for hiding a 1st ending on the 2nd time through (an annotation, not a cut).
- **Images as an original** (deferred): a set of images ordered by file name, scaled to a common
  width, beside the PDF reader in `src/originals/`.
- **Orientation:** scores store portrait/landscape, but frames per screen still come from the
  toolbar's Auto / 1 page / 2 pages setting. Not changing this yet.
- Pages of different shapes in one PDF aren't handled specially: a page taller than the first is
  clipped.
- Check long press (and Android's own `contextmenu` on a long press) on a real tablet.
- Page-turn strategies (half-page turns and the like): to be discussed separately.
- Replacing a score's original with a new edition is not supported yet: cuts and ink refer to page
  positions.
- Later: synthetic pages (systems arranged by hand), jump markers (D.S., coda) that generate the
  played order, tags for search.

## Data export

- Export the library (scores, setlists, markings, reading positions) as files, for backup and for
  moving to another device. Probably written into the linked scores folder, which needs write
  access. Low priority.
