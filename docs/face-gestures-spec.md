# Face gestures: spec

Turning pages with the face, seen by the front camera, by gestures the person defines: they name a
gesture, record themselves doing it while playing, and set it to turn forward or back. What the
result must be. How a gesture is fitted from its recordings and its strength worked out is in
`face-classifier-spec.md`.

## What the user sees

### The button

While the toolbar is hidden, a round button sits at the top right of the reader, opposite the small
back arrow at the top left, and the same size and look (44 px, white, a hairline edge). It sits
12 px from the top and right edges (the back arrow's 6 px, and 6 more), so its ring (below) stays on
the screen. Its glyph is
a viewfinder: four corner brackets round a head and shoulders. It is hidden while the toolbar shows.

| State | When | Looks like |
| --- | --- | --- |
| Can't turn on | No gesture can turn a page (below) | The glyph struck through, faded to 40% |
| Off | Not watching | The glyph in the bar's colour, no ring |
| Starting | Watching, and the camera or the model is not ready yet | As off, with an accent-coloured arc turning round the edge |
| Watching | The camera is on and a face was seen in the last second | Glyph and a 2.5 px ring in the accent colour (`--accent`), no fill |
| No face | Watching, but no face for a second or more | Glyph and ring in the warning colour (`--warn`); the glyph blinks (closes and opens in about 0.15 s) every 3.6 s |
| Paused | Watching, but the system has interrupted the camera (its track is muted) | Grey ring, glyph faded to 55% |

And two moments:

- **Long press**: while the button is held, an accent ring fills round it over 500 ms; then the
  settings open.
- **Turned**: when a gesture turns the page, the button gives one pulse: a ring that grows 12 px
  out from its edge and fades, over 0.7 s.

With `prefers-reduced-motion`, nothing turns, blinks or pulses; the states still show by colour.

**Tapping it**: when it can't turn on, opens the settings. Otherwise it turns watching on or off.
**A long press** opens the settings in every state.

### How close a gesture is

While watching, a split ring outside the button shows how close each direction is to turning:
the right half for next, the left half for back. Each half starts at the top and runs down its
side, at most 170° (a gap is left at the bottom), on a circle 6.5 px outside the button's edge,
4 px wide, with round ends.

Each half shows the gesture nearest to turning among those set to its direction:

- **Faint** (the accent colour at 35%) grows as the gesture's strength climbs from its Release level
  to its On level: `(strength − release) / (on − release)`, from 0 to 1. Under the Release level it
  shows nothing.
- Once the gesture is on (below), faint is full, and **solid** (the accent colour) grows over it
  with the time held: `held / hold`, the hold being the one for every gesture. The page turns when it is full.
- After a turn, that gesture shows nothing until it is let go.

### When it watches

Watching starts only from a tap on the button. It stops, and stays off until the next tap, when:

- the button is tapped again;
- the toolbar is shown;
- the reader is closed;
- the app is sent to the background (the page is hidden);
- the settings are opened;
- the camera or the model fails to start, or the camera ends: the reader says why, as
  `Could not start the camera: <the error's message>`;
- the settings change so that no gesture can turn a page.

A notification banner doesn't hide the page, so it doesn't stop watching. When the system
interrupts the camera without hiding the page (its track is muted), the button shows Paused, and
watching carries on when the track is unmuted.

What decides this is a pure state machine (`reader/_face-watch.ts`). The reader only tells it
what happened, and starts or stops the camera as its state changes, so the rules above can change
without touching the reader.

### Debouncing every turn

Every page turn, from a tap, a key, a pedal or a face gesture, goes through one gate before it
turns the page. A turn less than 100 ms after the last turn that went through is dropped, in
either direction. Showing and hiding the toolbar doesn't go through it.

The gate is a pure state machine (`reader/_turn-gate.ts`), so later rules (such as telling a quick
second turn from a misfire) are a change to it alone.

### Words

One spelling per concept, in the code, the docs and on screen alike (`ARCHITECTURE.md`):

- **Strength**: how strongly a gesture is being made at a moment, 0 to 1 (`strength()` in
  `src/face/_template.ts`; the detector uses it too). *Score* is for the music; the blendshape
  scores are MediaPipe's.
- **Limit**: the other side of a pair, which must not pass its limit.
- **Separation**: how cleanly a channel's held values are apart from its values at rest, as a share
  of its span.
- **Span**: how far a channel moves, from its rest value to its threshold.
- **Channel**: one of the 52 blendshape scores.
- A gesture's thresholds to reach are drawn as **pennants**; limits as **brackets**.

### The gestures

There are no built-in gestures. The person adds their own, as many as they like, each with:

- a **name**, theirs ("Wink right"), which they can rename;
- its **trials**: recordings of them doing it (below), each of which can be **disabled** (kept, but
  left out of the fit) or enabled;
- a **direction**: next, back, or none. Several may share one;
- an **On level**, from 0.05 to 0.95;
- its **channels**, which can be changed by hand (below).

And there is one **hold** for every gesture: how long a gesture must stay on to turn, from 100 to
1500 ms; 500 ms to start with.

A gesture with three enabled trials or more is **fitted**: `face-classifier-spec.md` says how its
template, its levels and its flags come from its trials. Each frame, a fitted gesture has one
number, its **strength**, from 0 to 1: the only thing its meter shows, the ring fills from and its
levels compare against. Fitting uses the 52 blendshape scores only: a turn of the head or a nod
can't be a gesture for now.

- **On** is the fitted level until it is set by hand (dragged); it goes back to the fitted one on
  **Reset**, or when new trials are recorded. Channel changes and disabling a trial leave it, and
  Reset leaves the channels.
- **Release** can't be set: it is always halfway between the gesture's rest level and its On level,
  whether On is the fitted one or one set by hand.

A gesture **can turn a page** when it is fitted and has a direction. It comes **on** when its
strength reaches its On level, and stays on until its strength falls under its Release level (it is
**let go**), or no face is seen. It turns the page when it has been on for the hold, unless it
already turned and hasn't been let go since. Turning also goes through the gate above.

Gestures that can turn a page can't **conflict** (`face-classifier-spec.md`): one that would is set
to none when it is recorded or given its direction, and its row says why. If two gestures reach
the hold on the same frame, only the first, in the order they were added, turns the page.

A new gesture starts set to Next. Names may repeat.

#### A gesture's channels

Each is changed by its channel name:

- **forced off**: a channel the fit would use is left out. A limit's channel forced off is that
  limit turned off. A channel forced off whose partner is its limit takes the limit with it, but
  the limit's own forced-off stays as it was set;
- **forced on**: a channel the fit didn't pick is put in, whether or not it is clear of rest,
  beside the ten the fit picks (it doesn't count toward them). Only a channel that moves can be
  forced on: its held median differs from its rest median.

Thresholds are the fit's: they can't be moved by hand.

Each of these, and disabling or enabling a trial, fits the gesture again from its enabled trials,
with its channel changes. Its On, if moved by hand, stays: it is independent of the channels and the trials. Channel changes
are kept across recordings and changes to trials. **Reset** beside Channels drops them all.
`face-classifier-spec.md` says how the fit takes them.

### The dialog

Called **Face gestures**, opened from the library's ⋯ menu (**Face gestures…**, after **Marking
colours…**) and from the button (a long press, or a tap while it can't turn on). It starts the camera when it opens and stops it when it
closes, however it closes. Every change is saved at once. It has two views: **the list** and **a
gesture's details**; recording takes the whole screen.

#### The list

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
3. **Add gesture…** (asks for its name, not empty; it may repeat another's) and **Done**, on one row.

**The status**, one line, the first that applies:

| Shows | When |
| --- | --- |
| Can't be told from playing | Flag `noChannels` |
| Off: “X” also fires on it | Set to None by the conflict check |
| ⚠ Fires while resting · N trials | Flag `firesAtRest` |
| ⚠ Unreliable · N trials | Flag `unreliable` |
| N trials | Otherwise |

N is the enabled trials. The warnings are in the warning colour.

#### A gesture's details

From the top:

1. **The header**: ‹ (back to the list), the name with its pencil, the direction dropdown, and
   **Delete…** (asks first: “Delete “Wink right”?” “Its trials are deleted with it.”).
2. **The preview** (camera and button, as on the list; no hold).
3. **What is wrong**, if anything, in a box in the warning colour: each flag in full, the conflict
   note, and why the last recording ended early. Fires while resting names the trials to blame:
   "All 4 are in trial 9." when they are in one trial, "In trials 3 and 9." otherwise, then "Disable
   it if it went wrong; otherwise force off a channel that rest reaches." (or "them", for several
   trials).
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

#### A channel's row

- **A switch**: on, the channel is used; off, it is forced off.
- **Its name**, as MediaPipe has it (`eyeBlinkRight`), in the monospace face.
- If it has a limit, **its partner's name** in a chip under it, with the limit's bracket before the
  name. Tapping the chip forces the limit alone off or back on. Off, the chip is grey and its name
  struck through.
- **A bar**, 0 to 1, in one lane (28 px tall), or two when it has a limit (50 px). Nothing in it is
  moved by hand. Each lane holds where the trials' frames lie, as two bands from the 10th to the
  90th percentile of that channel over the enabled trials' frames: **at rest**, hatched, and
  **held**, solid, the hatching drawn over the solid where they overlap; so the threshold is where
  the held band starts, and the limit where the partner's held band ends.
  - **The channel's lane**, in the accent colour: the bands; a tick at its rest value (where it
    counts for nothing); its value now as a dot.
  - **The partner's lane**, under it, neutral: the same two bands; the bracket at the limit (`]`
    for a limit to stay under, `[` to stay over); its value now as a ring.
  - **The pennant** at the threshold: a line with a flag pointing toward the gesture's side (right
    for "at least", left for "at most"). With a limit, its line runs down through the partner's
    lane, as that is where the limit cuts the strength to nothing.
  - The pennant, the bracket and the tick are drawn over the lanes and the bands; the dot and the
    ring over everything. The dot and the ring are one colour always.
- **The thresholds**, on the right: the channel's (`≥ 0.58`, `≤ 0.08`), and under it the limit's in
  the muted colour (`≤ 0.39`). No words.
- **Forced off**: the row's switch off greys the whole row, with everything left where it was, and
  strikes through its thresholds; a limit forced off greys its chip, its lane, its bands and its
  bracket, and strikes through its threshold. The values now still show on a row forced off, grey.

#### Add channel…

A menu over the dialog, headed **Add a channel**, with columns **span** and **separation ▾**: every
channel not in the template (nor a limit), each with its span and separation, by separation from the
highest. Those that don't move come last, greyed, and can't be picked. Picking one forces it on.
It is worked out from the enabled trials when the details open.

#### The trials

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

### Recording

From **Record**, on the list or in the details.

#### Play from

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

#### The recording screen

From **Start**: the whole screen shows the picked page, a still picture fitting the screen, white
around it. Over its top, a bar holding only:

- the instruction, large, on the left ("Start playing. The first trial starts in 3… 2…
  1…", "Keep playing. Wait for the rising tones.", "Ready: on the third tone", "Hold it", "Let go on
  the third tone", "Let go. Keep playing.");
- on the right, "Recording “<name>” · trial N" and under it "K kept · tap anywhere to stop". Before
  the first trial, "Turn the sound on to hear the tones." in place of the second line.

Trials follow one another, each as `face-classifier-spec.md` says (a lead-in, three rising tones, the
hold, three falling tones, 2 s more), without end. **A tap anywhere** stops: the trials finished
are kept, the one under way is thrown away, and the dialog comes back. A trial without enough held
or rest frames ends the recording there, and the dialog says why. Closing the dialog's
overlay (the back gesture) stops it the same way. Nothing turns while recording. The camera stays on
as for the dialog; the preview isn't shown.

When it ends, the gesture is fitted again from all its enabled trials, with its channel changes, and
the conflict check runs with it the first to give way.

## What is stored

In the kv store, the device's own, like the tool settings:

- `face-gestures`, owned by `face/store.ts`: a `FaceSettings`: the one hold (ms; missing is 500)
  and the gestures in order, each with its id, name, direction, On if moved by hand, why it was set
  to none (if it was), its channel changes (`channels?: { forcedOff: string[]; forcedOn: string[] }`,
  by channel name, missing when none was changed) and its
  **fit**: the fitting's version, how many enabled trials it was fitted from, and, when it is
  fitted, its template (moving channels, with their separations, and limits), its fitted On, its
  rest level, each trial's peak, and its flags. Missing is no gestures.
- `face-trials:<gesture id>`, owned by `face/store.ts`: that gesture's trials, each the times of
  its third tones and its frames as 32-bit floats (per frame: its time in ms from the trial's
  start, the 52 scores in the template's channel order, yaw and pitch in degrees), and `disabled:
  true` when it is left out of the fit. Some 33 kB a trial. Deleted with the gesture, and when its
  disabled trials are deleted.
- `face-recording-page`, owned by `face/store.ts`: `{ scoreId: string; page: number }` (page from
  0), or `{ empty: true }` for empty staves; the page recordings play over, one for every gesture.
  Missing until a page is picked.

The reader reads only `face-gestures`: a fit has all that turning needs. The dialog reads the
trials.

The fitting has a version (`FIT_VERSION`). When stored gestures were fitted by an earlier one, they
are fitted again from their trials when the settings are next loaded (their On moved by hand is
dropped, and so is a hold or a Release a gesture had of its own, from before there was one hold),
and the conflict check runs again. A fit of an earlier version is read as its version and trials
only, so its gesture is kept.

The eight built-in gestures' settings stored before the gestures were the person's own are dropped
(their directions, levels and holds): face gestures are off until a gesture is added and recorded.
This is the stored data's version 5.

## MediaPipe

- `@mediapipe/tasks-vision`, pinned to an exact version, is a dependency. Its code is in a chunk of
  its own (a dynamic `import`), so it doesn't slow the app's start.
- Once the library has opened (its first reading of the scores), if any gesture is set to a
  direction, MediaPipe and the model are loaded in the background, so tapping the button starts
  watching quickly. Otherwise they load when the camera first starts. Once loaded, they stay loaded
  for the session. A failure in the background is dropped: starting the camera tries again, and
  says why if it fails.
- Its WASM files (`vision_wasm_internal.js` and `.wasm`, the SIMD build only) and the face model
  (`face_landmarker.task`, float16, version 1) are served by Volti itself from `mediapipe/` next to
  the app. Nothing is fetched from anywhere else: the privacy policy stays true as it is.
- They are precached with the rest of the app: downloaded on install, again only when they change,
  and available offline; the build's precache limit for one file is 16 MB. The model is downloaded
  at build time and checked by its SHA-256, not committed.
- `licenses.txt` lists the package (Apache-2.0), and says that the model is Google's, under the
  Apache License 2.0.
- Detection runs on the page's own thread at 15 frames a second, with the GPU delegate, falling
  back to the CPU when the GPU fails.

## The test pages

`public/lab/face-signals.html` and `public/lab/face-classifier.html` (the prototype of
`face-classifier-spec.md`) stay as they are, apart from the app: the service worker leaves them
alone, and they keep their own recordings, not the app's.
