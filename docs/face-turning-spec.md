# Face gestures: turning without Release

What turning a page with face gestures must do once Release is gone. Turning is done by direction, not
by gesture. Each direction has a fill that rises while any of its gestures is on, and falls while none
is. This replaces the parts of `face-classifier-spec.md` and `face-gestures-spec.md` that speak of
Release (the levels, Turning, How close a gesture is, Gestures that conflict, the meter, the trials'
Strength view); those docs are brought up to this one as the last step of the plan.

## Levels

A fitted gesture has two levels, both in strength (0 to 1):

- **On**, as now: the fitted one, or one set by hand (dragged on the meter).
- **The zero point**: where the ring's faint arc starts. It is the most strength any of the gesture's
  rest frames reached (against its fitted template, over its enabled trials), but never more than
  halfway from its rest level to On: `min(rest max, rest + 0.5 × (On − rest))`, where `rest` is the
  rest level (the 95th percentile of the rest frames' strength, as now). It follows On when On is
  moved by hand. It can't be set.

There is no Release level. Nothing that turns pages, draws the ring or checks conflicts uses one.

## Turning

Gestures are grouped by direction: Next and Back. A gesture set to None plays no part.

On each frame with a face, a direction is **on** when at least one of its gestures has a strength at
or above its own On.

Each direction has a **fill**, from 0 to the hold (the one hold for every gesture, 500 ms to start
with), and is either **armed** or **spent**. It starts armed, at 0.

- **Armed**: the fill rises by the time since the last frame while the direction is on, and falls by
  twice that while it isn't, never below 0. When it reaches the hold, the page turns in that
  direction, and the direction is spent with its fill full.
- **Spent**: the fill falls by the time since the last frame while the direction isn't on, and rises
  by twice that while it is, never above the hold. When it reaches 0, the direction is armed again.

So:

- A clean hold turns the page after the hold, as now. A dip below On while holding costs three
  times its length; a direction that is on less than two thirds of the time never turns.
- After a turn, the direction turns no more while it's held. To be armed again it has to be let go
  for the hold, by the same rule the other way round: a flicker back above On while letting go
  costs three times its length.
- Gestures of one direction add up: a frame counts if any of them is on. Two Next gestures can't
  turn twice, since they share one fill.
- **One turn at a time.** When a direction turns the page, the other is spent too, with its fill
  full. If both would turn on the same frame, Next turns and Back is spent.
- The time since the last frame is counted at most 200 ms, so a stall doesn't jump the fill. The
  first frame counts 0.
- A frame without a face lets go: both directions are armed at 0, as every gesture is let go now.
- New gestures (a change in the dialog, settings loaded again), and the camera pausing, start both
  directions afresh, armed at 0, as now.

Turning still goes through the 100 ms gate of `face-gestures-spec.md`.

## The ring

Each half of the ring is one direction, as now: the right half Next, the left half Back.

- **Faint**: how close the direction's strongest gesture is to its On, from its zero point:
  the largest, over the direction's gestures, of `(strength − zero) / (On − zero)`, from 0 to 1. A
  gesture whose On is at or under its zero point counts 1 at On or above, else 0. It is full exactly
  when the direction is on.
- **Solid**: the direction's fill over the hold, from 0 to 1, drawn whatever the faint arc shows
  (not only when it is full). A spent direction looks no different.
- Both arcs on the same circle as now (6.5 px outside the button's edge, at most 170° each side, round
  ends): the faint arc **6 px** wide (the accent colour at 35%), the solid arc **2 px** wide (the
  accent colour), drawn over it, so where the faint arc is longer it shows either side of the solid,
  and where the solid is longer it runs on alone.

## Conflicts

Gesture `j` **fires on** gesture `i` when, for any of `i`'s enabled trials, the median of `j`'s
strength over that trial's held frames reaches `j`'s **On**. Two gestures **conflict** when they have
**different directions** (Next and Back) and either fires on the other. Gestures of the same
direction never conflict.

Otherwise as now: gestures set to None are not checked; the gestures with a direction are gone
through in the order they were added, the one just recorded or just given a direction last; one that
conflicts with one already gone through is set to None, and says why. The why names On where it named
Release: `“Mouth left” also fires on it: its strength is 0.70, and its On is 0.65. Both are mouthLeft`.

## The meter

The meter has On only: the dashed Release line and its tag go. Everything else is as now (On
dragged, Reset, the details' ticks for the rest level and each trial).

## The trials' Strength view

The trace's two dashed levels are On and the zero point (in place of Release). **At rest** is in the
warning colour when it is at or over halfway from the rest level to On (where Release was).

## Storage

`Fit` gains `restMax?: number`: the most strength any rest frame reached, stored with `template`, `on`,
`rest` and `peaks`. `FIT_VERSION` goes up by one, so every gesture is fitted again when the settings
are next loaded (and On moved by hand is dropped, as with any refit). Nothing else is stored or
dropped: Release never was stored.
