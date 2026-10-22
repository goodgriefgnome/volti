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

**Words.** "Score" always means the whole score. To the user, a **page** is one of the score's
frames: the score's cuts stacked in played order (`pack` in `src/scores/frames.ts`), counted
"Page 3 of 12". A page of the PDF is an **original page**. Change the words used today: the cut
editor's "page 4" (`pageLabel` in `src/reader/cuts/host.ts`), the archive's "Page 3, 2 markings",
the insert picker's "Inserted page 3" and its labels, and the excerpt picker's labels and hint all
become "original page". The reader's counter can then say "Page 3 of 12". An excerpt being read in
a setlist is packed on its own, so its pages break in different places and its counter starts at 1.
That's fine.

**The model.** An excerpt is its span of cuts and nothing else. Two excerpts with the same span are
the same excerpt.
- Setlist entries keep their spans, as now (`{ id, scoreId, first?, last? }`, where a missing end
  means the start or end of the score). The reader keeps moving them when it edits cuts
  (`followScore` / `followEdit`). That's fine because there won't be many setlists.
- A **name** is a label on a span, kept on the score: `Score.names: { first?, last?, name }[]`.
  Each span has at most one name, and names are unique within a score but not across scores.
  The whole score can't be named.
- Spans are compared by the cuts they play (`spanOf`'s `i0`/`i1`), not by their stored ids.
- An entry plays a named excerpt simply when its span has a name. So naming a span names it in
  every setlist that plays it, including setlists made before it was named, and removing a name
  changes no setlist.
- Named excerpts are listed in order of their first cut, then their last cut.

**Unnamed excerpts get a generated name** from the score's pages, such as "Page 3b – 5". The
number is the page (counted in the whole score, even inside a setlist), and the letter is the
cut's place on that page (a, b, c…). The start's letter is left out when the excerpt starts with
the page's first cut, and the end's letter when it ends with the page's last cut. So "Pages 3–5"
means whole pages, and one partial page reads "Page 3b–c". The name changes when cut edits move
the page breaks. This replaces `spanLabel`'s original-page labels. Packing needs the original's
page shapes, which the Library doesn't have without opening the PDF. So keep the aspects with the
saved score, or a small cache of them, updated whenever the reader opens the score.

**When cuts are edited** (in the reader):
- Names follow the edit through `followEdit`, like entries' spans.
- Pages inserted at the edges of the excerpt being read join every entry with the same span, and
  its name, not just the entry being read. Otherwise the edit would split the excerpt and the
  entry would lose its name.
- If an edit makes two spans equal, their entries simply merge. If both had names, the names are
  joined ("Kyrie / Christe"), so nothing is lost and you can rename it.

**The Library.**
- Each score's ⋯ menu gets "Add excerpt…", which opens the excerpt picker with a name field.
  Saving a span that already has a name says "That's already “Gloria”."
- A score row opens and closes like a setlist row, listing its named excerpts. The arrow is shown
  only on scores that have named excerpts. Tapping an excerpt opens the score in the reader at its
  first cut. Its ⋯ menu has:
  - "Rename…";
  - "Change cuts…", the picker. This moves every entry with the old span to the new one, in all
    setlists, and the name with them. A new span that is already named is refused;
  - "Delete…", which removes the name. Entries keep playing the same music and show the
    generated name.
- Named excerpts are changed only here, and later perhaps in the score's reader. They are never
  changed from a setlist.
- Changes that touch both the score's names and the setlists are saved together, as the reader's
  saver does.
- Search also matches excerpt names. When it does, the row shows the score's name as well
  ("Gloria · Mass A").

**Choosing in a setlist.** The entry's excerpt picker and the preview in "Add scores" get a
dropdown listing Whole score, the named excerpts in order, and Custom. Choosing a named excerpt
selects its span in the thumbnails. Tapping cuts by hand sets the dropdown to the name of that
span, if it has one, or to Custom. The entry stores only the span either way.

**Showing it.** A setlist entry's pill shows the name, or the generated name.

**Later:**
- named excerpts from the PDF's bookmarks (outline);
- a list of named excerpts in the score's reader, for jumping to them and managing them.

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
