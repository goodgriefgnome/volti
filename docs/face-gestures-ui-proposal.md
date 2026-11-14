# Face gestures dialog: a proposal

A redesign of the Face gestures dialog (`dialogs/face-gestures.ts`), and two new controls: a
gesture's channels can each be turned off, and each one's threshold moved. A proposal to agree on
before a spec and a plan; where it touches what `face-gestures-spec.md` says, it says so.

## What is wrong now

- Everything is in one column, every gesture fully open: name, direction, trial count, three
  buttons, flags, a meter, three sliders and Details, for each gesture
  (`face-gestures.ts:144-209`). With three gestures, the dialog is several screens long, and the
  preview at the top has scrolled away by the time a gesture's sliders are reached, though trying
  a gesture in place is the point of it.
- On and Release are two sliders under the meter they move marks on (`face-gestures.ts:160-207`):
  the eye goes back and forth between them, and nothing shows where they should be. The fit knows:
  the rest level and each rep's peak (`model.ts:72-78`), but they are only in Details, as numbers.
- What a gesture is made of is the Details table (`_face-details.ts:19-56`): six columns of
  numbers, read-only. It is what the person needs to see to judge a gesture, and the place they
  would want to change it, but nothing in it can be changed.
- A gesture's state is a pile of red lines (flags, the conflict note, the round's problem,
  `face-gestures.ts:152-155`), with nothing that says, at a glance, whether it works.
- The direction is a `<select>` (`face-gestures.ts:140-143`): two taps, and the choice hidden
  until opened.

## The design in short

The dialog has two views: **the list**, all gestures, compact; and **a gesture**, one at a time,
with everything about it. The camera preview stays at the top of both, so whatever is being
changed can be tried at once. The meter becomes the levels' control. The Details table becomes
**Channels**: a row per channel, each with a live bar, its threshold as a handle, and a switch.

## The list

```
┌ Face gestures ─────────────────────────────────────────────┐
│ ┌──────────┐  (◎)  ┌──────────────┐                         │
│ │  camera  │       │      12      │                         │
│ └──────────┘       └──────────────┘                         │
│                                                             │
│  Wink right                      [ Back | None | Next● ]    │
│  ▕██████████░░░░│░░░░░│░░░░▏ Ready · 12 trials           ›  │
│ ─────────────────────────────────────────────────────────── │
│  Mouth left                      [ Back● | None | Next ]    │
│  ▕███░░░░░░░░░░░│░░░│░░░░░▏ ⚠ Fires while resting         ›  │
│ ─────────────────────────────────────────────────────────── │
│  Brows up                        [ Back | None● | Next ]    │
│  Off: "Wink right" also fires on it                       ›  │
│ ─────────────────────────────────────────────────────────── │
│  Smile                           [ Back | None | Next● ]    │
│  Not recorded yet                                         ›  │
│                                                             │
│  [ Add gesture… ]                                  [ Done ] │
└─────────────────────────────────────────────────────────────┘
```

Each gesture is one row:

- its **name**, and **Back / None / Next** as a segmented control (three buttons, the chosen one
  filled) in place of the select;
- when fitted, a **thin meter** (6 px) with its On and Release marks, live, so every gesture can be
  watched at once while trying them;
- a **status**, one line, the worst that applies:

  | Status | When |
  | --- | --- |
  | Not recorded yet | No trials |
  | Record 2 more trials | Under three |
  | Can't be told from playing | Flag `noChannels` |
  | Off: "X" also fires on it | Set to none by the conflict check (the note, shortened) |
  | ⚠ Fires while resting | Flag `firesAtRest` |
  | ⚠ Unreliable | Flag `unreliable` |
  | Ready · 12 trials | Fitted, nothing wrong |

  Warnings in the warning colour; the full words are on the gesture's view.
- a **›**: tapping anywhere on the row but the direction opens the gesture.

**Add gesture…** asks for the name as now, then opens the new gesture's view, ready to record.

## A gesture

```
┌ ‹ Wink right ──────────────────────────────── [ Remove ] ──┐
│ ┌──────────┐  (◎)  ┌──────────────┐                         │
│ │  camera  │       │      12      │    [ Back | None | Next● ] │
│ └──────────┘       └──────────────┘                         │
│                                                             │
│  LEVELS                                                     │
│   rest      release        on        reps                   │
│    ┆          ▼             ▼        ┆┆ ┆┆┆                  │
│  ▕█████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░▏        │
│   0                                               1         │
│  Release 0.42 · On 0.61                [ Fitted levels ]    │
│  Hold   ──────●────────────────  250 ms                     │
│                                                             │
│  CHANNELS                                                   │
│  [●] Blink, right eye        ▕░░▓▓▓▓░░░░░░░│░░░●░░▏  ≥ 0.58  │
│  [●] Squint, right eye       ▕░▓▓▓░░░░│░░░░░●░░░░▏  ≥ 0.34  │
│  [ ] Brow down, right        left out by you                │
│  [●] Blink, left eye (cap)   ▕░▓▓░●░░░░░░│░░░░░░▏  ≤ 0.39  │
│                                         [ Reset channels ]  │
│  Not used: Cheek squint, right (0.31) · Jaw left (0.12)…    │
│                                                             │
│  TRIALS                                                     │
│  12 trials                                                  │
│  [ Record 5 trials ]   [ Clear trials ]                     │
│                                                             │
│  ⚠ Fires while resting: 4 frames, 130 ms at the longest.    │
└─────────────────────────────────────────────────────────────┘
```

From the top:

1. **The header**: **‹** back to the list, the gesture's name (tap to rename: there is no way to
   rename now), and **Remove** (asks first, as now).
2. **The preview**, as on the list, with the direction beside it.
3. **What is wrong with it**, if anything, at the top of the content in full words (the flags, the
   conflict note, the round's problem), each with what to do: "Record more trials", "Turn off
   the channels rest reaches", and so on.
4. **Levels**:
   - The meter is **24 px tall** and **is the control**: On and Release are handles on it, dragged
     directly (44 px touch targets above it). Release still can't pass On, and dragging On under
     it takes it down (`withLevels`, `gestures.ts:52-59`, unchanged).
   - Under the bar, as ticks: the **rest level** (`fit.rest`) and each **rep's peak**
     (`fit.peaks`), so the gap the levels must sit in can be seen. A rep's peak under On is in
     the warning colour: that rep, done that way, would not have turned.
   - The values as text beside it, and **Fitted levels**, shown once a level was moved by hand,
     to put them back.
   - **Hold** stays a slider.
   - The sliders go. Keyboard users get the handles as `role="slider"` with arrow keys
     (0.01 a step).
5. **Channels**, in place of Details (below).
6. **Trials**: the count ("12 trials"; under ten, "10 to 15 are best"), **Record 5 trials**,
   **Clear trials**. Recording takes over the gesture's view below the preview, as it takes over
   the rows now.

### Channels

Each of the template's channels is a row: its moving channels first, then its caps.

- **A switch**: on, the channel is in the template; off, it is **left out by you**, and the row
  shrinks to its name and "left out by you", switch still there to bring it back.
- **Its name in words**: "Blink, right eye" for `eyeBlinkRight`, "Mouth to the left" for
  `mouthLeft`; the raw name in small type under it, for the test pages and the classifier spec.
  "(cap)" after a cap's name.
- **A bar from 0 to 1** with:
  - the **rest band**: shaded from the rest value to the rest's reach (`rest` to `far`);
  - the **threshold** as a handle: the edge for a moving channel ("must reach"), the cap for a cap
    ("must stay under"), dragged directly;
  - the **value now**, a dot, live; in the accent colour when it is past the threshold the right
    way, else grey.
  The gap between the band and the handle is how clear the channel is, so the Clear column goes:
  it is seen, not read.
- **The threshold** as text (`≥ 0.58`, `≤ 0.39`).
- **Reset channels**, shown once any channel was turned off or moved: back to the fitted template.
- **Not used**: the "just missed" channels, as now, one line, so the person knows what else moved.

### What changing a channel does

**Turning a channel off** fits the gesture again from its trials, with that channel barred:

- It can't be a moving channel or a cap. A cap whose moving channel is turned off goes with it
  (a cap only exists to stop its partner's gesture being done on both sides).
- The next clearest channel may take the freed place among the ten kept (`MAX_SUPPORT`,
  `template.ts:52`). It then shows as a new row, switch on.
- The rest level, the peaks, the fitted levels and the flags are worked out again, and the conflict
  check runs with this gesture the first to give way, as after a round.

**Moving a threshold** does the same, with that channel's edge (or cap) fixed where it was put:
its span and clearness follow from it, and the levels follow from the template. While the handle is
being dragged, the meters and the ring score with the new threshold at once; the fit runs again when
it is let go.

Why fit again rather than only take the channel out of the score: the score's scale is the levels'
scale. Take a channel out, or move a threshold, and the rest level and the reps' peaks move, so the
old On and Release would be wrong, and so would the flags and the conflict check. Fitting again
keeps them all true.

So **moving a channel puts the levels back to the fitted ones**, as recording does. The person
sets the channels first, then the levels; the view's order says so.

Channel changes are **kept across rounds**: recording more trials fits again with the same channels
off and the same thresholds. **Clear trials** keeps them too; **Reset channels** drops them.

## Recording, in the gesture's view

As now (`_face-recording.ts`), with:

- **five dots** for the round's trials, filled as each is kept, in place of "Trial 2 of 5";
- a **timeline** of the trial under way: a bar with the six tones marked and a moving playhead,
  the held part shaded, so the person sees how long is left of each part without counting;
- the instruction in large type, as now;
- with the gesture fitted already, its meter live (and nothing turns, as now).

## What is stored

A gesture gains, optionally:

```ts
/** The person's changes to the template, by channel name: kept when the gesture is fitted again. */
channels?: { off: string[]; at: Record<string, number> };
```

`build(trials)` becomes `build(trials, channels?)`, and `fit(frames)` takes the barred channels and
fixed edges. Names, not indices, so a change to the channel order can't move them. Stored gestures
without it read as now: nothing to migrate, and the data version stays 5. `FIT_VERSION` doesn't
change: the fitting of a gesture with no channel changes is the same.

## What `face-gestures-spec.md` would change

"The settings" is rewritten for the two views. "The gestures" gains the channel changes and that
they put the levels back. "What is stored" gains `channels`. `face-classifier-spec.md` gains the
barred channels and fixed edges in "The template". The prototype page stays as it is.

## Decisions made here, to overrule

1. Two views (list and gesture) rather than collapsible rows in one list.
2. The meter becomes the On/Release control, and the On and Release sliders go; Hold stays a
   slider.
3. Changing a channel fits the gesture again and puts the levels back to the fitted ones, rather
   than keeping hand-set levels.
4. A turned-off channel can be replaced by the next clearest one, rather than leaving the template
   one channel short.
5. Channel changes survive new rounds and Clear trials; only Reset channels drops them.
6. Only turning off and moving: a "just missed" channel can't be forced in.
7. Details' Clear, Rest reaches and the reps' numbers go, shown as the bar's band and the meter's
   ticks instead.
8. A gesture can be renamed (it can't now).
9. Friendly channel names, with the raw name under them.

## Questions

1. Is it the dialog's layout that bothers you most, or something specific (its length, the
   sliders, the table, the recording)? The proposal changes all of them; it could change fewer.
2. By "adjust the thresholds", do you mean each channel's threshold (as proposed), or something
   else, such as On and Release being easier to set?
3. When a channel is turned off and another takes its place: is that welcome, or should turning
   off only ever shrink a gesture?
4. MediaPipe's `Left` and `Right`: are they the person's own left and right, or the picture's? The
   friendly names need to say the right side; it needs checking on the tablet.
5. Should the reader's button or a toast say which gesture turned the page? It's out of this
   dialog, but it is the other place a gesture's misfires are hard to trace.
