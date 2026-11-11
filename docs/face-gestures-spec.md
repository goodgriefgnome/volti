# Face gestures: spec

Turning pages with the face, seen by the front camera, by gestures the person defines: they name a
gesture, record themselves doing it while playing, and set it to turn forward or back. What the
result must be. How a gesture is fitted from its recordings and scored is in
`face-classifier-spec.md`; how to get from the eight built-in gestures to these is in
`face-gestures-defined-plan.md` (the earlier `face-gestures-plan.md` and
`face-gestures-levels-plan.md` built what this replaces). Where a plan and this file disagree, this
file wins.

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

- **Faint** (the accent colour at 35%) grows as the gesture's signal climbs from its release level
  to its on level: `(signal − release) / (on − release)`, from 0 to 1. Under the release level it
  shows nothing.
- Once the gesture is on (below), faint is full, and **solid** (the accent colour) grows over it
  with the time held: `held / hold`. The page turns when it is full.
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

### The gestures

There are no built-in gestures. The person adds their own, as many as they like, each with:

- a **name**, theirs ("Wink right");
- its **trials**: recordings of them doing it (below);
- a **direction**: next, back, or none. Several may share one;
- an **on level** and a **release level**, from 0.05 to 0.95, the release level never over the on
  level;
- a **hold**: how long it must stay on to turn, from 100 to 1500 ms; 250 ms to start with.

A gesture with three trials or more is **fitted**: `face-classifier-spec.md` says how its template,
its levels and its flags come from its trials. Each frame, a fitted gesture has one number, its
**score**, from 0 to 1: the only thing its meter shows, the ring fills from and its levels compare
against. Fitting uses the 52 blendshape scores only: a turn of the head or a nod can't be a gesture
for now.

A gesture **can turn a page** when it is fitted and has a direction. It comes **on** when its score
reaches its on level, and stays on until its score falls under its release level (it is **let go**),
or no face is seen. It turns the page when it has been on for its hold, unless it already turned
and hasn't been let go since. Turning also goes through the gate above.

The on and release levels are the fitted ones until a slider moves them; they go back to the fitted
ones whenever the gesture's trials change.

Gestures that can turn a page can't **conflict** (`face-classifier-spec.md`): one that would is set
to none when it is recorded or given its direction, and its row says why.

### The settings

A dialog called **Face gestures**, opened from the library's ⋯ menu (**Face gestures…**, after
**Marking colours…**), and from the button (a long press, or a tap while it can't turn on). It
starts the camera when it opens and stops it when it closes, however it closes. Every change is
saved at once, as in the marking colours dialog.

From the top:

1. **A preview**: the camera's picture, mirrored, 160 px wide; beside it the button as the reader
   shows it, ring included (not tappable), and a page number that turns as the reader's would, so
   the gestures can be tried in place. A line under it says when the camera can't start, and why.
2. **The gestures**, one row each, in the order they were added. With none: "No gestures yet. Add
   one, and record yourself doing it." A row has:
   - its name, and a choice of **Next**, **Back** or **None**;
   - how many trials it has ("5 trials"; under ten, "10 to 15 are best");
   - **Record 5 trials**, **Clear trials** (asks first; not shown with no trials) and **Remove**
     (asks first; removes the gesture and its trials);
   - what is wrong with it, each on a line of its own: its flags, in the words of
     `face-classifier-spec.md` ("Record at least three trials.", "Can't be told from playing: no
     channel's held values are clear of its values at rest.", "Unreliable: a rep left out of the fit
     scores little over rest.", "Fires while resting: 4 frames, 130 ms at the longest."), and why
     it was set to none ("Set to None: "Mouth left" also fires on it: it scores 0.97, and its
     release is 0.42. Both are mouthLeft.");
   - when it is fitted:
     - a meter: its score now, from 0 at the left to 1, with a mark at the on level and a fainter
       one at the release level;
     - **On**, **Release** and **Hold** sliders, as before (the levels in steps of 0.01, showing
       `0.42`; the hold in steps of 50 ms). Release can't be moved past On; moving On under it
       takes it down too;
     - **Details**, closed to start with. Open, it shows a line ("Rest level 0.26. Each rep, left
       out: 0.94, 1.00, 0.95."), and a table of the template's channels: each moving channel's name,
       what it must reach (`≥ 0.58`, `≤ 0.04`), its rest value, the rest's reach, how clear it is,
       and its value **now** with its shortfall (`0.61 (0.00)`); each cap's name, its cap and where
       it is wholly out (`≤ 0.39, out at 0.58`), its rest value, and its value now with its
       overshoot. A shortfall or an overshoot over a quarter is in the warning colour. Under the
       table: "Just missed:" and the four clearest channels left out, with how clear each is and
       its span.
3. **Add gesture…**: asks for its name (not empty; it may repeat another's). The new gesture is set
   to **Next**, with no trials.
4. **Done**.

### Recording

From a gesture's **Record 5 trials**. The rows and the buttons under them give way to the round's
instruction, which trial it is ("Trial 2 of 5"), and **Cancel**. Each trial is as
`face-classifier-spec.md` says (a lead-in, three rising tones, the hold, three falling tones, 2 s
more), and the instruction follows it:

- "Keep playing. Wait for the rising tones." through the lead-in;
- "Ready: on the third tone" from the first rising tone;
- "Hold it" from the third;
- "Let go on the third tone" from the first falling tone;
- "Let go. Keep playing." after the third.

Before the first trial: "Start playing. The first trial starts in 3… 2… 1…".

- Frames are recorded as the watcher gives them (15 a second), each with its time, its 52 scores
  and the head's yaw and pitch.
- While a round is being recorded, nothing turns: the preview's page number and ring stay still.
- A frame without a face is left out. A trial with fewer than 15 held frames or fewer than 15 rest
  frames is thrown away, and the round ends there, saying "Your face wasn't seen for most of that
  trial. Try again."
- **Cancel**, or closing the dialog, throws away the trial under way and keeps those finished.
- When the round ends, the gesture is fitted again from all its trials, its levels go back to the
  fitted ones, and the conflict check runs with this gesture the first to give way.
- The tones need sound: the dialog can't tell whether the tablet is muted. Its instruction says
  "Turn the sound on to hear the tones." before the first trial.

Clearing a gesture's trials leaves it not fitted; its direction stays.

## What is stored

In the kv store, the device's own, like the tool settings:

- `face-gestures`, owned by `face/store.ts`: a `FaceSettings`: the gestures in order, each with its
  id, name, direction, hold, the levels moved by hand (if any), why it was set to none (if it was),
  and its **fit**: the fitting's version, how many trials it was fitted from, and, when it is
  fitted, its template, its fitted levels, its rest level, each rep's peak, and its flags. Missing
  is no gestures.
- `face-trials:<gesture id>`, owned by `face/store.ts`: that gesture's trials, each the times of
  its third tones and its frames as 32-bit floats (per frame: its time in ms from the trial's
  start, the 52 scores in the template's channel order, yaw and pitch in degrees). Some 33 kB a
  trial. Deleted with the gesture, and when its trials are cleared.

The reader reads only `face-gestures`: a fit has all that turning needs. The dialog reads the
trials.

The fitting has a version (`FIT_VERSION`). When stored gestures were fitted by an earlier one, they
are fitted again from their trials when the settings are next loaded, and the conflict check runs
again.

The eight built-in gestures' settings stored before this are dropped (their directions, levels and
holds): face gestures are off until a gesture is added and recorded. This is the stored data's
version 5.

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
  and available offline.
- `licenses.txt` lists the package (Apache-2.0), and says that the model is Google's, under the
  Apache License 2.0.
- Detection runs on the page's own thread at 15 frames a second, with the GPU delegate, falling
  back to the CPU when the GPU fails.

## The test pages

`public/lab/face-signals.html` and `public/lab/face-classifier.html` (the prototype of
`face-classifier-spec.md`) stay as they are, apart from the app: the service worker leaves them
alone, and they keep their own recordings, not the app's.
