# The reader's toolbar: spec

What the reader's toolbar is and does once the redesign is done. How to get there is in
`toolbar-plan.md`; where the two disagree, this file wins. The mocks are on the "Volti toolbar
mocks" canvas, boards 1–7 under "The agreed toolbar".

## The toolbar

One row, which grows a second row for Text and Symbols. From left to right:

- **Back** (the arrow): leaves the reader for the library, as now. While the toolbar is hidden the
  arrow stays at the top left on its own, as now.
- **The title**, a button with a chevron after it, which opens the title menu (below).
- **Page info**: "Pages 3–4 of 9", "Opening…", "Needs access" and so on, as now.
- **The tools**, as icons with a label for screen readers and a tooltip:
  - **Pen**, **Highlight**, **Erase**. While Pen is the tool, the three pen colours follow Erase.
    Highlight and Erase show no colours.
  - **Text**, **Symbols** (below).
  - Tapping the tool in use puts it away, as now.
- **Cuts**, a toggle with its label, which shows or hides the cuts (below).
- **Undo**, **Redo**, as icons.
- **⋯**, the menu of what is read (below).

Gone: **Scores**, **Excerpts**, **Excerpt**, **Edit cuts**, **Archived**, **Fit page**, the button
that hides the toolbar, and the **Symbols** show/hide button as it is now.

With no tool in use, a tap on the music hides the toolbar, as now. With a tool in use it doesn't:
the tool takes the tap.

## The second row

- **Symbols**: a button for each group showing its current symbol (a long press lists the group's
  symbols, as now), the ad-hoc group's once it has symbols, **+**, and **Edit library…**. Then
  **Colour** and **Background** for the selected marking.
- **Text**: **Font** (the text fonts), then **Colour** and **Background**.
- **Colour** is a **Default** button and the three pen colours. Colour and Background change the
  selected marking only, as now, and are disabled while nothing is selected. Font and Background
  also set new text, as now.
- No second row for Pen, Highlight, Erase or no tool.

## The Symbols tool

- The Symbols button's icon is the last symbol picked: the current symbol of the last group used
  (the ad-hoc group included).
- Tapping it makes that symbol the tool, with its group pressed in the second row. Tapping it while
  Symbols is the tool puts the tool away.
- Tapping a group's button, choosing from its long-press list, and **+** work as now.
- Before any symbol is picked, it is the first symbol of the first group with symbols.
- It is not remembered: each time the reader opens it starts again from the first.
- When the last symbol is deleted, or its group emptied, it falls back to the first symbol of the
  same group; when the group is gone or empty, to the first symbol of the first group with symbols.
- With no symbols in the library, or before the library has loaded, the icon is a generic *pp*.

## Cuts

- **Cuts** shows the cut editor's tabs, the room shading and the line for space above, and hides
  them again. While they show, a tab can be dragged, a press and hold on a tab gives its menu, and a
  tap on a tab does nothing, as now.
- A tool can be in use while the cuts show. A press on a tab goes to the tab. A press and hold on
  the music gives the cut menu only with no tool in use, as now.
- Showing the cuts doesn't move the pages.
- Archived cuts are reached only from the press-and-hold **Insert** menu, which already lists them
  and has **Delete archived cuts…**.

## The pages while the toolbar shows

The "spread" here is the whole area the pages are laid out in (the stage), not only the pages.
The "view" is the part of the screen below the toolbar.

- Showing the toolbar doesn't move or resize the pages; the toolbar covers the top of them.
- **Smallest zoom**: the size at which the spread fits in the view. When the toolbar grows (the
  second row appears), it goes down. When the toolbar shrinks, it stays. Hiding the toolbar resets
  it to full size.
- **Largest zoom**: 5×, as now.
- **Drag** (one finger, no tool in use, zoomed or not) and **pinch** (two fingers) move the spread
  only in ways that keep or increase how much of it is in the view. In each direction:
  - When the spread fits in the view, it can go anywhere inside the view.
  - When it is bigger than the view, it can go as far as its edges meet the view's edges.
  - When it is already somewhere those rules don't allow (the toolbar grew over it), it can only
    move to show more.
  - Movement past what is allowed is lost: the spread sticks at the edge.
- A pinch changes the size between the smallest and the largest zoom. An edge that is at the view's
  edge stays there while the size changes.
- Nothing else moves the spread while the toolbar shows: not a tool, not showing the cuts, not the
  toolbar changing height, not an edit that leaves the same screen showing.
- **Turning the page**, forward or back (into another score of a setlist, or another score of the
  library, too): the new screen shows at the largest size at which the spread fits in the view as
  it is now, centred in the view both ways.
- **Hiding the toolbar**: back to full size, with nothing moved.
- With the toolbar hidden, turning works as now, at full size.
- Going to another screen any other way (the title menu, an edit that shows another screen, a
  replayed excerpt, rotating the tablet) places it as a turn does.

## The title menu

A menu below the title, with the title of the list at the top and a **+** beside it. The row being
read is highlighted. Tapping a row's name goes to it and closes the menu. The menu stays open after
the other buttons: after a drag it shows the new order at once; after a button that opens a dialog,
it opens again when the dialog closes, however it closes.

### In a setlist

- Heading: the setlist's title. **+** opens **Add scores…**, adding at the end, as now.
- A row for each entry: a grip, its number and title (with its excerpt's name, as in the Scores
  menu now), a swap icon and a bin.
  - Drag the grip up or down to move the entry, as in the library.
  - Swap opens the excerpt picker for that entry (**Change excerpt…**), as in the library: any
    entry, not only the one being read.
  - The bin asks first ("Remove “…” from “…”?"). Removing the entry being read goes on to the next,
    or to the library when none is left, as now.
- No other icons. Reordering without dragging stays in the library's ⋯ menus.

### In a score or a named excerpt

- Heading: the score's title. **+** opens **Add excerpt…**.
- **Whole score** first, with no icons. Tapping it reads the score itself.
- A row for each named excerpt, in the order the library shows them: its name, a swap icon and a
  bin.
  - Tapping the name reads that named excerpt.
  - Swap opens the excerpt picker with a name field: the name and the cuts change together. Every
    setlist that plays it follows, as when its cuts change now.
  - The bin asks first, as **Delete…** does now. Deleting the excerpt being read goes on to the
    next of the score's, or the one before, or to the library when none is left, as now.

## The ⋯ menu

- **Score**: Add to “…”, Add to setlist…, Rename…, Export PDF…, Move to folder…, Remove.
- **Named excerpt**: Add to “…”, Add to setlist…, Export PDF….
- **Setlist**: Rename…, Duplicate, Export PDF…, Archive (or Unarchive), Delete… (only when
  archived).

Gone from ⋯: the setlist's **Add scores…**, and the entry's **Move up**, **Move down** and
**Remove from setlist**; the named excerpt's **Rename…** and **Delete…**. They are in the title menu.

## Not changed

The library, the page-turn bands, the toast, the selection's delete button on the page, the
keyboard and pedal keys, and everything stored. No stored data is dropped.
