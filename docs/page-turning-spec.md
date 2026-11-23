# Page turning: spec

What a screen shows and where a turn goes once this work is done: a fixed sequence of screens
for each score, a setting for how a screen of two turns, half of a landscape frame where a blank
used to be, and a slide between screens. How to get there is in `page-turning-plan.md`; where the
two disagree, this file wins.

## Why

Turning back doesn't undo turning forward. Back goes by as many frames as show now (`turnFrom`,
`reader/_turning.ts`), so where screens hold different numbers of frames, forward then back lands
somewhere else. And a screen of two can only turn by two, where a player often wants the second
page moved to the left and the next one beside it.

## Words

- A frame is **portrait** or **landscape** (`isLandscape`, `scores/frames.ts`; a square one counts
  as portrait, as now). The **screen's shape** is the stage's: landscape when wider than tall.
- A frame **shaped like the screen** has the screen to itself. A frame **opposite** to the screen
  shares it: two side by side on a landscape screen, one above the other on a portrait one. These
  are **screens of two**; the rest are **screens of one**.
- A **run** is a longest stretch of consecutive frames opposite to the screen.
- A **half** is the first half of a frame shaped like the screen, cut across its long side: the
  left half of a landscape frame on a landscape screen, the top half of a portrait frame on a
  portrait one. A half is opposite to the screen, so it fills a slot of a screen of two. For A4 and
  US Letter, half a frame is the shape of a whole one turned.
- **Turn by** is the setting: **2** or **1**. It decides how screens of two follow one another. It
  changes nothing for screens of one.

## The screen sequence

Each item read (a score, an excerpt, a setlist's entry) has one list of screens, worked out from
its frames, the screen's shape and Turn by alone. The reader is always on one of them. Nothing else
decides where a screen starts: not the screens shown before, nor how the reader got there.

The list, from the first frame on: each frame shaped like the screen is a screen of one. Each run
of frames r₁ … rₙ gives, in order:

- **Turn by 2:** pairs from the run's start, (r₁ r₂), (r₃ r₄), …. When n is odd, rₙ is left over:
  (rₙ, half of the next frame), or (rₙ, blank) when the run ends the item.
- **Turn by 1:** each frame with the next, (r₁ r₂), (r₂ r₃), … (rₙ₋₁ rₙ). Then, when a frame follows
  the run, (rₙ, half of the next frame); when the run ends the item, nothing more, except that a run
  of one is (r₁, blank).

With frames P1 P2 P3 P4 P5 L6 P7 L8 P9 P10 on a landscape screen (P portrait, L landscape):

- Turn by 2: (P1 P2), (P3 P4), (P5 ½L6), L6, (P7 ½L8), L8, (P9 P10).
- Turn by 1: (P1 P2), (P2 P3), (P3 P4), (P4 P5), (P5 ½L6), L6, (P7 ½L8), L8, (P9 P10).

A frame is never beside a frame of the other shape. The only blank is beside the item's last
frame; in a setlist it holds the next entry's title, as the blank after a score's last frame does
now (`blankBox`, `reader/reader.ts`).

## Turning

- **Forward** goes to the next screen in the list; **back** to the one before. So back always
  undoes forward, and forward undoes back.
- Past the list's ends, turning does what it does now: in a setlist, the next entry's first screen
  or the previous entry's last; in a score's own reader, the library's next or previous score,
  offered first (`offerScore`); otherwise nothing.
- Every way of turning (a tap, a band, a key or pedal, a face gesture) turns this way, through the
  turn gate as now.

## Landing somewhere other than by turning

Wherever the reader goes to a frame without turning, it shows the first screen in the list that
holds that frame (whole, not as a half). That covers:

- opening something, and resuming where it was last read (`last-read` keeps the cut, as now);
- the title menu, and going to an entry or an excerpt;
- after an edit that moves the music (cuts split, merged, archived; the frames packed again);
- a rotation or any resize that changes the screen's shape, which makes a new list: the reader
  shows the screen there that holds the first frame it was showing;
- changing Turn by, which makes a new list in the same way.

So with Turn by 1 on (P3 P4), switching to 2 shows (P3 P4); on (P2 P3), it shows (P1 P2).

Going to an item's last screen (turning back into a setlist's previous entry) is the last screen in
its list. `lastScreen`'s own rule (`reader/reader.ts`) goes.

## The strip and the slide

An item's frames are laid end to end along the screen's long side, in order, a gap apart, as one
**strip**, each frame scaled to the same size across that side: the same height on a landscape
screen, the same width on a portrait one. That size is the largest at which every screen in the
list fits the stage. A screen is a stretch of the strip, centred on the stage: a frame alone, a
pair with the gap between them, or a frame and the half beside it, which is simply the next frame
cut off at its middle.

For A4 and US Letter on a tablet, frames show at the size they show now: a pair and a landscape
frame each fill the stage's height on a landscape screen.

A turn **slides** the strip to the next screen: along the long side, over `--quick` (160 ms), with
the pages of both screens and of what lies between them showing as it moves. Only what is inside
the moving window shows; nothing beyond the window's edges does. The window's size moves from the
old screen's to the new one's as it slides. So:

- with Turn by 2, a pair slides out by two frames and the next pair slides in;
- with Turn by 1, the pair moves along by one frame;
- from (P5 ½L6) to L6, P5 slides out and the rest of L6 slides in, at the same size.

Jumps (above) don't slide: the new screen shows at once, as now. With reduced motion turns don't
slide either. A turn while a slide is moving finishes that slide at once and starts its own from
there. The turn is taken (the place remembered, drawing ahead started, the gate passed) when it
starts, not when the slide ends.

What the zoom and the toolbar do on a turn doesn't change: the new screen is placed as a turned-to
screen is now (whole below the toolbar when it shows).

## Turn by on the toolbar

- A button on the reader's toolbar, beside **Cuts** and in its style: an icon and its value, **2**
  or **1**. Its label (for screen readers and the tooltip) is "Turn by 2 frames" or "Turn by 1
  frame".
- It is always there and always enabled, whatever the screen shows. A tap switches between 2 and 1,
  and the reader shows the screen that holds the first frame it was showing (above).
- It is the only place Turn by is set. It applies to everything read on the device.
- It is kept per device, in a new kv key `turn-by` (`1 | 2`), never synced. Without the key, 2:
  what screens of two do now.

## What else follows

- **Drawing ahead** draws the next and previous screens in the list, a half's frame at its full
  size.
- **Pages kept offline** (`offline/pages.ts`) are drawn at the widths the strip gives. These don't
  depend on Turn by, as every frame is the same size along the strip whichever it is.
- `screenAt`, `framesOnScreen`'s use for counting frames, and `Place.shown` give way to the list.
- `STORAGE.md` lists `turn-by`. `ARCHITECTURE.md`'s words take **screen of two**, **run**, **half**
  and **Turn by**.
- `TODO.md`: "Turning back so forward restores the screen" goes. "Page-turn strategies" becomes
  "Half turns on screens of one": turning a screen of one by half a frame, a choice of its own,
  separate from Turn by. `TODO.manual.md` gets the checks.

Nothing stored is dropped.

## Decisions not discussed

- The half is taken across the long side of a frame shaped like the screen (left half on a
  landscape screen, top half on a portrait one), and the strip runs vertically on a portrait screen:
  the landscape case turned.
- One size along the strip for the whole item, so a slide never changes the frames' size. Where
  frames aren't A4 or Letter, some screens may then not fill the stage.
- The slide takes `--quick`, as everything that answers a tap does (`css-harmony-spec.md`); the
  demo used about 300 ms.
- A jump doesn't slide.
- The button's label says "frames", the reader's word for what fills a slot; its face shows only
  the number.
- In a setlist, the blank beside an entry's last frame holds the next entry's title, as now, rather
  than half of the next entry's first frame.
