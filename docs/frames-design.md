# Pieces, cuts and frames: design

Status: **designed and prototyped, not built into the app.** This document is the hand-off for
whoever builds it. The user has agreed to the design as described here. Anything marked
**Open question** was not settled, so ask the user rather than guessing.

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
| **Split** | Two consecutive cuts of the same page that touch (`a.y1 === b.y0`). It lets the top of a page sit on an earlier frame. |
| **Music cut out** | The gap between two consecutive cuts of the same page when `b.y0 > a.y1`. It is shown on the frame as a brown dashed seam with a "✂ cut" pill. |
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
}

interface Piece {
  id: string;
  sourceId: string;  // one PDF (Score.id today) or one image set
  title: string;
  key: string;
  orientation: 'portrait' | 'landscape';
  cuts: Cut[];       // the played order
  // later: tags
}
```

- **A new file becomes one piece:** every page once, in order, `y0 = 0`, `y1 = 1`. Default
  orientation: landscape (two frames) for portrait-shaped pages, as in the prototype.
- **Invariants after every edit** (the prototype's `tidy()`):
  - Drop cuts thinner than 0.004 of a page.
  - **Join a split whose halves land on the same frame.** If two consecutive cuts of the same
    page touch and end up on one frame, merge them into one cut. A split only exists to carry
    music onto an earlier frame. Once both halves sit together it means nothing, and keeping it
    would leave stray seams and tabs. Repeat until nothing changes, since merging can't change
    the layout.
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
always in edit mode. **Open question:** in the app, edit mode probably needs to be switched on
from the toolbar, so that tabs don't show while performing and so that taps still turn pages.
Confirm this with the user.

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

### 5.3 "✂ split page here": filling a frame that's mostly empty

This is the user's "reflow": splitting a later page so its top fills the space on an earlier
frame.

- **When it shows:** on frame *n*, if frame *n − 1* is **more than 20% empty**
  (`ROOM_CUE = 0.2`). It is always on; there's no setting.
- **What it looks like:**
  - a very faint warm tint (`rgba(138,90,18,.06)`) from the top of frame *n* down to the height
    of the room left on frame *n − 1*
  - a brown dashed line at that height, at 70% opacity
  - a brown pill on the line: **"✂ split page here"**
- **It is not shown when:**
  - frame *n* already starts with the same page that frame *n − 1* ended on, further down
    (there's already a split or a cut there)
  - the line would fall within 3% of the frame height of the end of frame *n*'s first cut
    (splitting there would do nothing useful)
  - a drag is in progress
- **Tapping the line (±16 px)** splits frame *n*'s first cut:
  1. The split point is snapped **up** to the nearest blank band between systems (`snapSplit()`):
     - Take a row ink profile of the source page: for each pixel row, the fraction of sampled
       pixels that are dark, sampling every 3rd pixel, where dark means R+G+B < 450.
     - A row is blank if under 0.2% of its samples are dark.
     - From the line, move up out of any music, find the blank band there, and split at its
       middle. The band must be at least 6 rows tall.
     - If no band is found, split at the line.
  2. If either half would be thinner than 1% of the page, show "There is no gap between systems
     to split at." and do nothing.
  3. Otherwise, reflow and **show the frame before**, which now holds the top half.
- The first cut on frame *n* is always taller than the room left, since greedy packing would
  otherwise have placed it on the frame before. So the line always falls inside that first cut.
- This is a plain tap, not a menu.

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
| The **music** of a cut | "Cut from page N" | **Insert pages before this cut…** **Insert pages after this cut…** **Remove this cut.** |
| **Blank space** on a frame, above its first cut (a pad) or below its last | "Above the music" or "Below the music" | **Insert pages here…**: before the frame's first cut, or after its last. |

- "Remove this cut" isn't offered when the piece has only one cut.
- "Remove this cut" is how you delete a whole repeat or a page. Note that a full page's own
  white margin counts as part of that cut, not as blank space.

### 5.5 Inserting pages

- "Insert…" opens a **picker over the frames**, as a dialog inside the stage:
  - A title such as "Insert pages after this cut (page 3)" or "Insert pages here".
  - A horizontal strip of **thumbnails of the piece's source pages**, 84 px wide, numbered.
  - **Tap one page, then another, to choose a range.** Tapping the same page twice gives just
    that page, and the next tap starts a new range. A backwards range is inserted in that
    backwards order.
  - The selection starts on the cut's own page and is scrolled into view.
  - A hint line ("Pages 1–2.") and **Cancel** and **Insert** buttons.
- Inserted pages are whole (`y0 = 0`, `y1 = 1`). After inserting, reflow and show the frame
  holding the first inserted page.
- **Open question (deferred by the user):** "the PDF page range that represents the piece". A
  PDF may hold several pieces. For now the picker shows every page of the source; later it
  should probably show the piece's page range, with a way to reach the rest.

---

## 6. Ink (annotations): decided in principle, not prototyped

- **Ink belongs to one cut of the played order, not to the source page.** A marking made on the
  second time through a repeat must not appear on the first. This was decided early, as the
  "frame layer" decision.
- Hiding a first ending on the second time through is done with ink (a **whiteout** tool), not
  with a cut. Cuts are horizontal bands only.
- **Proposal:**
  - Store strokes per cut id, in **source-page coordinates** (x as a fraction of page width, y
    as a fraction of page height), as `src/ink/model.ts` already does per page. Then trimming a
    cut never moves ink relative to the music, and ink in a trimmed-away band just isn't drawn,
    clipped to `y0..y1`.
  - On a **split**, give each stroke to the half that holds most of it, for example by the
    centre of its bounding box.
  - On a **join** or **"restore the music cut out"**, take the union of both cuts' strokes.
  - On **remove**, ask the user or keep the strokes recoverable. **Open question.**
- **Migration:** today ink is `ink:<scoreId>` → `{ [pageNumber]: Stroke[] }`. A score with no
  piece yet is equivalent to one cut per page, so that ink can move to those cuts one-to-one.

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

## 8. Building it into Volti: suggested plan

The current app, in TypeScript with Vite and pdf.js 6:

- `src/viewer/viewer.ts`: the reader, about 600 lines. It handles page turns, the toolbar,
  zoom, ink tools and palm rejection.
- `src/viewer/layout.ts` (`fitPages`, `spread`, `turnTarget`), `turns.ts` (tap, swipe and key
  → gesture), `zoom.ts`, `renderer.ts`. `renderer.ts` has `PageCache`, which renders a whole
  page at the stage size, supersampled; `renderRegion()` renders part of a page.
- `src/ink/*`: strokes per page; `src/lib/library.ts`: scores; `src/lib/idb.ts`: a key-value
  store; `src/lib/prefs.ts`: preferences and last page.

Suggested order:

1. **A pure model module, with unit tests first:** `src/pieces/model.ts` with `pack`, `tidy`,
   split, join, restore, trim clamps, insert and remove. All of it is pure and easy to test
   with vitest, like `tests/layout.test.ts`. Port the logic from the prototype (section 9).
2. **Storage:** a `piece:<id>` record in `kv`. A score without one gets one cut per page.
3. **The reader draws frames instead of pages.** Each frame is a stack of cuts. Rendering a cut
   means drawing a band of the cached page canvas: render the page at frame width with
   `PageCache.render`, then `drawImage` the band. Turning moves by screen (one or two frames).
   Zoom and pan apply to the whole screen as they do now. Ink is drawn per cut, clipped and
   offset.
4. **Edit mode:** tabs, the white-space tab, the split cue, context menus and the insert picker,
   as in section 5. Use canvas hit regions or absolutely-positioned DOM elements. DOM gives
   accessibility and focus for free, which is probably better in the app than the prototype's
   canvas drawing.
5. **Snapping** needs page pixels. Use the rendered page canvas, or render the page once at a
   modest width just for the ink profile.
6. Images as a source: a later step, together with the library work.

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
