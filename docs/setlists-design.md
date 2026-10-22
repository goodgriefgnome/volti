# Setlists: design

Status: **designed and prototyped, not built into the app.** This document is the hand-off for
whoever builds it. The user made the decisions in section 2. The rest is proposed and shown in the
prototype. Anything marked **Open question** is not settled, so ask the user rather than guessing.

The working prototype is [`prototypes/volti-setlists.html`](prototypes/volti-setlists.html): one
self-contained page with no dependencies. It draws five made-up scores, shows a tablet-shaped app
(the library with setlists, and the reader) and, beside it, the data Volti would store. Section 10
maps its code to this document.

---

## 1. What problem this solves

At a concert, pieces should follow each other without going back to the library between them.
And a concert doesn't always play all of a piece: one verse of a song, or the first two pages.

So a **setlist** is an ordered list of pieces, read as one continuous score, where each piece
plays either whole or **one part of it: a span of its cuts**.

**The piece is the only copy of its cuts and markings.** A setlist never has its own. Cutting,
marking or erasing while reading a setlist changes the piece, everywhere it is played.

### A design that was dropped (don't reintroduce it)

An earlier version of this design gave each setlist its own copy of every piece's cuts, a
copy-on-write ink layer per setlist, and a dialog that offered to update setlists when a piece's
cuts changed. The user walked it back: it was more than setlists need. Nothing of it remains here.

---

## 2. Decisions the user made

| Question | Decision |
|---|---|
| What a setlist owns | **Only an order of pieces, and which part of each to play.** Cuts and markings always belong to the piece. |
| Which part of a piece a setlist plays | **A span of the piece's cuts**, from a first cut to a last, in the piece's order. **No reordering**, skipping or repeating within a piece. |
| Where the part is chosen | **In the reader**: a strip of the piece's frames, with its cuts on them. |
| Pages inserted at a part's edge | **The part grows** to include pages inserted right before its first cut or right after its last, from that setlist's reader. |
| Named parts (later) | **Pieces will have named parts that setlists refer to**, not copy, so changing one changes every setlist that plays it (section 8). |
| Moving between pieces while reading | **One continuous score.** Turning past the end of a piece goes into the next. Each piece starts on a fresh screen. A list in the toolbar jumps to any piece. |
| Where setlists live | **A Setlists section above the scores** on the library page. There is no separate setlist screen. |
| Tapping a setlist or a score | **Always opens the reader.** A setlist's pieces show by **expanding its row** (they slide open) with an arrow button; its **⋯ button** has the rest. |
| Adding pieces | **Press and hold scores** to pick several, then add them to a setlist. Also **Add pieces…** in a setlist's ⋯ menu, which adds at the end. |
| Deleting | **Only archived setlists can be deleted.** |
| Dates | **None.** A setlist has a name only. |

---

## 3. Data model

A proposal, in TypeScript, next to `src/pieces/model.ts`.

```ts
interface Entry {
  id: string;
  pieceId: string;
  /** The cut the part starts on. Missing: the piece's first cut, whatever it is now. */
  first?: string;
  /** The cut the part ends on. Missing: the piece's last cut, whatever it is now. */
  last?: string;
}

interface Setlist {
  id: string;
  title: string;
  archived: boolean;
  entries: Entry[];
}
```

Storage, in `kv` like pieces:

```
setlists        string[]   setlist ids, newest first
setlist:<id>    Setlist
pos:set:<id>    { entry: string; cut: string }   the first cut on the screen you were reading
```

- **An entry plays `piece.cuts[i0..i1]`**, where `i0` is the index of `first` (0 when missing)
  and `i1` the index of `last` (the end when missing). `spanOf()` in the prototype.
- **Missing means "the end, wherever it is"**, so pages inserted before the start or after the end
  of a piece played whole are included. A part is stored with ids only where it doesn't reach the
  piece's start or end: choosing all of it clears both.
- **If an id can't be found** (it shouldn't happen, given section 4), that end falls back to the
  piece's start or end. If the start ends up after the end, the entry plays the whole piece.
- **The same piece can be in a setlist more than once**, as separate entries, with different
  parts.
- **Cuts and markings are stored only in the piece**, as now: `piece:<id>` and `ink:<id>`.

---

## 4. Keeping parts in step when the piece changes

A part names cuts by id, and the piece's edits change ids, so every edit to a piece's cuts also
updates the parts that name them. Do it in the same commit, so undo restores both.

| Piece edit (`src/pieces/model.ts`) | Parts that name the cut |
|---|---|
| `split(X)`: X keeps the upper half, the lower half gets a new id | A part that **ends** on X now ends on the lower half, so it plays the same music. A part that starts on X is unchanged. |
| `joinNext(a, b)`: a takes b's music, b's id goes | A part that starts or ends on **b** now does on **a**. |
| `remove(X)` (deleted or archived) | A part that **starts** on X starts on the next cut; one that **ends** on X ends on the one before. A part that was only X plays the whole piece. |
| `setEdge`, `restoreEdge`, `setPad` | Nothing: ids don't change. |
| `insertPages` / `insertArchived` | New cuts inside a part are played. New cuts **right before a part's first cut or right after its last**, inserted **from that setlist's reader**, join the part: its `first` or `last` moves to the outermost new cut. Inserted from anywhere else (the piece's reader, another setlist), they stay outside it. |

After any of these, a `first` that is now the piece's first cut, or a `last` that is now its last,
is cleared, so the part keeps following the piece's start or end.

Growing the part on insert was the user's decision: pages inserted at a part's edge from the
setlist you are reading are music you mean to play there. The prototype doesn't insert pages, so
this isn't shown in it.

The piece reader needs the setlists that hold the piece to do this. Load them when a piece opens:
there are few.

---

## 5. Choosing the part (the reader's Part button)

- In a setlist's reader, the toolbar has **Part**, for the piece on the screen. Each piece's ⋯
  menu in the library also has **Choose the part to play…**, which opens the reader at that piece
  with the picker open.
- **The picker** is a dialog over the frames, like the insert picker:
  - Title: "Which part of “Sarabande in D minor” does “Spring recital” play?"
  - A horizontal strip of **the piece's frames, laid out as the piece is read**, as thumbnails
    112 px wide, drawn with their markings.
  - **Each cut is a band over its frame**, numbered at its top left, with a dashed brown line
    where one cut meets the next. Cuts outside the part are **shaded dark**.
  - **Tap the first cut, then the last**, as in the insert picker. The first tap selects just
    that cut and outlines it in blue; the second sets the range, in the piece's order whichever is
    tapped first. Tapping the same cut twice gives that cut alone.
  - A live line under the strip: "Plays cuts 2–3 of 5, from page 2 to page 3. Tap the first cut
    to play, then the last." or "Plays the whole piece." While waiting for the second tap: "Starts
    at cut 2. Now tap the last cut to play."
  - **Whole piece** (on the left), **Cancel** and **Done**.
- The strip scrolls to the part's first cut when it opens.
- **Done** saves and shows the first screen of the piece's new part.
- The part is chosen by cut, not by frame, because frames move when cuts change. Choosing a frame
  boundary inside a cut means cutting the piece there first (Edit cuts › Cut in two here).
- Not on an archived setlist.

---

## 6. Screens

### 6.1 Library

Everything about setlists happens on the library page. From the top:

- **Setlists**, with a **New setlist** button. One row per setlist, newest first.
- **Archived (n)**, folded, with archived setlists in the same kind of rows.
- **Scores**, as now, with "in 2 setlists" after the folder when a piece is in any.

### 6.2 Setlist rows

- **Tapping the row** (its name, in the brand serif, and "3 pieces") **plays the setlist** from
  where it was left. A setlist with no pieces says "This setlist has no pieces yet."
- **The arrow at the left** expands the row: its pieces **slide open** beneath it, indented and
  numbered, and the arrow turns down. Tapping it again slides them shut. Which rows are open is
  remembered while the app runs, and a setlist you come back to from the reader is open.
- **Each piece row** has a **drag handle** for reordering, the number, the title and key, and a
  pill such as "Pages 1–2" when it plays only part of the piece. Tapping it **plays the setlist
  from that piece**. Its **⋯ menu** has: Move up, Move down, Choose the part to play…, Play the
  whole piece (when it plays a part), Remove from setlist.
- **Remove from setlist** removes at once, with a toast "Removed “Blue Bossa” from “Spring
  recital”." and an **Undo** button for about six seconds.
- **The setlist's ⋯ menu:**
  - Active setlist: **Add pieces…**, **Rename…**, **Duplicate**, **Archive**.
  - Archived setlist: **Unarchive**, **Duplicate**, **Delete…**. Delete asks first: "Delete
    “Summer wedding”? The pieces, with their cuts and markings, stay in the library."
- **Add pieces…** opens a dialog: a search field, the scores as checkboxes (one already in the
  setlist says so), and **Add n pieces**. They go at the end, each played whole.
- **Rename…** and **New setlist** ask for the name in a small dialog. After naming a new setlist,
  the Add pieces dialog opens.
- **Duplicate** copies the entries, with their parts, under new entry ids, names the copy
  "Spring recital (copy)" and puts it at the top, open.
- An archived setlist's pieces show without handles or menus.

### 6.3 Picking scores

- **Press and hold a score** (500 ms without moving more than 8 px), or right-click it, to start
  picking. The score is picked, every score row shows a checkbox, and a dark bar sticks to the top
  of the library: **Cancel**, "2 scores picked", **Add to setlist**.
- While picking, **a tap ticks or unticks** a score instead of opening it. Unticking the last one
  ends picking. Escape or Cancel ends it too.
- **Add to setlist** opens a menu: "Add 2 pieces to", the active setlists, and **New setlist…**,
  which asks for a name. The picked scores go at the end of that setlist in library order, picking
  ends, the setlist opens, and a toast says "Added 2 pieces to “Spring recital”."
- Android's own long-press menu on the button has to be suppressed
  (`-webkit-touch-callout: none` and `preventDefault` on `contextmenu`). Check on a tablet.

### 6.4 Reading a setlist

- **One continuous run of frames.** Each entry's part is packed with `pack()` on its own, so a
  part that starts partway through a piece starts at the top of a fresh frame.
- **Each piece starts on a fresh screen.** On a two-frame screen where a piece ends on the left
  frame, the right one is a dashed outline that says **Next** and the next title, or **End of the
  setlist** after the last.
- **Frames take each piece's own shape** (its first page), so one screen shows one piece only.
- **Entering a piece** shows a pill at the bottom for about two seconds: "2 OF 3  Gymnopédie No. 1".
- **Toolbar:**
  - **‹ Library** returns to the library, with the setlist's row open.
  - The title reads "2/3 Gymnopédie No. 1".
  - **Pieces** opens a menu of the numbered pieces with the current one ticked. Choosing one jumps
    to its first screen.
  - **Part** (section 5).
  - The position shows screens within the current piece's part: "1 of 2".
- **Pen, Erase, Undo and Edit cuts work exactly as in the piece's own reader**, on the piece.
  While Edit cuts is on, a brown pill under the toolbar says "Cuts changed here change the piece,
  in every setlist".
- Edit cuts shows only the part's cuts. The cuts outside it are edited from the piece itself.
- **Reading position** is stored per setlist, as entry id and cut id.
- **Not prototyped:** a missing score (file moved or removed) should show a blank frame that says
  "Can't find “Blue Bossa”" and carry on with the next piece. Its row in the library says
  "Missing".

### 6.5 Archived setlists

Archiving puts a setlist away: it moves under Archived (n), its order and parts can't be changed,
and it can be deleted. Its pieces are still the pieces as they are now, with today's cuts and
markings, since a setlist has no copies. Reading it works as for any setlist, including marking
the pieces.

---

## 7. Open questions

- **A piece deleted from the library** (an imported PDF removed). Proposal: its entries stay,
  marked Missing, so the setlist recovers if the file comes back. That needs scores to be matched
  again, by file name for instance.
- **Frames per screen** come from the toolbar's Auto / 1 page / 2 pages setting, as in the piece
  reader. The prototype uses the screen's shape only.
- **Data export** (`TODO.md`) should include setlists.

---

## 8. Later: named parts on pieces

The user will want to **define named parts on a piece** ("Verse 1", "Short ending") and have
setlists **refer to them rather than copy them**. Changing a piece's named part then changes every
setlist that plays it. Not part of this work, but build so it fits:

- A named part is the same span, stored on the piece:
  `Piece.parts: { id: string; name: string; first?: string; last?: string }[]`.
- An entry then plays either its own span or a named part: `Entry.part?: string` (a part id) takes
  the place of `first` and `last`. To make that easy, keep the span logic (`spanOf`, the fix-ups in
  section 4) working on any `{ first?, last? }`, not on entries only.
- The fix-ups in section 4 must then also run on the piece's named parts. The insert rule applies
  when inserting from a setlist's reader that plays that named part.
- The Part picker would list the piece's named parts above the strip, plus "Save as a named
  part…". Choosing one makes the entry refer to it.
- **Open question for then:** deleting a named part that setlists use. Probably copy its span into
  each entry that refers to it, so those setlists keep playing the same music.

---

## 9. Building it into Volti: suggested plan

1. **A pure model module, with unit tests first:** `src/setlists/model.ts`, with `spanOf`, entry
   creation, and the part fix-ups of section 4. Test each piece edit with parts that start, end
   on, or are only the edited cut.
2. **Piece edits update parts:** the functions in `src/pieces/model.ts` that change ids (`split`,
   `joinNext`, `remove`) report what changed, or the commit compares ids before and after, so the
   viewer can fix the setlists' parts in the same commit and undo.
3. **Storage:** `src/setlists/store.ts` with the keys in section 3.
4. **The reader over several pieces.** `Viewer` holds one `State` now. Generalise it to a list of
   items, each with a piece, its source PDF and the cuts it plays. A plain piece is a list of one.
   Frames carry their item; edits, ink and undo go to that item's piece. Each item needs its own
   `PageCache` (one PDF per piece); open them lazily, a piece or two ahead.
5. **The Part picker**, built on the insert picker in `src/viewer/edit.ts`.
6. **The library**: setlist rows and picking scores in `src/ui/home.ts`.

Rules for this repo:

- Pin dependencies to their newest major versions.
- Keep code comments plain and sparse, like the existing files.
- Don't open pull requests unless asked.

---

## 10. Prototype map

| Concern | Where in `prototypes/volti-setlists.html` |
|---|---|
| Example scores and page drawing | `SCORES`, `pageLayout()`, `drawPage()` |
| Data shape and example data | the comment above `let D`, `seed()` |
| A part of a piece | `spanOf()`, `spanLabel()` |
| Piece edits keeping parts in step | `editCut()`, `forEntries()` |
| Library | `renderHome()`, `lib` (open rows, picked scores) |
| Setlist rows and their menus | `setlistRow()`, `entryRow()`, `dragToReorder()`, `addPieces()`, `askName()`, `confirmDelete()` |
| Picking scores | `scoreRow()`, `togglePick()`, `pickBar()`, `addPicked()` |
| Reader layout and turning | `build()`, `show()`, `paintFrame()`, `drawSlot()`, `turn()` |
| The Part picker | `openPartPicker()` |
| Data view | `renderInspector()` |

**The example:**

- **Spring recital:** Sarabande (with a repeat, played whole), Gymnopédie No. 1 (pages 1–2 only)
  and Autumn Leaves.
- **Café Lumen, Friday:** Autumn Leaves, Blue Bossa, and the Ave Maria's first two pages.
- **Summer wedding** (archived): Ave Maria and Sarabande.

To see a part follow the piece: in Spring recital, choose cuts 2–3 of the Sarabande, then with
Edit cuts cut page 2 in two. The part still starts and ends on the same music, and the data view
shows its new end.

**Known prototype shortcuts:**

- Cuts are edited from a menu on the music (cut in two, cut away above or below, restore, remove)
  instead of the app's tabs. Joining, inserting pages and padding are left out.
- One pen colour, no highlighter, and undo keeps whole copies of the data.
- Whether a cut shows a stroke uses the stroke's middle point, not `share()`.
- Removed cuts are dropped, not archived.
- Frames per screen follow the screen's shape. Missing scores aren't handled.
