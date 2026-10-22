# Pieces, cuts and frames: design

Status: **built into the app** for PDFs (section 8 says where), without setlists, images as a
source or the whiteout tool. The user has agreed to the design as described here. Anything
marked **Open question** was not settled, so ask the user rather than guessing.

The working prototype is [`prototypes/volti-frames.html`](prototypes/volti-frames.html): one
self-contained page that loads pdf.js 3.11.174 from cdnjs. To try it, open it in a browser (any
static server, or `file://` if your browser allows the CDN script). It starts with a made-up
three-page example score, and you can open a real PDF or images. Section 9 maps its code to this
document.

---

## 1. What problem this solves

Volti currently shows PDF pages as they are: one or two pages per screen, turned in page order.
Real performance needs more than that:

- **Repeats and jumps.** The played order revisits pages, e.g. "page 3 up to the repeat sign, then
  back to the last system of page 2, then page 3 again".
- **Cutting music away.** Titles, the half of a page you don't play this time, or sections cut
  for a performance.
- **Avoiding early page turns.** If a page has been mostly cut away, the next screen should be
  filled with music from the following page, not left half empty.

The user's own framing: *a sequence of PDF pages (possibly repeated), a way to discard vertical
spans of pages, and a way to reflow (affecting later pages).*

### Designs that were tried and dropped (don't reintroduce them)

1. **Systems as the atomic unit.** This version auto-detected systems from the ink, built the
   played order as "passes" (play system A to system B), and reflowed individual systems onto
   the screen. The user decided it was too complicated for its benefits, so it was dropped.
2. **Editing on the raw page next to a separate reading view.** This had a page editor with
   dotted lines, a played-order list and a reading preview. The user didn't like the UI. All
   editing now happens **in the frame view** (the reading view itself).
3. A toolbar "Insert pages…" button, a "Cut out music" tool, menus on plain tap, and a "Show room
   left" checkbox. All of these were removed at the user's request. What replaced each is
   described below.

---

## 2. Vocabulary

Use these words in the UI. The user chose "cut" to mean the *piece of paper*, not the gap.

| Term | Meaning |
|---|---|
| **Source** | A PDF, or a set of image files ordered by file name. A piece comes from **one PDF only**, or from a set of images whose page **widths are meant to match** (scale them all to the same width). |
| **Page** | One page of the source. |
| **Cut** | A horizontal band of one source page: `page`, `y0..y1` (fractions of the page height, 0 = top). Called `part` in the prototype's code. |
| **Played order** | The piece's flat list of cuts, in the order they're played. The same page can appear any number of times. |
| **Frame** | A page-shaped area on the screen. Cuts are stacked into frames. Landscape shows two frames side by side; portrait shows one. |
| **Split** | Two consecutive cuts of the same page that touch (`a.y1 === b.y0`). It lets the top of a page sit on an earlier frame, or gives each part its own tabs, to trim the space between systems (or words). |
| **Music cut out** | The gap between two consecutive cuts of the same page when `b.y0 > a.y1`. Nothing marks it on the frame. |
| **Trim** | A cut whose `y0 > 0` or `y1 < 1` where it meets a *different* page (or nothing). In other words, the top or bottom of a page was cut away. |
| **Pad** | Optional white space above a cut, used only when that cut starts a frame. |

A piece also has a **title**, a **key** and an **orientation** (portrait or landscape). **Tags**
(for search) come later and are low priority. Title and key are first-class fields, not tags.

---

## 3. Data model

A proposal for the app, in TypeScript. It mirrors the prototype.

```ts
interface Cut {
  id: string;        // stable: ink and reading position refer to it
  page: number;      // 0-based page of the source
  y0: number;        // top, as a fraction of the page height
  y1: number;        // bottom, as a fraction of the page height; y1 > y0
  pad?: number;      // white space above, in page widths, used only when this cut starts a frame
  ownInk?: boolean;  // someone has drawn or erased on this cut (section 6)
}

interface Piece {
  id: string;
  sourceId: string;  // one PDF (Score.id today) or one image set
  title: string;
  key: string;
  orientation: 'portrait' | 'landscape';
  cuts: Cut[];       // the played order
  archived: Cut[];   // removed cuts that had their own ink (section 6)
  // later: tags
}
```

- **A new file becomes one piece:** every page once, in order, `y0 = 0`, `y1 = 1`. Default
  orientation: landscape (two frames) for portrait-shaped pages, as in the prototype.
- **Invariant after every edit** (`tidy()`): drop cuts thinner than 0.004 of a page.
- **Splits are never joined automatically.** The prototype joined a split whose halves landed
  on the same frame; the user dropped that rule, because cuts of one page that touch are how you
  trim the space between systems (or words). Joining is done from a tab's menu.
- **The played order alone defines what is "cut out".** There is no separate record of removed
  bands. A gap is music cut out only if the two cuts either side of it are from the same page
  and in page order (`b.y0 >= a.y1`). If the next cut jumps backwards (a repeat), the seam
  between them is just a seam between two cuts.

---

## 4. Reflow (layout)

All sizes are in **page widths**. Frames take the shape of the first page:
`H = page0.height / page0.width`. Every cut is drawn at the full frame width, so the scale is
the same for the whole piece and nothing is ever scaled per cut. Image sources are scaled to a
common width.

```
pack(cuts):                         // prototype: pack()
  frames = []; open = null
  for each cut c:
    h = (c.y1 - c.y0) * aspect(c.page)
    if open is null or open.fill + h > H (+1e-6):
      open = { items: [], fill: min(c.pad ?? 0, H - h) }   // pad only when the cut starts a frame
      frames.push(open)
    open.items.push(c); open.fill += h
  return frames
```

- This is **greedy, in played order, with no lookahead.** A cut that doesn't fit on the open
  frame starts a new one.
- A cut taller than a frame can only come from a page taller than the first page. **Open
  question:** pages of different aspect ratios in one PDF aren't handled specially; the
  prototype just clips them.
- **Screens:** landscape shows frames `2k` and `2k + 1` side by side; portrait shows one frame.
  Forward and Back move by a screen. The prototype keeps a "current frame" index only to know
  which screen to show.
- A frame's content is drawn from its top. Space left at the bottom stays white.
- Fit the frames to the stage at the page's aspect ratio, as `fitPages` in
  `src/viewer/layout.ts` does today.

---

## 5. Editing: all done on the frames

There is no separate editor. The user edits the frames they will read from. The prototype is
always in edit mode. **Decided:** in the app, editing cuts is a **toggle button on the toolbar**
that shows the UI below. Nothing in it gets in the way of the reader's normal functions: taps
on the music still turn pages, and the ink tools still work. Only the tabs, the split cue's line
and the menus take touches. A tab drag wins over a stroke when the pointer goes down on a tab.
While an ink tool is selected, a long press on the music draws rather than opening a menu
(right-click still opens it).

### 5.1 Tabs (drag handles)

- **Every cut on a frame has two tabs:**
  - at its **top left**, which moves its `y0` (its start)
  - at its **bottom right**, which moves its `y1` (its end)
- **Style:**
  - Each tab is 30×14 CSS px and sits **flush against the frame's left or right edge**. The
    corners where it meets the seam and the frame edge are square; only the one free corner is
    rounded (radius 6).
  - Tabs are **faint**: brown (`--accent`) at 38% opacity. While being dragged, a tab is solid
    blue (`--select`).
  - Bottom tabs hang above the seam, and top tabs hang below it.
- **Hit area:** about 56×34 px around the tab, generous for fingers.
- **Dragging a bottom tab (`y1`):**
  - Dragging **up** trims the end of the cut. Dragging **down** brings back music below it.
  - It's clamped between `y0` (cutting all of it away) and either the next cut's `y0`, if the
    next cut is the same page further down, or else 1.
- **Dragging a top tab (`y0`):**
  - Dragging **down** trims the start of the cut.
  - Dragging **up** brings back music above it. **The cut's top stays where it is on the
    frame, and the cut grows downwards**, pushing the music below it down. This is the same
    visual effect as dragging a bottom tab down; the user asked for this specifically.
  - It's clamped between the previous cut's `y1`, if that cut is the same page further up, or
    else 0, and `y1`.
- **During a drag:**
  - The layout is **frozen**: cuts stay on the frames they were on.
  - Music being cut away stays visible, **hatched** (dark grey wash with white diagonal lines),
    so you can see exactly what you're removing.
  - Music being brought back is shown normally. The frame is clipped, so content pushed off the
    bottom simply disappears for the moment.
- **On release, the score reflows.** Cuts dragged to zero height are removed. The view stays on
  the frame that holds the edited cut, or its neighbour if the cut was removed.
- **A movement of more than 4 px counts as a drag.** Less than that is a tap, which does
  nothing on a tab.

### 5.2 White space at the top of a frame

- A **grey tab at the top right** of every frame (same shape and style, grey `#5b6170`)
  sets the first cut's `pad`. Dragging it down adds white space above the music, up to 0.6 of
  a frame's height.
- While there's a pad, a faint dashed line marks where the music starts.
- `pad` belongs to the cut and only counts when that cut starts a frame (section 4). If a later
  reflow moves the cut down a frame, its pad is ignored, and comes back if the cut starts a
  frame again.

### 5.3 Room on the frame before, and "Cut here"

This is the user's "reflow": splitting a later page so its top fills the space on an earlier
frame.

- **The room left on the frame before is shaded.** On frame *n*, if frame *n − 1* is **more
  than 20% empty** (`ROOM_CUE = 0.2`), a very faint warm tint (`rgba(138,90,18,.06)`) covers
  frame *n* from its top down to the height of that room. It is always on (in edit mode), and
  hidden during a drag. There is no line and no pill.
- **"Cut here"** in the menu on a cut's music (section 5.4) splits the cut exactly where it was
  pressed, with no snapping. While the menu is open, a blue dashed line marks the place.
  - Pressed inside the shading, the top half fits on the frame before and moves there.
  - Pressed anywhere else, both halves stay where they are, now as two cuts with their own
    tabs, for trimming the space between them.
  - It isn't offered within 1% of a page of the cut's top or bottom.
- The prototype's tappable "✂ split page here" line, and snapping the split to a gap between
  systems, were dropped at the user's request.

### 5.4 Context menus

- **Menus open only on a right-click or a long press**, never on a plain tap. A long press is
  500 ms without moving more than 6 px. A tab's long press cancels its drag.
- Android Chrome may also fire `contextmenu` on a long press. Opening the same menu twice is
  harmless, but check this on a real tablet; it wasn't tested on one.
- **The menu** is a small popover beside the tab or under the finger, kept inside the stage. It
  has a grey label line saying what was pressed, then actions. It closes on Escape, on a tap
  elsewhere, or after an action. After an action the score reflows, except for "Insert…",
  which opens the picker.

| Pressed on | Label | Actions |
|---|---|---|
| A **tab** next to music cut out (the neighbouring cut is the same page, in order, with a gap) | "Top of this cut (page N)" or "Bottom of this cut (page N)" | **Restore the music cut out above** (or **below**): merge the two cuts into one. **Remove this cut.** |
| A **tab** at a split (the neighbour is the same page and touches) | same | **Join with the cut above** (or **below**): merge them. **Remove this cut.** |
| A **tab** at a trimmed page edge (the neighbour is a different page, or there is none) | same | **Restore the top of the page** (`y0 = 0`) or **Restore the bottom of the page** (`y1 = 1`), when trimmed. **Remove this cut.** |
| The **white-space tab** | "Space above the music" | **Remove the white space**, when there is some. |
| The **music** of a cut | "Cut from page N" | **Cut here** (section 5.3). **Insert pages before this cut…** **Insert pages after this cut…** **Remove this cut.** |
| **Blank space** on a frame, above its first cut (a pad) or below its last | "Above the music" or "Below the music" | **Insert pages here…**: before the frame's first cut, or after its last. |

- "Remove this cut" isn't offered when the piece has only one cut.
- "Remove this cut" is how you delete a whole repeat or a page. Note that a full page's own
  white margin counts as part of that cut, not as blank space.

### 5.5 Inserting pages

- "Insert…" opens a **picker over the frames**, as a dialog inside the stage:
  - A title such as "Insert pages after this cut (page 3)" or "Insert pages here".
  - A horizontal strip of **thumbnails of the piece's source pages**, 84 px wide, numbered.
  - **Tap one page, then another, to choose a range.** Tapping the same page twice gives just
    that page, and the next tap starts a new range. A range always runs in page order: tapping
    a page before the first one makes the range run from it up to the first.
  - The selection starts on the cut's own page and is scrolled into view.
  - A hint line ("Pages 1–2.") and **Cancel** and **Insert** buttons.
- Inserted pages are whole (`y0 = 0`, `y1 = 1`). After inserting, reflow and show the frame
  holding the first inserted page.
- **Open question (deferred by the user):** "the PDF page range that represents the piece". A
  PDF may hold several pieces. For now the picker shows every page of the source; later it
  should probably show the piece's page range, with a way to reach the rest.

---

## 6. Ink (annotations): decided, not prototyped

- **Ink belongs to one cut of the played order, not to the source page.** A marking made on the
  second time through a repeat must not appear on the first. This was decided early, as the
  "frame layer" decision.
- Hiding a first ending on the second time through is done with ink (a **whiteout** tool), not
  with a cut. Cuts are horizontal bands only. Whiteout comes later.
- **The guiding rule is no information loss.** Nothing the user drew is ever thrown away by an
  edit to the cuts.
- **Storage:** `ink:<pieceId>` → `{ [cutId]: Stroke[] }`. A stroke is unchanged from
  `src/ink/model.ts`: points in **source-page coordinates** (x as a fraction of page width, y as
  a fraction of page height). Trimming, padding and reflow never rewrite strokes. Points may lie
  outside the cut's `y0..y1`, or outside the page.
- **Majority by path length.** Wherever a stroke has to be given to one cut, or tested against
  a band, measure how much of its **path length** (in page widths, so vertical distance is
  scaled by the page's aspect) lies in each band. A stroke of a single point counts as wholly
  in the band that holds it.
  - **Drawing:** while the pen is down, points are in frame coordinates. At pen-up the stroke
    goes to the cut on the frame that holds most of its length (or the nearest cut, if none),
    and every point is converted to that cut's page coordinates.
  - **Showing:** a cut draws a stroke **whole, never clipped**, when most of its length lies
    inside the cut's current `y0..y1`, and hides it otherwise. Trimming away the music under a
    marking hides it; bringing the music back shows it again.
  - **Split:** each stroke goes to the half that holds most of it.
  - **Join** or **"restore the music cut out"**: the union of both cuts' strokes.
- **A cut's own ink.** A cut is marked `ownInk` the first time anyone draws or erases on it.
- **Remove:** a cut with `ownInk` is **archived**, not deleted: it moves to the piece's
  `archived` list with its id, so its ink stays put. A cut without its own ink (none, or only an
  untouched copy) is simply deleted; undo covers it.
  - The insert picker shows archived cuts beside the page thumbnails. Inserting one brings back
    the original cut, with its ink.
  - A separate "Archived cuts" dialog deletes them permanently, ink and all.
  - Cuts dragged to zero height follow the same rule.
- **Insert copies ink**, by a "Copy markings" checkbox in the insert picker, **on by default**.
  For each inserted page, the copied strokes are those from the first time each part of the
  page is played: walk the page's cuts in played order and take each stroke whose majority lies
  in that cut's band and not in a band already walked. Copies are independent, and the new cut
  starts without `ownInk`.
- **Setlists are copy-on-write.** A setlist's played order keeps the piece's cut ids until a
  cut changes. Its ink is a layer, `ink:<setlistId>` → `{ [cutId]: Stroke[] }`, read before the
  piece's. The first draw or erase on a cut in a setlist copies that cut's strokes from the
  piece into the layer. A cut whose shape changes in a setlist gets a new id that remembers the
  id it came from, so it keeps reading the piece's ink until its own ink is first edited.
- **Migration:** today ink is `ink:<scoreId>` → `{ [pageNumber]: Stroke[] }`. A score with no
  piece yet is equivalent to one cut per page, so that ink moves to those cuts one-to-one, and
  those cuts get `ownInk`.

---

## 7. Setlists, and things decided but not designed in detail

- A **setlist** is a list of pieces. It keeps **its own copy of each piece's played order**,
  normally with more cuts made for that performance.
- When a piece changes, offer a **checkbox per setlist** that contains it, so the user can
  choose which setlists to update.
- **Archived setlists are frozen.**
- **Replacing a PDF with a new edition is not supported** yet. Ink and cuts refer to page
  numbers and positions.
- **Later:**
  - synthetic pages (systems arranged by hand)
  - jump markers (D.S., coda) that generate the played order
  - tags for search
  - bringing back a cut that was removed (today: insert the page again)
- **Data export**, low priority (see `TODO.md`).
- **Page-turn strategies** (half-page turns and the like): the user explicitly deferred this to
  a separate discussion. Don't design it as part of this work.
- **Reading position:** today it's `page:<scoreId>` → page number. **Proposal:** store the id
  of the first cut on the current frame, and fall back to frame 0 if that cut is gone.

---

## 8. In the app

- `src/pieces/model.ts`: the pure model. `pack`, `tidy`, `freeze` (the layout held still during a
  drag), trims and their clamps, pad, split and `cutAt`, join, restore, `roomBefore`, insert
  (pages or an archived cut), remove and archive, and `setInk`. Every edit takes the piece and
  its ink together (`State`) and returns a new one, so undo keeps whole states.
- `src/pieces/ink.ts`: the share of a stroke's path length in a band, which strokes a cut shows,
  splitting ink, choosing the markings to copy on insert, and `claimStroke` for pen-up.
- `src/pieces/store.ts`: `piece:<id>`, `ink:<id>` (by cut, written in the same transaction as
  the piece) and `pos:<id>`, and the migration from `ink:<id>` by page and `page:<id>`. One
  piece per score for now, with the score's id.
- `src/viewer/viewer.ts` draws frames: each one a canvas with the cuts' bands drawn from pages
  rendered at the frame's width (`src/viewer/frames.ts`), and an ink canvas on top. Turning
  moves by screen. The close-up while zoomed renders each cut's part of the visible region.
- `src/viewer/edit.ts`: edit mode, as DOM elements over each frame (tabs are buttons; from the
  keyboard they open their menu), the menus, the insert picker and the archived-cuts dialog.
- **Edit cuts** on the toolbar switches edit mode. While it is on and the toolbar shows, the
  frames sit below the toolbar, so the tabs at their tops can be reached. **Archived (n)** on the toolbar opens the archived-cuts dialog.
- Frames per screen still come from the toolbar's **Auto / 1 page / 2 pages** setting, for all
  scores. The piece's `orientation` is stored but not used yet. **Open question:** should it
  replace that setting, per piece?
- Images as a source: a later step, together with the library work.

Rules for this repo:

- Pin dependencies to their newest major versions.
- Keep code comments plain and sparse, like the existing files.
- Don't open pull requests unless asked.

---

## 9. Prototype map

In `prototypes/volti-frames.html`, a cut is called `part`, `state.parts` is the played order,
and `fi` is a frame index.

| Concern | Where |
|---|---|
| Constants | `RENDER_WIDTH = 1600`, `ROOM_CUE = 0.2`, `LONG_PRESS = 500`, `TAB_W = 30` |
| Layout | `pack()`, `frameH()`, `per()` |
| Invariants and reflow | `tidy()`, `reflow(focusId)` |
| Snapping a split | `rowInk(page)`, `snapSplit(page, y, lo)` |
| Drawing frames, hatching, seams, tabs, cue | `render()`, `hatchBand()`, `tab()`, `pill()` |
| Pointer input, drags, long press | `pointerdown`, `pointermove`, `pointerup` handlers, `endDrag()`, `endPress()` |
| Context menus | `openContext(p)`, `tabActions(h)`, `cutActions(i)`, `blankActions(fi, y)`, `showMenu()` |
| Split from the cue | `pullUp(h)` |
| Insert picker | `openPicker()`, `buildThumbs()`, `pickPage()`, `insert()` |
| File loading | `loadPdf()`, `loadImage()`, `$('file').onchange` (one PDF, or images sorted by name) |
| Example score | `drawExamplePage()`, `loadExample()` |

**The example score** is a made-up sarabande on three pages, with three systems per page. A
repeat starts at page 2's last system and ends after page 3's first system. Its played order is:

1. page 1
2. page 2
3. page 3, trimmed to its first system
4. page 2, trimmed to its last system
5. page 3

Frame 3 is then about half empty, so frame 4 shows "✂ split page here". Tapping it moves page
3's first two systems up onto frame 3.

**Known prototype shortcuts:**

- It is always in edit mode, with no ink.
- The screen is a fixed 16:10 shape.
- Tabs and menus are drawn on a canvas, so they have no keyboard access.
- Pages are rendered once at 1600 px wide.
- Long press hasn't been tried on a real Android device.
