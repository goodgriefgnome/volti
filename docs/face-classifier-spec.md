# Face gestures you define: spec

Instead of eight predefined gestures, the person defines their own: they name a gesture, record
themselves doing it while playing, and map it to Next, Back or None. Each gesture is fitted from its
own recordings as a **template**: a few blendshape channels, each with the value it must reach, and
limits on the other side of the face. A frame's **strength** `y`, from 0 to 1, is how far those
channels have come from rest to the gesture. `y` feeds the turning (On, Release, Hold, the 100 ms
gate).

There is no network and no training: fitting is medians and percentiles, done at once whenever a
recording changes. What is left of playing (the background) is no class of its own: a frame is
judged only by how close it is to the gesture. The rest frames of a gesture's own recordings choose
its channels and set its scale, and nothing more.

This spec covers the templates, recording, the levels and the checks, and the prototype test page.
The app's side of it (the button, the dialog, what is stored) is in `face-gestures-spec.md`.

## Terms

- **Frame**: what MediaPipe's Face Landmarker gives for one camera image with a face in it: its time
  `t` (ms, the camera's capture time where the browser gives it), the 52 blendshape scores, and the
  face's transform. Frames without a face are dropped. Frames are used as they come: no resampling,
  no smoothing over time.
- **Channel**: one of the 52 blendshape scores, 0 to 1. The head's angles are not channels for now
  (below).
- **Pair**: a channel and its counterpart on the other side of the face (`eyeBlinkLeft` and
  `eyeBlinkRight`; `mouthLeft` and `mouthRight`; `jawLeft` and `jawRight`). Twelve channels have
  none (`jawOpen`, `browInnerUp`, `mouthPucker` and the like).
- **Trial**: one recording of one repetition (**rep**) of one gesture, with its tones (below).
- **Held frames**, **rest frames**: a trial's frames while the gesture is held, and while it isn't
  (below). Over a gesture, they are those of all its trials together.
- **Median, percentile**: over frames, per channel. Percentiles interpolate linearly.
- **Strength**: how strongly a gesture is being made at a moment, 0 to 1 (a frame's `y` below). The
  blendshape scores are MediaPipe's; *score* is not a word for this.
- **Limit**: the other side of a pair, which must not pass its limit (below).
- **Separation**: how cleanly a channel's held values are apart from its values at rest, as a share
  of its span (below).
- A gesture's trials can each be **disabled**: a disabled trial is kept but left out of the fit. A
  gesture's **enabled** trials are those that are not.

## Recording

Every frame that is detected (30 a second on the prototype page, 15 in the app), with its time.
Tones are in the same clock. There is no background recording: a trial's own lead-in and tail are its rest.

A gesture's trials are recorded one after another, while the person keeps playing, until a tap
(five in a round on the prototype page). Each:

- a quiet lead-in of 2 to 4 s (random);
- three **rising tones**, a second apart (523, 659 and 784 Hz, 120 ms each, the third 250 ms):
  present the gesture on the third, and hold it;
- a hold of 3 to 5 s (random), from the third rising tone to the third falling one, with the first
  two falling tones within it;
- three **falling tones**, a second apart (784, 659 and 523 Hz, the same lengths): let go on the
  third;
- 2 s more.

More can be recorded (10 to 15 trials are recommended, over more than one sitting); a trial can be
disabled, which leaves it out of the fit, and disabled trials can be deleted. A gesture is fitted
once it has three enabled trials.

### The labels

Each frame of a trial, where `t_up` is the time of the third rising tone and `t_down` that of the
third falling one:

- **Held**: from `t_up + 500 ms` to `t_down − 500 ms`.
- **Left out**: within 500 ms of `t_up` or of `t_down`. The tones count down, so the change is
  expected, and it is taken to happen within that second.
- **Rest** otherwise.

## The template

Fitted from a gesture's held and rest frames, those of its enabled trials. It has **moving
channels** and **limits**.

### Moving channels

For each channel:

- its **rest value**: the median of the rest frames;
- its **side**: up if the held frames' median is over the rest value, down if under;
- its **edge**, also its **threshold**: the held frames' 10th percentile if it moves up, their 90th
  if down: the end of the held values nearest rest;
- the **rest's reach**: the rest frames' 90th percentile if it moves up, their 10th if down: the
  end of the rest values nearest the gesture;
- its **span**: from the rest value to the edge;
- its **separation**: the gap from the rest's reach to the edge, as a share of the span. Over 0,
  the held values and the rest values don't overlap (but for a tenth of each).

A channel **moves** when its separation is over 0 and its span is 0.1 or more. The ten most
separated are picked.

- Percentiles and not spreads: a channel that is dead still at rest and moves unevenly when held
  (a brow that comes down by 0.15 to 0.4) is as good a sign as a steady one, and a spread would
  mark it down.
- A moving channel is bounded on one side only: past the edge is as good as on it, so doing the
  gesture harder than it was recorded still counts.

### Limits

A wink's eye channels are also where a blink goes, with both eyes. So the other side of a lopsided
pair is held down. For each moving channel with a counterpart:

- the counterpart's **limit**: the held frames' percentile on the far side (their 90th where the
  moving channel moves up, their 10th where down): where the gesture itself holds the other side;
- it has a limit only if the limit is 0.1 or more short of the moving channel's edge. A gesture that
  moves both sides alike (a long blink) has no limits;
- a counterpart that itself moves the same way (the open eye half closing in a wink) has a limit,
  and is no longer a moving channel: as one, a blink would satisfy it better than the wink does;
- a counterpart that moves the other way (one brow up, the other down) stays a moving channel, and
  neither has a limit.

A channel with a limit is wholly **out** when it reaches the moving channel's edge (its **full**),
as it does when both sides do the gesture.

### Channel changes

A gesture's channels can be forced off or on by hand, each by its channel name, and the changes are kept
across recordings and changes to trials:

- **forced off**: a channel the fit would use is left out; it is neither a moving channel nor a
  limit. A limit's channel forced off is that limit turned off. A moving channel forced off takes
  its limit with it, but the limit's own forced-off stays as it was set;
- **forced on**: a channel the fit didn't pick is put in, whether or not its separation is over 0
  and whatever its span, beside the ten picked (it doesn't count toward them). Only a channel that
  moves can be forced on: its held median differs from its rest median. Its side, edge, rest's
  reach, rest value, span and separation are worked out as for any channel;
- a channel forced on is given at least 0.02 of span, so it can be scored: its edge is kept that far
  from its rest value, on the side it moves.

The thresholds themselves (a channel's edge, a limit's limit) are the fit's: they can't be moved by
hand.

## The strength

For a frame:

- A moving channel's **shortfall**, 0 to 1: 1 at its rest value (or beyond), 0 at its edge or past
  it, linear between: `(edge − value) / span` the way it moves, clamped.
- The gesture's **shortfall**: the mean of its moving channels' shortfalls. With four moving
  channels or more, the frame's largest shortfall is left out of the mean: one channel may be
  missing (people don't do a gesture the same way every time; a wink with and without the brow).
- A limit's **overshoot**, 0 to 1: 0 at its limit or within it, 1 at its full or past it, linear
  between.
- The gesture's **overshoot**: the root mean square of its limits' overshoots (0 with no limits).
- `y = (1 − shortfall) × (1 − overshoot)`.

The limits multiply and aren't averaged in with the moving channels: a rest frame is within every
limit, so averaged in they would raise every rest frame's strength.

## The levels

A gesture's On and Release levels come from its own enabled trials:

- its **rest level**: the 95th percentile of `y` over its rest frames;
- each trial's **peak**: the median of `y` over its held frames, against a template fitted without
  that trial;
- **On** = rest level + 0.65 × (lowest peak − rest level), from 0.05 to 0.95, the fitted one;
- **Release** = rest level + 0.5 × (On − rest level), always: it can't be set, and it follows On
  when On is moved by hand.

On can be moved by hand; it goes back to the fitted one on Reset, or when new trials are recorded; a channel change or a
trial disabled or enabled leaves it. Hold is one for every
gesture, 500 ms to start with (`face-gestures-spec.md`).

## Turning

`y` feeds the turning of `face-gestures-spec.md`: a gesture comes on when `y` reaches its On level,
stays on until `y` falls under its Release level, and turns the page in its direction after being
on for the hold, once until let go, through the 100 ms gate. A stretch of over 200 ms without a
face lets every gesture go.

## Checking

Whenever a gesture is fitted.

### A gesture's own flags

- **Record at least three trials**: it has fewer enabled, and isn't fitted.
- **Can't be told from playing**: no channel moves. Add channel… lists the channels not in the
  template, with their spans and separations.
- **Unreliable**: its lowest peak is less than 0.15 over its rest level.
- **Fires while resting**: some of its rest frames, each on its own, have a strength of On or more:
  how many, and the longest run of them, and which trials they are in. A long blink always has some:
  a blink at rest is a short one.

A flagged gesture can still be tried.

### Gestures that conflict

Gestures that turn pages can't conflict. Gesture `j` **fires on** gesture `i` when, for any of `i`'s
enabled trials, the median of `j`'s strength over that trial's held frames reaches `j`'s Release
level: `j` would stay on through it. Two gestures conflict when either fires on the other.

- Gestures set to None are not checked.
- The gestures with a direction are gone through in the order they were added, but with the one
  just recorded, or just given a direction, last. One that conflicts with a gesture already gone
  through is set to None, and says why: which fires on which, the strength and the Release level,
  and the moving channels the two share (or, if they share none, the ones the firing gesture
  needs).
- So a gesture that contains another can't turn pages beside it: "mouth to the left" and "mouth to
  the left with the brows up" conflict, since the first asks for nothing the second lacks.

## How the constants were chosen

On recordings of three gestures (a mouth pushed to one side, and a wink of each eye), five trials
each, by leaving one trial out at a time: the template and the levels fitted on the gesture's other
four, then run through the turning (On, Release, a 250 ms hold) over the trial left out and every
trial of the other two gestures, and over a made-up blink (the left-out wink with the winking
side's eye and brow channels copied onto the other side).

| | Root mean square, On at 0.8 | As specified |
| --- | --- | --- |
| Holds that turn the page | 14 of 15 | 15 of 15 |
| Turns twice in one hold | 1 | 0 |
| Turns at rest, or on another gesture | 0 | 0 |
| Share of the rest time on | 0.00% | 0.12% |
| Blinks that turn a wink | 0 of 10 | 0 of 10 |
| From the tone to the turn: median, longest | 373, 766 ms | 321, 829 ms |

What else it showed, over 3000 settings at random:

- Without limits, 9 blinks of 10 turned a wink.
- Taking the single largest overshoot, in place of the limits' root mean square, turned pages at
  rest.
- Taking the rest's reach as its 99th percentile, in place of its 90th, turned pages on the other
  gestures (15 times).
- A least span of 0.05 left less room between the holds and the rest; one of 0.15, on its own,
  turned a page at rest.
- Smoothing `y` over three frames, the Release fraction, and taking each trial's median in place of
  the percentiles over all held frames, made no difference that could be seen.

This is little to go on: fifteen trials in one sitting, some 90 s of rest, and a blink that is made
up. A difference of one hold or one turn is within its noise.

## The prototype

`public/lab/face-classifier.html`, a page of its own like `lab/face-signals.html`: MediaPipe's code from
jsDelivr, its WASM and the face model the app's own (`mediapipe/`), nothing sent anywhere. The
service worker leaves it alone. It has no tests.

- **Camera**: start and stop; the front camera at 640×480, asking for 30 frames a second. Detection
  runs on every camera frame.
- **Gestures**: add one (a name and a direction); record a round of five trials; clear its trials;
  change its direction; remove it. Two boxes set the On and Release fractions (0.65 and 0.5). Each
  gesture's card shows its flags, why it was set to None, its On and Release, its rest level and
  each rep's peak, a table of its moving channels (what each must reach, its rest value, the rest's
  reach, how clear it is) and its caps, and the four clearest channels that were left out.
- **Try**: live, per gesture: a meter of `y` with its On and Release marked; each moving channel's
  value and shortfall, and each cap's value and overshoot (in red over a quarter); its On, Release
  and Hold (editable); whether it is on. And the head's yaw, pitch and roll, whether a face is seen,
  a page number that turns, and which gesture turned it.
- **Data**: the trials and gestures are kept in the page's own IndexedDB database
  (`face-classifier-prototype`), not the app's, as float32 (each frame: its time, the 52 scores,
  the face's rotation and position); they can be downloaded as JSON and loaded back. Templates
  aren't kept: they are fitted again on loading. Recordings from before the tones counted down are
  dropped, as are the background recordings and levels of the network this replaced.

The page keeps the words it was written in (score, cap, clear); the app's are strength, limit and
separation, and the app has one hold for every gesture and no boxes for the fractions.

## Decisions and limits

- **Held poses only.** A frame is judged on its own, so a gesture that is a movement (a nod, two
  blinks) can't be defined.
- **The head's angles are left out** of the templates for now, so a head turn or a nod can't be
  defined either. They are recorded with every frame, and shown.
- **No correction for the camera's angle.** The blendshape scores shift as the head turns; a template covers
  that only as far as its trials did.
- **A limit guards against the mirror image only** (a blink, for a wink). A look-alike in the same
  channels (a yawn, for an open jaw) is left to the Hold.
- **A limit is a new way to miss**: if the other side moves more in use than it did in the trials,
  the gesture is refused. A limit of 0 (the other side never moved) is the strictest.
- **Left and right are MediaPipe's**, and its mouth channels are the other way round from its eye
  channels: a mouth pushed to the person's left is `mouthRight`. Nothing depends on which is which,
  only on the pairs.
- **On is set strictly** (0.65 of the way, not the 0.4 of the eight gestures this replaced): a
  strength is spread over several channels, and with half of them at rest it is already near a half.
- **Rest is what the trials caught**: a few seconds either side of each hold. What the person does
  at other times (talking, looking round) was never seen, and is only kept out by the template
  asking for several channels at once.
