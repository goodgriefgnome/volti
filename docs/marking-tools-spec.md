# Marking tools and the light reader: spec

What changes in the reader once this work is done: its look, the toolbar, the tools' settings, the
Symbols panel, selecting, and placing symbols and text. Everything not named here stays as it is.
How to get there is in `marking-tools-plan.md`; where the two disagree, this file wins. The mocks
are on the "Volti toolbar mocks" canvas: board L (the light reader) and board M (the loupe).

## The light reader

- The reader is always light, whatever the app's theme: its menus and dialogs too, while it is
  open. Leaving the reader puts the app's theme back.
- The stage around the pages is a very light grey. The pages are white, with a faint outline and
  shadow.
- The toolbar is off-white, with a hairline under it. A pressed button is lighter than the bar:
  white, with a thin grey ring and a slight shadow. Its icon keeps its colour.
- Everything drawn on the stage for a dark background is redrawn for a light one: the page-turn
  bands and their triangles, the back arrow shown while the toolbar is hidden, the cut editor's
  tabs and shading.

## The toolbar

One row, from left to right:

- **Back**, as now.
- **The title** with its chevron, as now, and **page info** under it as a smaller second line. The
  two lines start at the same left edge. The title shortens with an ellipsis before anything wraps.
- **Pen**, **Highlight**, **Erase**. Pen and Highlight each have a short bar under the icon in the
  colour they draw in.
- **Text** and **Symbols** (below).
- **Cuts**, **Undo**, **Redo**, **⋯**, as now.

There is no second row for any tool, and no colours in the row.

Below 680 px wide the tools move to a second row of their own, centred under the first, and
**Cuts** shows only its icon. Nothing else wraps.

## Colours

- Wherever colours are offered they are a row of swatches, with no names. The first swatch is
  **Default**, marked by a dashed ring around it. The chosen swatch is lit as a pressed button is.
- **Default** follows the app's Marking colours (library ⋯ → Marking colours): the marking colour
  for Pen, Text and Symbols, the background colour for Highlight and backgrounds.
- The other colours: for Pen, Text and Symbols, the three pen colours (`#1c1f26`, `#c2271d`,
  `#1f4fd1`); for Highlight and backgrounds, yellow, green and pink (`#fff09a`, `#c8f0c0`,
  `#ffd0e0`).
- A pen or highlighter stroke keeps the colour it was drawn in, Default included: changing the
  Marking colours later doesn't change it. Text and symbols on Default follow the Marking colours,
  as now.
- Highlights are drawn at full strength, multiplied, so the music under them stays black. Existing
  highlights (yellow, drawn at 35% now) become strong yellow.

## Long presses on the tools

A long press on a tool's button opens its settings below the button. A tap anywhere outside
closes them. A tap on the button still picks the tool, or puts it away when it is the tool.
Choosing a setting doesn't change the tool.

- **Pen**: its colours.
- **Highlight**: its colours.
- **Text**: **Font** (a dropdown of the text fonts), **Colour**, **Background** (the shapes: none,
  box, tag pointing left, tag pointing right) and, once a shape is chosen, **Background colour**.
- **Symbols**: the library on the left; **Colour**, **Background** and **Background colour** on the
  right, as for Text.

## What the Text and Symbols buttons show and change

- **Text** shows a **T** in its font and colour, on its background shape and colour.
- **Symbols** shows its symbol in its colour, on its background shape and colour.
- With a marking selected, the Text button shows the selected text marking's font, colour and
  background, and the Symbols button the selected symbol's. Otherwise each shows its settings for
  the next marking.
- A setting chosen in the Text panel changes the selected text marking, if any, and the settings
  for new text.
- In the Symbols panel:
  - **Colour** changes the selected symbol, if any, and the colour new symbols get, whichever
    symbol they are. Symbols don't each keep a colour.
  - **Background** and **Background colour** change the selected symbol, if any, and the library
    symbol it is (with none selected, the tool's symbol): the next time that symbol is placed, it
    gets them. A selected symbol that is not in the library changes on its own.
- **Undo** puts the marking back; it doesn't put back the settings or the library.

## Remembered settings

Each tool's settings are kept for the whole app and across restarts: Pen's colour, Highlight's
colour, Text's font, colour, background and background colour, and Symbols' colour. At first all
are Default; Text's font is the one new text gets now, and its background is none.

Which symbol is the tool is not remembered, as now: each time the reader opens it starts from the
first symbol of the first group.

## The Symbols panel's library

- One box per group, in the library's order, without names; then **Recent**, the ad-hoc symbols,
  under its heading. Under them, **+** (pick a symbol to place, as now) and **Edit library…**.
- Only the tool's symbol is lit.
- Tapping a symbol makes it the tool and closes the panel.
- A symbol can be dragged to any place in any group, or in Recent: it goes where it is dropped,
  which also reorders a group. While a symbol is dragged, a dashed box at the end, "Drag here for
  a new group", makes a new last group of it.
  - A group that a drag empties goes away.
  - Recent keeps at most 8: when a ninth arrives, its oldest goes.
  - When the tool's symbol is dragged, it stays the tool.
- A big library grows the panel to nearly the whole screen; past that, the library side scrolls
  and the settings side stays put.
- Groups can't be reordered here (still in **Edit library…**).

## Selecting

With Text or Symbols as the tool:

- Placing a marking doesn't select it.
- With a marking selected, a tap anywhere on the music only deselects it: it doesn't place, and a
  tap on another marking doesn't select that one.
- With nothing selected, a tap on a placed marking selects it.
- A tap on the selected marking: a symbol changes to the next in its group, as now, and with
  Symbols as the tool that symbol becomes the tool's symbol; text opens for editing, as now.
- Dragging a placed marking moves it, and dragging a corner of the selected one resizes it, as now.

## Placing

With Text or Symbols as the tool and nothing selected (or with something selected, which the press
deselects), a press on empty music shows what will be placed under the finger: the symbol, or for
Text the word **Ag**. It follows the finger, onto any page on the screen. Letting go places it
there; letting go anywhere but on a page places nothing. A tap places it where tapped, as now.

- The symbol shows as it will be placed: its colour and background.
- **Ag** shows in Text's font, size and background, in its colour mixed 25% towards the selection
  blue (`#1f6fe0`), so it reads as a marker. When it is let go, the typing field opens there,
  empty, with the start of the text where **Ag** started.
- The marking is centred on the finger, as a tap places it now.

## The loupe

While a symbol or text is being placed, moved or resized by dragging, a loupe shows the music
around it, magnified.

- A circle 128 CSS px across (about 2–2.5 cm on a tablet), white, with a thin edge and a shadow.
  No crosshair.
- Its bottom edge is 56 px above the finger. Where that would put it under the toolbar, it goes
  beside the finger, at the finger's height: to the left, or to the right when there is no room on
  the left.
- It shows the music and markings, the marking being dragged included, magnified by 48 ÷ the
  marking's ink height on the screen, but never less than 1×. The magnification is set when the
  drag starts and doesn't change during it.
- Its centre is the point h/2 in from the top, left and bottom of the marking's ink, h being the
  ink's height. A marking narrower than it is tall is centred across instead.
- It shows the music sharp, not a blown-up copy of the screen, once that has been drawn.
- It goes when the finger lifts.

## Gone

The toolbar's second row (the symbol groups, **+**, **Edit library…**, Font, Colour, Background),
the pen colours in the row, a tap on a group's button moving to its next symbol, and **To group**
on an ad-hoc symbol.

## Not changed

The library, the page-turn bands, turning, zooming, the cut editor's behaviour, the title menu, ⋯,
the selection's delete button, the typing field, the keyboard and pedal keys, and the library
editor. No stored data is dropped; the tools' settings are stored under a new key.
