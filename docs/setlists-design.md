# Setlists: design

Status: **designed and prototyped, not built into the app.** This document is the hand-off for
whoever builds it. The user chose the four main directions in section 2. The rest is proposed and
shown in the prototype. Anything marked **Open question** is not settled, so ask the user rather
than guessing.

The working prototype is [`prototypes/volti-setlists.html`](prototypes/volti-setlists.html): one
self-contained page with no dependencies. It draws five made-up scores, shows a tablet-shaped app
(library with setlists, reader) and, beside it, the data Volti would store. Section 10 maps its
code to this document.

---

## 1. What problem this solves

A performer plays a piece differently from one concert to the next. One evening needs the repeat,
another doesn't; markings for the recital ("breathe here", "watch the singer") don't belong in
the café gig. And at a concert the pieces should follow each other without going back to the
library between them.

So a **setlist** is an ordered list of pieces, where **each piece has its own copy of the played
order and its own markings**, which start out the same as the piece's.

---

## 2. Decisions the user made

| Question | Decision |
|---|---|
| How to move between pieces while reading a setlist | **One continuous score.** Turning past the end of a piece goes into the next. Each piece starts on a fresh screen. A list in the toolbar jumps to any piece. |
| What happens to setlists when a piece's cuts change | **Only setlists that never changed that piece's cuts are offered the update**, one checkbox each. Setlists with their own cuts keep them and are only listed. |
| Where setlists live | **A Setlists section above the scores** on the library page. There is no separate setlist screen. |
| Tapping a setlist or a score | **Always opens the reader.** A setlist's pieces show by **expanding its row** (they slide open) with an arrow button; its **⋯ button** has the rest. |
| Adding pieces | **Press and hold scores** to pick several, then add them to a setlist. Also **Add pieces…** in a setlist's ⋯ menu, which adds at the end. |
| Deleting | **Only archived setlists can be deleted.** |
| Dates | **None.** A setlist has a name only. |
| Markings made while reading a setlist | **Stay in the setlist.** To mark the piece itself, open the piece. |

Already decided earlier (in `TODO.md`): archived setlists are frozen, and setlist ink is a
copy-on-write layer over the piece's, by cut id.

---

## 3. Vocabulary

| Term | Meaning |
|---|---|
| **Setlist** | A named list of pieces in concert order. |
| **Entry** | One piece in a setlist. It has its own copy of the piece's cuts. The same piece can be in a setlist more than once, as separate entries. |
| **Own cuts** | The setlist changed this entry's cuts itself. Shown as an "Own cuts" pill. |
| **The piece's older cuts** | The setlist never changed this entry's cuts, but the piece's cuts have changed since they were copied (the user said no to the update). Shown as a grey pill. |
| **Layer** | An entry's own ink: strokes by cut id, read before the piece's ink. |
| **Archived** | Frozen as it was played: no longer updated from its pieces, read-only. |

---

## 4. Data model

A proposal, in TypeScript, matching `src/pieces/model.ts`.

```ts
interface Cut {
  // ...as now: id, page, y0, y1, pad?, ownInk?
  /** In a setlist only: the piece cut this one was made from. Its ink is read until it has its own. */
  from?: string;
}

interface Entry {
  id: string;
  pieceId: string;
  /** This setlist's played order for the piece. Starts as a copy of the piece's cuts, same ids. */
  cuts: Cut[];
  /** Removed cuts that had ink of their own, as Piece.archived. */
  archived: Cut[];
  /** The setlist has changed these cuts itself. Cleared when it takes the piece's cuts again. */
  edited: boolean;
}

interface Setlist {
  id: string;
  title: string;
  archived: boolean;
  entries: Entry[];
}

/** An entry's own ink. `own` is false for strokes it was only given a copy of (section 5.3). */
type Layer = Record<string, { strokes: Stroke[]; own: boolean }>;
```

Storage, in `kv` like pieces:

```
setlists           string[]   setlist ids, newest first
setlist:<id>       Setlist
layer:<entryId>    Layer
pos:set:<id>       { entry: string; cut: string }   the first cut on the screen you were reading
```

**Change from `TODO.md`:** the layer is **per entry** (`layer:<entryId>`), not per setlist
(`ink:<setlistId>`). If a piece is in a setlist twice, both entries start with the same cut ids,
so one layer per setlist would mix their markings.

---

## 5. Ink

### 5.1 Reading

For a cut `c` of an entry `e`:

```
strokes(e, c) = layer(e)[c.id]?.strokes ?? pieceInk[c.from ?? c.id] ?? []
```

then filtered by `visible()` against `c`'s own `y0..y1`, as now. So the piece's markings show
through until the setlist changes something on that cut, and a setlist cut made from part of a
piece cut shows the piece's markings for just that part.

### 5.2 Changes made in a setlist

- **The first draw or erase on a cut** copies what it shows (`pieceInk[c.from ?? c.id]`) into
  `layer[c.id]`, marked `own: true`, then applies the change there. Later draws and erases change
  the layer only.
- **A cut whose shape changes** (a tab dragged, its top or bottom restored) **gets a new id** with
  `from` set to the piece cut it came from (`c.from ?? c.id`). Its layer, if any, moves to the new
  id.
- **Cutting a cut in two** gives both halves new ids with the same `from`. A layer, if any, is
  split between them with `splitStrokes()`, as the piece does.
- **Joining** gives the joined cut a new id with `from` of the upper cut. Layers are combined.
- **Inserting pages** in a setlist adds cuts with fresh ids and no `from`. Each gets a layer that
  is a copy of the page's first-pass markings, as `insertPages(..., copyInk)` does for the piece.
- **Removing a cut** archives it in `entry.archived` if its layer has `own` strokes, as the piece
  does with `ownInk`; otherwise its layer is dropped.
- Any of these sets `entry.edited = true`.

### 5.3 When the piece changes: copying ink down

**This is needed and not mentioned in `TODO.md`.** The piece's own edits rewrite its ink record.
For example, `split()` moves the lower half's strokes from `ink[X]` to the new lower cut, and
`joinNext()` deletes `ink[b]`. A setlist that still has cut `X` and reads the piece's ink would
lose markings it was showing.

Rule: **on any commit that changes the piece's cuts or archived cuts**, for each cut id `X` whose
ink entry changed or disappeared, every entry of every **non-archived** setlist that has a cut
reading `X` (`(c.from ?? c.id) === X`) and no layer for that cut gets
`layer[c.id] = { strokes: copy of the old ink[X], own: false }`.

Plain drawing and erasing on the piece don't copy anything down. Those changes are meant to show
through to setlists that haven't marked that cut themselves.

### 5.4 Archiving

Archiving a setlist gives every cut without a layer a copy of the piece's ink it shows
(`own: false`). After that, nothing the piece does reaches the setlist, and copying down skips it.

---

## 6. Updating setlists when a piece's cuts change

- **When:** on leaving a piece opened from the library (the reader's Library button or Back), if
  its cuts differ from when it was opened (`sameLayout` in `viewer.ts`).
- **Which:** entries of that piece in **non-archived** setlists. Those with `edited === false` get
  a checkbox, **ticked by default**. A setlist with the piece twice shows "(piece 2)" and the like.
  Those with `edited === true` are listed under "Keeping their own cuts", with no checkbox.
- **The dialog:** "Update setlists with the new cuts of “Sarabande in D minor”?", the checkboxes,
  the kept list, then **Leave them as they are** and **Update**.
- **No dialog** when no setlist has the piece. When every setlist with it has its own cuts, a
  toast says "Spring recital keeps its own cuts of this piece."
- **Updating an entry** (`takePieceCuts` in the prototype):
  1. `entry.cuts` becomes a copy of the piece's cuts, same ids. `edited` becomes false.
  2. Layer entries with `own: false` are dropped, so the piece's ink shows through again.
  3. Layer entries with `own: true` stay if their cut id is still there. If the cut is gone, each
     stroke the setlist added itself (one whose stroke isn't in the piece's ink) moves to the
     first new cut of the same page that shows it, which gets a layer copied from the piece's ink
     plus that stroke. Strokes no cut shows are archived with the old cut.
- **Leave them as they are:** those entries keep the piece's older cuts and stay `edited: false`.
  They are offered the update again the next time the piece's cuts change.
- **"Use the piece's cuts…"** is in each piece's ⋯ menu under its setlist when it has own cuts
  or the piece's older cuts. It confirms first, then does the same update. This is how a setlist
  with its own cuts gets back in step.
- **Open question:** should an entry offered the update and declined be offered again next time?
  The prototype offers it again.

---

## 7. Screens

### 7.1 Library

Everything about setlists happens on the library page. From the top:

- **Setlists**, with a **New setlist** button. One row per setlist, newest first.
- **Archived (n)**, folded, with archived setlists in the same kind of rows.
- **Scores**, as now, with "in 2 setlists" after the folder when a piece is in any.

### 7.2 Setlist rows

- **Tapping the row** (its name, in the brand serif, and "3 pieces") **plays the setlist** from
  where it was left. A setlist with no pieces says "This setlist has no pieces yet."
- **The arrow at the left** expands the row: its pieces **slide open** beneath it, indented and
  numbered, and the arrow turns down. Tapping it again slides them shut. Which rows are open is
  remembered while the app runs, and a setlist you come back to from the reader is open.
- **Each piece row** has a **drag handle** for reordering, the number, the title and key, and an
  "Own cuts" or "Piece's older cuts" pill (section 3). Tapping it **plays the setlist from that
  piece**. Its **⋯ menu** has: Move up, Move down, Use the piece's cuts… (when it has own or
  older cuts), Remove from setlist.
- **Remove from setlist** removes at once, with a toast "Removed “Blue Bossa” from “Spring
  recital”." and an **Undo** button for about six seconds.
- **The setlist's ⋯ menu:**
  - Active setlist: **Add pieces…**, **Rename…**, **Duplicate**, **Archive**.
  - Archived setlist: **Unarchive**, **Duplicate**, **Delete…**. Delete asks first: "Delete
    “Summer wedding”? Its own cuts and markings are deleted too. The pieces stay in the library."
- **Add pieces…** opens a dialog: a search field, the scores as checkboxes (one already in the
  setlist says so), and **Add n pieces**. They go at the end, each with a copy of the piece's
  cuts as they are now.
- **Rename…** and **New setlist** ask for the name in a small dialog. After naming a new setlist,
  the Add pieces dialog opens.
- **Duplicate** copies entries and layers with new entry ids, keeps `edited`, names the copy
  "Spring recital (copy)" and puts it at the top, open.
- An archived setlist's pieces show without handles or menus.

### 7.3 Picking scores

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

### 7.4 Reading a setlist

- **One continuous run of frames.** Each entry is packed with `pack()` as a piece is now.
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
  - The position shows screens within the current piece: "1 of 2".
- **Pen, Erase, Undo** work as now and write to the entry's layer (section 5.2).
- **Edit cuts** works as now, on the entry's cuts. While it is on, a brown pill under the toolbar
  says "Cuts changed here apply to “Spring recital” only".
- **Reading position** is stored per setlist, as entry id and cut id.
- An **archived** setlist opens read-only: Pen, Erase and Edit cuts are disabled.
- **Not prototyped:** a missing score (file moved or removed) should show a blank frame that says
  "Can't find “Blue Bossa”" and carry on with the next piece. Its row in the library says
  "Missing".

---

## 8. Open questions

- **Unarchiving:** the prototype keeps the copies made on archiving, so the piece's later
  markings don't show through. Alternatively, unarchiving could drop copies that still match the
  piece. Ask.
- **Declined updates** being offered again (section 6).
- **A piece deleted from the library** (an imported PDF removed): the prototype doesn't cover it.
  Proposal: setlist entries stay, marked Missing, so their cuts and layers survive re-importing
  the file. That needs scores to be matched again, by file name for instance.
- **Frames per screen** come from the toolbar's Auto / 1 page / 2 pages setting, as in the
  piece reader. The prototype uses the screen's shape only.
- **Data export** (`TODO.md`) should include setlists and layers.

---

## 9. Building it into Volti: suggested plan

1. **A pure model module, with unit tests first:** `src/setlists/model.ts`, with:
   - entry creation from a piece
   - the setlist versions of split, join, setEdge/release, restore, insert and remove (new ids
     with `from`, layer moves)
   - `strokesFor`, copy-on-first-write, `copyDown`, `archive` and `takePieceCuts`
   Reuse `src/pieces/model.ts` where the logic is the same. Most of the cut maths is identical;
   only ids and ink differ.
2. **Storage:** `src/setlists/store.ts` with the keys in section 4, and a saver like
   `pieceSaver`.
3. **Copying down from the piece:** in the piece reader's commit, when the cuts or archived cuts
   changed, call `copyDown` for the cut ids whose ink changed. This needs the setlists that hold
   the piece. Load them at open: there are few.
4. **The reader over several pieces.** `Viewer` holds one `State` now. Generalise it to a list of
   items, each with a piece, its source PDF, its cuts and how its ink is read and written. A plain
   piece is a list of one. Frames carry their item. `CutEditor` works on one item at a time: the
   one whose frame was touched. Undo entries record which item they belong to. Each item needs
   its own `PageCache` (one PDF per piece); open them lazily, a piece or two ahead.
5. **The update dialog** on leaving a piece, then **the setlist rows** and **picking scores** in
   `src/ui/home.ts`.

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
| Reading ink, copy on first write | `strokesFor()`, `writableStrokes()` |
| Copying ink down from the piece | `copyDown()`, called from `editCut()` |
| Archiving | `archive()` |
| Taking the piece's cuts | `takePieceCuts()`, `confirmTakeCuts()` |
| Cut edits, piece vs setlist | `editCut()` |
| Library | `renderHome()`, `lib` (open rows, picked scores) |
| Setlist rows and their menus | `setlistRow()`, `entryRow()`, `dragToReorder()`, `addPieces()`, `askName()`, `confirmDelete()` |
| Picking scores | `scoreRow()`, `togglePick()`, `pickBar()`, `addPicked()` |
| Reader layout and turning | `build()`, `show()`, `drawSlot()`, `turn()` |
| The update dialog | `closeReader()`, `offerUpdates()` |
| Data view | `renderInspector()` |

**The example:**

- **Spring recital:** Sarabande (with a repeat), Gymnopédie No. 1 (with its own cuts: the title
  is cut away) and Autumn Leaves (with a red mark added in the setlist only).
- **Café Lumen, Friday:** Autumn Leaves, Blue Bossa, Gymnopédie No. 1, all as the pieces.
- **Summer wedding** (archived): Ave Maria and Sarabande.

To see the update dialog, open the Gymnopédie from the scores, change a cut, and go back.

**Known prototype shortcuts:**

- Cuts are edited from a menu on the music (cut in two, cut away above or below, restore, remove)
  instead of the app's tabs. Joining, inserting pages and padding are left out.
- One pen colour, no highlighter, and undo keeps whole copies of the data.
- Whether a cut shows a stroke uses the stroke's middle point, not `share()`.
- Removed setlist cuts are dropped, not archived.
- Frames per screen follow the screen's shape. Missing scores aren't handled.
