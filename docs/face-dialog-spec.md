# The Face gestures dialog, redesigned: spec

What the Face gestures dialog must become, and what changes under it: one hold for every gesture,
Release worked out from On, a gesture's channels forced off or on and their thresholds moved,
trials disabled, and recording over a page of music. How to get there is in
`face-dialog-plan.md`; where the plan and this file disagree, this file wins.

This changes parts of `face-gestures-spec.md` ("The gestures", "The settings", "Recording", "What
is stored") and of `face-classifier-spec.md` ("The template", "The levels"). Where they disagree
with this file, this file wins; the last stage of the plan folds this file into them.

The look was settled on mockups, at <https://claude.ai/artifact/JbPK8whCAnLt4ew5hXVrfY>. Use them for
the look; where they and this file disagree, this file wins.

## Words

One spelling per concept, in the code, the docs and on screen alike (`ARCHITECTURE.md`):

- **Strength**: how strongly a gesture is being made at a moment, 0 to 1. It is what the code
  calls a frame's *score* (`score()`, `src/face/_template.ts`) and the detector's *signal*
  (`src/face/_detector.ts`); both become *strength*. (*Score* stays for the music.)
- **Limit**: what the code calls a *cap*: the other side of a pair, which must not pass its limit.
- **Separation**: what the code calls a row's *clear*: how cleanly a channel's held values are apart
  from its values at rest, as a share of its span.
- **Span**: as now (`Row.span`): how far a channel moves, from its rest value to its threshold.
- **Channel**: as now.
- A gesture's thresholds to reach are drawn as **pennants**; limits as **brackets**.

## The gestures

As in `face-gestures-spec.md`, but:

- **Hold** is one setting for every gesture, from 100 to 1500 ms, 500 to start with. A gesture has
  no hold of its own.
- **Release** can't be set: it is always halfway between the gesture's rest level and its On level,
  whether On is the fitted one or one set by hand.
- **On** is the fitted level until it is set by hand (dragged), and goes back to the fitted one
  when the gesture is fitted again (as now) or **Reset**.
- A gesture's **trials** can each be **disabled** or **enabled**. A disabled trial is kept but left
  out of the fit. A gesture is **fitted** when it has three enabled trials or more.
- A gesture's **channels** can be changed, each by its channel name:
  - **forced off**: a channel the fit would use is left out. A limit's channel forced off is that
    limit turned off. A channel forced off whose partner is its limit takes the limit with it, but
    the limit's own forced-off stays as it was set;
  - **forced on**: a channel the fit didn't pick is put in, whether or not it is clear of rest, beside
    the ten the fit picks (it doesn't count toward them). Only a channel that moves can be forced on:
    its held median differs from its rest median;
  - a **threshold** moved: a channel's threshold (its edge), or a limit's limit (its cap), fixed
    where it was put.
- Each of these, and disabling or enabling a trial, fits the gesture again from its enabled trials,
  with its channel changes. Its On goes back to the fitted one, as after a recording.
- Channel changes are kept across recordings and changes to trials. **Reset** beside Channels drops
  them all.

### Fitting with channel changes

`face-classifier-spec.md`'s fitting, with:

- A channel forced off is neither a moving channel nor a limit.
- A channel forced on is a moving channel, whatever its separation and span, in addition to those
  picked. Its side, edge, rest's reach, rest value, span and separation are worked out as for any
  channel.
- A moved threshold replaces that channel's edge (a moving channel) or cap (a limit). Its span and
  separation follow from it. A limit's point where it cuts the strength to nothing (`full`) is
  always its partner's edge, moved or not.
- A threshold is kept at least 0.02 from the channel's rest value, on the side it moves; a limit is
  kept at least 0.02 short of its `full`.
- Limits still combine as a root mean square.

## The dialog

Called **Face gestures**, opened as now. It starts the camera when it opens and stops it when it
closes, however it closes. Every change is saved at once. It has two views: **the list** and **a
gesture's details**; recording takes the whole screen.

### The list

From the top:

1. **The preview**: the camera's picture, mirrored, 160 px wide; beside it the face button as the
   reader shows it, ring included (not tappable); beside that **Gesture hold**: its label, its
   value (`500 ms`) on the right, and under them its slider (steps of 50 ms). There is no page
   number, and no line about the ring.
2. **The gestures**, one row each. **Fitted** gestures first, then the others, each group in the
   order its gestures were added. With none: "No gestures yet. Add one, and record yourself doing
   it."
   - A **fitted** gesture's row: its name, a pencil (renames it, asking for the new name: not
     empty), its direction as a dropdown (Next, Back, None), **Record**, and a meter: its strength
     now, 0 to 1, with On as a handle that can be dragged (Release, dashed, follows it). Under the
     meter, its status (below). Tapping the row anywhere but its controls opens its details, and a
     › at its end says so.
   - A gesture **not fitted**: its name, the pencil, **Record**, and "Record N more trials" (N is
     three less its enabled trials; "Record 1 more trial"). No direction, meter or details.
3. **Add gesture…** (asks for its name, as now) and **Done**, on one row.

**The status**, one line, the first that applies:

| Shows | When |
| --- | --- |
| Can't be told from playing | Flag `noChannels` |
| Off: “X” also fires on it | Set to None by the conflict check |
| ⚠ Fires while resting · N trials | Flag `firesAtRest` |
| ⚠ Unreliable · N trials | Flag `unreliable` |
| N trials | Otherwise |

N is the enabled trials. The warnings are in the warning colour.

### A gesture's details

From the top:

1. **The header**: ‹ (back to the list), the name with its pencil, the direction dropdown, and
   **Delete…** (asks first: “Delete “Wink right”?” “Its trials are deleted with it.”).
2. **The preview** (camera and button, as on the list; no hold).
3. **What is wrong**, if anything, in a box in the warning colour: each flag in full, the conflict
   note, and why the last recording ended early. Fires while resting names the trials to blame:
   "All 4 are in trial 9." when they are in one trial, "In trials 3 and 9." otherwise, then "Disable
   it if it went wrong; otherwise force off a channel that rest reaches, or move its threshold away
   from the hatching." (or "them", for several trials).
4. **On level**, with **Reset** beside the title (shown once On was set by hand). A meter 24 px
   tall: the strength now; On as a dark handle with its value on a tag (`On 0.64`), dragged directly
   (keyboard: arrows, 0.01 a step); Release as a dashed line with its value on a dashed tag. Under
   the meter, ticks: the rest level (labelled `rest`) and each enabled trial's held strength
   (labelled `trials`); a trial's tick under On is in the warning colour.
5. **Channels**, with **Reset** beside the title (shown once a channel was changed). One row per
   channel (below), moving channels in the template's order. With no template: "No channel moves
   clearly enough." Under the rows, **Add channel…** (below).
6. **The trials** (below).
7. A row: **Delete N disabled trials…** (shown with any disabled; asks first), then **Record** and
   **Done**.

### A channel's row

- **A switch**: on, the channel is used; off, it is forced off.
- **Its name**, as MediaPipe has it (`eyeBlinkRight`), in the monospace face.
- If it has a limit, **its partner's name** in a chip under it, with the limit's bracket before the
  name. Tapping the chip forces the limit alone off or back on. Off, the chip is grey and its name
  struck through.
- **A bar**, 0 to 1, in one lane, or two when it has a limit:
  - **The channel's lane**: its range at rest hatched (from its rest value to the rest's reach); a
    tick at its rest value (where it counts for nothing); its value now as a filled dot (accent
    when past its threshold, else grey).
  - **The partner's lane**, under it: the bracket at the limit (`]` for a limit to stay under, `[`
    to stay over), and the partner's value now as a hollow ring (warning colour once past the
    limit, else grey). No shading.
  - **The pennant** at the threshold: a line with a flag pointing toward the gesture's side (right
    for "at least", left for "at most"). With a limit, its line runs down through the partner's
    lane, as that is where the limit cuts the strength to nothing.
  - The pennant, the bracket and the tick are drawn over the lanes and the dots.
  - Dragging the pennant moves the threshold; dragging the bracket moves the limit. While dragging,
    the meters, the ring and the dots use the new threshold at once; the gesture is fitted again
    when it is let go. Keyboard: arrows, 0.01 a step, fitting again on each.
- **The thresholds**, on the right: the channel's (`≥ 0.58`, `≤ 0.08`), and under it the limit's in
  the warning colour (`≤ 0.39`). No words.
- **Forced off**: the row's switch off greys the whole row, with everything left where it was, and
  strikes through its thresholds; a limit forced off greys its chip, its lane and its bracket, and
  strikes through its threshold.

### Add channel…

A menu over the dialog, headed **Add a channel**, with columns **span** and **separation ▾**: every
channel not in the template (nor a limit), each with its span and separation, by separation from the
highest. Those that don't move come last, greyed, and can't be picked. Picking one forces it on.
It is worked out from the enabled trials when the details open.

### The trials

- **Show**, a row of chips: **Strength**, then each channel in the template, then each limit's
  channel. Strength is picked when the details open.
- Every trial, the latest first, in a box that scrolls (at most about six rows high), its header
  row staying in sight. A row:
  - a switch: enabled or disabled;
  - its number (1 for the first recorded);
  - a trace: what is shown, through the trial, 0 at the bottom and 1 at the top, with its held part
    shaded and two levels dashed, unlabelled;
  - two or three numbers;
  - a disabled trial's row is faded, and its numbers struck through.
- **Strength** shown: the trace is its strength against the fit, the levels On and Release, and a
  short tick in the warning colour under each misfire (a rest frame whose strength reaches On).
  Numbers: **Held** (its held strength against a fit without it, as the meter's ticks) and **At
  rest** (the 95th percentile of its strength over its rest frames). Held under On, or At rest at
  Release or over, is in the warning colour, and so is the row's background.
- **A channel** shown: the trace is the channel's value, the levels its threshold and its rest
  value. Numbers: **Held** (the median over its held frames), **At rest** (the rest's reach: its
  90th percentile over rest frames toward the gesture's side) and **Past** (the share of its held
  frames at or past the threshold, as a percentage). Held short of the threshold, or At rest at or
  past it, is in the warning colour, with the row.
- **A limit's channel** shown: the trace is the partner's value, the levels its limit and its
  `full`. Numbers: **Held** (the median over held frames), **At rest** (its 90th percentile, or
  10th for a limit to stay over, over rest frames) and **Past** (the share of held frames past the
  limit). Held past the limit is in the warning colour, with the row.
- With no template, only the switches and the numbers are shown.

## Recording

From **Record**, on the list or in the details.

### Play from

A dialog over the Face gestures dialog, titled **Record “<name>”**:

- **Play from**: a thumbnail of the page picked last (about 96 px wide), the score's title and
  "page N", and **Change…**;
- "Trials follow one another until you tap the screen.";
- **Cancel** and **Start**.

With no page picked yet, or the one picked no longer in the library, Record goes straight to
Change…. **Change…** lists the library's scores by title, then shows the picked score's pages as
thumbnails; tapping one picks it and comes back to Play from. With no scores in the library, the
list offers only **Empty staves**: a page of empty staves drawn by the app. The page picked is kept
on this device for every gesture.

### The recording screen

From **Start**: the whole screen shows the picked page, a still picture fitting the screen, white
around it. Over its top, a bar holding only:

- the instruction, large, on the left: as now ("Start playing. The first trial starts in 3… 2…
  1…", "Keep playing. Wait for the rising tones.", "Ready: on the third tone", "Hold it", "Let go on
  the third tone", "Let go. Keep playing.");
- on the right, "Recording “<name>” · trial N" and under it "K kept · tap anywhere to stop". Before
  the first trial, "Turn the sound on to hear the tones." in place of the second line.

Trials follow one another, each as now, without end. **A tap anywhere** stops: the trials finished
are kept, the one under way is thrown away, and the dialog comes back. A trial without enough held
or rest frames ends the recording there, as now, and the dialog says why. Closing the dialog's
overlay (the back gesture) stops it the same way. Nothing turns while recording. The camera stays on
as for the dialog; the preview isn't shown.

When it ends, the gesture is fitted again from all its enabled trials, with its channel changes, and
the conflict check runs with it the first to give way, as now.

## What is stored

In the kv store, the device's own:

- `face-gestures` (a `FaceSettings`):
  - gains `hold` (ms), for every gesture; missing is 500;
  - each gesture loses `hold` and `release`, and gains `channels?: { forcedOff: string[]; forcedOn:
    string[]; thresholds: Record<string, number> }`, by channel name, missing when none was
    changed;
  - a fit loses `release` and `missed`; its template loses `missed`; its `caps` are `limits`, and a
    row's `clear` is `separation`. Its `trials` counts the enabled trials. Its version
    (`FIT_VERSION`) goes up by one.
- `face-trials:<id>`: a trial gains `disabled?: true`.
- `face-recording-page`, new: `{ scoreId: string; page: number }` (page from 0), or `{ empty: true }`
  for empty staves. Missing until a page is picked.

**Dropped** when the new version first loads: each gesture's own hold (every gesture gets 500 ms),
its Release and its On set by hand (the fitting's version goes up, so every gesture is fitted again
from its trials, which puts On back to the fitted one). Gestures, their names, directions, notes
and trials are kept. The stored data's version stays 5.
