# TODO

## Night session

In this order: each step builds on the one before it.

1. **No checkboxes in the score list.** Take the checkbox out of each row in the Library's score
   list. That also removes the pick bar (`picked`, `renderPickBar`, `addPicked` in
   `src/library/library.ts`) and the `.pick` / `.picked` / `.pickbar` styles. Fix the text that
   mentions ticking ("…or tick scores below", "Tick scores below to make one"). Keep
   `chooseSetlist` in `src/ui/setlists.ts`, because the reader's "Add to setlist" still uses it.
2. **One "Add scores" dialog.** "New setlist" and ⋯ › "Add scores…" already both call
   `Library.addScores`. Keep it that way, and move the dialog into its own module so it can grow.
3. **Share the excerpt picker.** Split `src/reader/excerpt-picker.ts` into a part that only draws
   (the score's frames as thumbnails, with a band over each cut and tap first/last to choose a
   span) and the dialog around it. The new part goes somewhere both the Library and the reader can
   use it, such as `src/ui/`. It needs a way to draw pages without the reader. To get one, open the
   original (`openPdf`, `allAspects`), load the score (`loadScore`), and close the PDF afterwards.
4. **Choosing an excerpt from the Library doesn't open the reader.** The entry's ⋯ › "Choose the
   excerpt…" opens the picker straight over the Library and saves the span to the setlist. When
   that's done, remove `chooseExcerpt` from `ToRead` and the reader's constructor. The reader's own
   toolbar button keeps working and uses the same picker.
5. **Pinch to zoom the thumbnails** in the picker. Two fingers zoom the strip of thumbnails, and
   one finger pans it while it's zoomed. Reuse `pinch`/`pan`/`clamp` from `src/reader/zoom.ts`
   (move them to a shared place if needed). Redraw the pages more sharply once zoomed in. A tap on
   a cut must still choose it, so a pinch must not count as taps.
6. **Preview in "Add scores".** Each score in the dialog gets a "Preview" button. It opens the
   shared picker, showing the score's frames, and lets you choose an excerpt there. Adding the
   score then adds that excerpt rather than the whole score. A score with no excerpt chosen is
   still added whole.
7. **The same score more than once in a setlist** (e.g. 1. Kyrie from Mass A, 2. another song,
   3. Gloria from Mass A). Entries already have their own ids, so the model allows it. What's left:
   - In "Add scores", a score can be added more than once, each time with its own excerpt (e.g.
     "Add another excerpt" from the preview). Show "in this setlist N×" instead of "already in
     this setlist".
   - Wording. The menu item becomes "Change excerpt…". The picker's question becomes something
     like "Which part of “Mass A” does entry 3 play?" rather than "Which excerpt … does
     “Setlist” play?". The hint then reads "This entry plays …".
   - Check the reader with two entries of one score. It shares one `OpenScore` per score id, so
     check reading positions, the scores menu, editing cuts (both entries' spans must follow the
     edit), and undo. Add a test in `src/setlists/model.test.ts` for `followEdit` with two entries
     of one score.

When it's all done, run `npm test` and `npm run build`, and check each step in the running app.

## Scores and setlists

A score is what is shown of its original (a PDF), as cuts; a setlist is a list of excerpts of
scores. Still to do:

- **Named excerpts** on a score ("Verse 1", "Short ending"), which setlists refer to instead of
  holding their own span, so changing one changes every setlist that plays it. Not designed yet.
  Known so far: an entry would refer to the excerpt in place of its `first` and `last`; edits to the
  score's cuts must keep named excerpts on the same music, as they do for entries' spans
  (`followEdit` in `src/setlists/model.ts`); and deleting one that setlists use should probably copy
  its span into those entries, so they keep playing the same music.
- **Missing entries:** match a re-added original back to its score, so a Missing entry plays again.
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
