# Page turning: spec

What a screen shows and where a turn goes once this work is done: an item's frames laid end to end
as a strip, each at the size it has filling the screen; a screen as a window onto the strip; a
fixed list of screens for each item; a setting for whether a turn advances a page or a screen; and
a slide between screens. How to get there is in `page-turning-plan.md`; where the two disagree,
this file wins.

## Why

Turning back doesn't undo turning forward. Back goes by as many frames as show now (`turnFrom`,
`reader/_turning.ts`), so where screens hold different numbers of frames, forward then back lands
somewhere else. A screen of two can only turn by two, where a player often wants the second page
moved to the left and the next one beside it. And the number of frames on a screen is fixed at one
or two (`framesOnScreen`, `render/layout.ts`), though a narrow score, or a wide tablet in landscape,
has room for three.

## Words

- The **stage** is the screen the music is shown on, as now. It is **landscape** when wider than
  tall, else **portrait**.
- The **strip** is an item's frames (a score's, an excerpt's, a setlist entry's) in order, end to
  end: left to right on a landscape stage, top to bottom on a portrait one. The strip's direction
  is **along**; the other is **across**.
- A **screen** is the stretch of the strip that fills the stage along, starting at the leading edge
  of one frame, its **first frame**. Its first frame is always whole.
- A frame is **whole** on a screen when all of it is on it. After the whole frames, a screen shows
  as much of the next frame as fits, cut off at the stage's edge: a **part**. Past the item's last
  frame, a screen is **empty**.
- **Advance** is the setting: **Page** or **Screen**.

## The strip

Each frame is shown at its **fitted size**. Its **full size** is the size it has when it alone
fills the stage: as large as fits the stage whole, as now for a frame alone on a screen. A frame
may shrink below that to fill a **share** of the stage along, 1/n of it (gaps included), but to no
less than the **smallest size** (below) of its full size. Its fitted size is that of the largest n
it can reach so, never larger than its full size; where it can't reach even a half, it is its full
size. Frames never grow to fill a share.

Frames of both shapes, and of different sizes, sit on the strip together, centred across, 6 px
apart along (`GAP`, `render/screen.ts`, as now). Each frame decides its own fitted size.

So at the smallest size of 90% (the default):

- On a 16:10 tablet held landscape, a portrait A4 frame at full size already fits in half the
  stage, so it stays at full size: two fit, and part of a third. A landscape frame fills the height,
  and part of the next frame fits beside it.
- On a 4:3 tablet held landscape, a portrait A4 frame at full size is about 6% wider than half the
  stage, so it shrinks by that much and two fit exactly. Held portrait, landscape frames do the same
  one above the other.
- A narrow score, or a wide stage, fits three or more where a third is within reach.

A lower smallest size packs more frames on a screen; 100% never shrinks a frame.

### The smallest size

An app setting, from 10% to 100% in steps of 5%, 90% without the key. It is set in a dialog,
**Page size…**, from the library's ⋯ menu beside **Marking colours…** and **Face gestures…**
(`library/_folder-banner.ts`): a slider with its value, "Pages may shrink to fit more on a screen,
down to 90% of their size." Changing it applies at once, also to a reader opened after. It is kept
per device, in a new kv key `smallest-page-size` (a whole number of percent), never synced.

### When the whole item fits

When every frame of the item fits on the stage at once, the strip is centred on the stage along as
well as across, and the item has one screen. Otherwise each screen's first frame is flush with the
stage's leading edge (left, or top), and what is left over shows the next frame's part.

## The list of screens

Each item has one list of screens, worked out from its frames, the stage's size, the smallest size
and Advance alone.
The reader is always on one of them. Nothing else decides where a screen starts: not the screens
shown before, nor how the reader got there. The first screen starts at the first frame. Then:

- **Advance Page:** the next screen starts at the next frame, so the first frame leaves the screen.
  The list stops at the first screen on which the item's last frame is whole.
- **Advance Screen:** the next screen starts at the first frame that isn't whole on this one, so
  every whole frame leaves the screen and a part becomes the next screen's first frame. The list
  stops at the screen on which the item's last frame is whole.

The last screen may be partly empty. In a setlist, the empty part holds the next entry's title, as
the blank after a score's last frame does now (`blankBox`, `reader/reader.ts`). Nowhere else is
anything empty.

With frames P1 P2 P3 P4 P5 L6 P7 L8 P9 P10 (P portrait, L landscape, A4) on a 16:10 tablet held
landscape, where two portrait frames and about a quarter of a third fit, and a landscape frame and
about a quarter of a portrait one:

- Advance Screen: (P1 P2 ·P3), (P3 P4 ·P5), (P5 ·L6), (L6 ·P7), (P7 ·L8), (L8 ·P9), (P9 P10).
- Advance Page: (P1 P2 ·P3), (P2 P3 ·P4), (P3 P4 ·P5), (P4 P5 ·L6), (P5 ·L6), (L6 ·P7), (P7 ·L8),
  (L8 ·P9), (P9 P10).

(·X is a part of X.)

## Turning

- **Forward** goes to the next screen in the list; **back** to the one before. So back always
  undoes forward, and forward undoes back.
- Past the list's ends, turning does what it does now: in a setlist, the next entry's first screen
  or the previous entry's last; in a score's own reader, the library's next or previous score,
  offered first (`offerScore`); otherwise nothing.
- Every way of turning (a tap, a band, a key or pedal, a face gesture) turns this way, through the
  turn gate as now.

## Landing somewhere other than by turning

Wherever the reader goes to a frame without turning, it shows the screen that starts at that frame,
or, when there is none, the last screen that starts before it. With Advance Screen that is the
screen on which the frame is whole; with Advance Page, the screen it starts, except near the item's
end. That covers:

- opening something, and resuming where it was last read (`last-read` keeps the cut of the first
  frame, as now);
- the title menu, and going to an entry or an excerpt;
- after an edit that moves the music (cuts split, merged, archived; the frames packed again);
- a rotation or any resize, which makes a new list: the reader lands on the first frame it was
  showing;
- changing Advance, or the smallest size, which makes a new list in the same way.

Going to an item's last screen (turning back into a setlist's previous entry) is the last screen in
its list. `lastScreen`'s own rule (`reader/reader.ts`) goes.

## The slide

A turn **slides** the strip along, from one screen to the next, over `--quick` (160 ms). Everything
on the strip between the two screens shows as it passes; nothing beyond the stage's edges does.

Landing somewhere other than by turning (above) doesn't slide: the new screen shows at once, as
now. With reduced motion turns don't slide either. A turn while a slide is moving finishes that
slide at once and starts its own from there. The turn is taken (the place remembered, drawing ahead
started, the gate passed) when it starts, not when the slide ends.

What the zoom and the toolbar do on a turn doesn't change: the new screen is placed as a turned-to
screen is now (whole below the toolbar when it shows).

## Advance on the toolbar

- A button on the reader's toolbar, beside **Cuts** and in its style: an icon and its value,
  **Page** or **Screen**. Its label (for screen readers and the tooltip) is "Advance a page" or
  "Advance a screen".
- It is always there and always enabled, whatever the screen shows. A tap switches between the
  two, and the reader lands on the first frame it was showing (above).
- It is the only place Advance is set. It applies to everything read on the device.
- It is kept per device, in a new kv key `advance` (`'page' | 'screen'`), never synced. Without the
  key, Screen.

## What else follows

- **Drawing ahead** draws the next and previous screens in the list, parts included.
- **Pages kept offline** (`offline/pages.ts`) are drawn at the widths the strip gives: each frame's
  page at the size it has filling the stage, in each orientation. These don't depend on Advance.
- `screenAt`, `framesOnScreen` and `Place.shown` give way to the list.
- `STORAGE.md` lists `advance` and `smallest-page-size`. `ARCHITECTURE.md`'s words take **strip**, **screen**, **whole**,
  **part** and **Advance**.
- `TODO.md`: "Turning back so forward restores the screen" and "Page-turn strategies" go. "Half
  turns on screens of one" takes the latter's place, for a frame that fills the screen alone:
  turning it by half a frame, a choice of its own, separate from Advance. "Square frames" goes too:
  a square frame is laid on the strip at its fitted size like any other. `TODO.manual.md` gets the
  checks.

Nothing stored is dropped.

## Decisions not discussed

- A part is cut at the stage's edge, whatever its size; it isn't rounded to half a frame.
- Landing on a frame shows the screen that starts there when there is one, so with Advance Page a
  jump puts the frame at the left, not on the right of an earlier screen.
- The last screen may be partly empty (the decision we did discuss); in a setlist the next entry's
  title fills it, as now, rather than part of the next entry's first frame.
- The slide takes `--quick`, as everything that answers a tap does (`css-harmony-spec.md`); the
  demo used about 300 ms.
- A jump doesn't slide.
- Without the key, Advance is Screen, what screens of two do now.
- A frame takes the largest share it can reach, so lowering the smallest size fits more frames on a
  screen, not only two; one shown alone (an item's last) keeps its fitted size, so nothing changes
  size as the reader turns.
- The smallest size is per device, like Advance, as it depends on the screen; it is set in its own
  dialog, **Page size…**, in steps of 5%.
