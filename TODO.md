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

## Named excerpts

Next after the night session. Designed, not built.

**What one is.** A named excerpt is a part of one score, such as "Kyrie" in Mass A. It has a name
and a span of the score's cuts, stored like an entry's span (`first`/`last`, where a missing end
means the start or end of the score). It is always one unbroken run of cuts. Alternative cuts
such as a "short ending" come later, with jump markers.
- It is stored on the `Score`, as `excerpts: { id, name, first?, last? }[]`, so it is saved, undone
  and redone with the score's cuts. When the cuts are edited, `followEdit` keeps it on the same
  music, as it does for entries' spans.
- Names are unique within a score, but not across scores: many masses have a "Gloria".
- No two named excerpts of a score have the same span. Saving one with an existing excerpt's span
  says "This is already “Kyrie”." The whole score is never a named excerpt.
- They are listed in order of their first cut, and then of their last cut when the first is the
  same. Spans may overlap.

**What a setlist entry plays.** One of:
- the whole score;
- a named excerpt, by its id. If the excerpt changes, every entry that plays it changes;
- a one-off span, kept in the entry as now.

The picker decides which one. If the chosen span is the same as a named excerpt's, the entry
refers to that excerpt; otherwise it keeps a one-off span. Entries are matched to a named excerpt
only at that moment. Naming an excerpt later doesn't change entries that already play the same
span. (Open: should it?)

**Where named excerpts are made and changed.** Only from the score, never from a setlist:
- The Library: each score's ⋯ menu gets "Add excerpt…". That opens the excerpt picker on the
  score with a name field.
- Each score row in the Library opens and closes like a setlist row, listing its named excerpts in
  order. Each excerpt row has ⋯ with "Rename…", "Change cuts…" (the picker) and "Delete…".
  Tapping an excerpt row opens the score in the reader at the excerpt's first cut. The arrow is
  shown only on scores that have excerpts.
- Maybe the score's own reader later, as a list in the toolbar for jumping to an excerpt and
  managing excerpts. Not in the first version.
- Deleting a named excerpt copies its span into every entry that plays it, so those entries keep
  playing the same music as one-off spans. The confirmation names the setlists affected.

**Choosing in a setlist.** The excerpt picker for an entry, and the preview in "Add scores", get a
dropdown: Whole score, each named excerpt in order, and Custom. Choosing a named excerpt selects
its span in the thumbnails. Tapping cuts by hand changes the dropdown to the excerpt with that
span, if there is one, or else to Custom. The picker can't rename a named excerpt or change its
span.

**Showing it.**
- A setlist entry's pill shows the excerpt's name ("Kyrie"), and the page label ("Pages 3–5") for
  a one-off span.
- Search in the Library also matches excerpt names. When a match is on an excerpt name, the row
  shows the score's name too ("Gloria · Mass A"), because names are only unique within a score.

**Later:** creating named excerpts from the PDF's bookmarks (outline) the first time a score is
opened.

## Scores and setlists

A score is what is shown of its original (a PDF), as cuts; a setlist is a list of excerpts of
scores. Still to do:

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
