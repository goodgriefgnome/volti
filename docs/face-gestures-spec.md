# Face gestures: spec

Turning pages with the face, seen by the front camera: a wink, the mouth pushed to one side, the
head turned or nodded, a long blink. What the result must be; how to get there is in
`face-gestures-plan.md`, and for the one signal and the release levels in
`face-gestures-levels-plan.md`. Where they disagree, this file wins.

## What the user sees

### The button

While the toolbar is hidden, a round button sits at the top right of the reader, opposite the small
back arrow at the top left, and the same size and look (44 px, white, a hairline edge). It sits
12 px from the top and right edges (the back arrow's 6 px, and 6 more), so its ring (below) stays on
the screen. Its glyph is
a viewfinder: four corner brackets round a head and shoulders. It is hidden while the toolbar shows.

| State | When | Looks like |
| --- | --- | --- |
| Can't turn on | Every gesture is set to none | The glyph struck through, faded to 40% |
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
- the settings change so that every gesture is none.

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

Each gesture is one number, its **signal**. The signal is the only thing the meter shows, the ring
fills from, the levels compare against, and calibration measures.

| Gesture | Name shown | Its signal |
| --- | --- | --- |
| `winkLeft` | Wink left | `eyeBlinkLeft − eyeBlinkRight`, at least 0 |
| `winkRight` | Wink right | `eyeBlinkRight − eyeBlinkLeft`, at least 0 |
| `longBlink` | Long blink | the lower of `eyeBlinkLeft` and `eyeBlinkRight` |
| `mouthLeft` | Mouth to the left | `mouthLeft` |
| `mouthRight` | Mouth to the right | `mouthRight` |
| `headLeft` | Head to the left | the head's yaw, in degrees, positive turned to the person's left |
| `headRight` | Head to the right | the yaw, positive turned to the person's right |
| `nodDown` | Nod down | the head's pitch, in degrees, positive tipped down |

Left and right are always the person's own, not the camera's. The scores are MediaPipe Face
Landmarker's blendshapes, from 0 to 1; yaw and pitch are from the face's transform. An ordinary
blink gives a wink's signal of about 0, so it doesn't light the ring.

Each gesture has:

- a **direction**: next, back, or none. Each gesture has one; several may share one.
- an **on level**: a score from 0.05 to 0.95, or an angle from 5° to 45°.
- a **release level**: in the same range, and never over the on level.
- a **hold**: how long it must stay on to turn, from 100 to 1500 ms.

A gesture comes **on** when its signal goes over its on level, and stays on until its signal falls
under its release level (it is **let go**), or no face is seen. It turns the page when it has been
on for its hold, unless it already turned and hasn't been let go since. Turning also goes through
the gate above.

The defaults: every direction none. On levels 0.5 (winks, mouth, long blink), 20° (head), 15°
(nod); release levels half the on level; holds 250 ms, and 700 ms for the long blink.

### The settings

A dialog called **Face gestures**, opened from the library's ⋯ menu (**Face gestures…**, after
**Marking colours…**), and from the button (a long press, or a tap while it can't turn on). It
starts the camera when it opens and stops it when it closes, however it closes. Every change is
saved at once, as in the marking colours dialog.

From the top:

1. **A preview**: the camera's picture, mirrored, 160 px wide; beside it the button as the reader
   shows it, ring included (not tappable), and a page number that turns as the reader's would, so
   the settings can be tried in place. A line under it says when the camera can't start, and why.
2. **The gestures**, one row each, in the order of the table above: its name and a choice of
   **Next**, **Back** or **None**. A row set to a direction also shows:
   - a meter: its signal now, from 0 at the left (to 1, or 45° for the head and nod), with a mark
     at the on level and a fainter one at the release level;
   - **On**: a slider for the on level, on the meter's scale (further right needs more), showing
     its value (`0.42`, `20°`);
   - **Release**: the same, for the release level. It can't be moved past the on level; moving
     the on level under it takes it down too;
   - **Hold**: a slider, in ms.
3. **Calibrate** (below).
4. **Done**.

### Calibration

From **Calibrate**, for the gestures set to a direction; it sets their on and release levels,
which can then be moved with the sliders. The dialog shows each step's instruction, a countdown,
and **Cancel**, which leaves every level as it was.

1. **Rest**: "Play as you normally would for 10 seconds, without gesturing." Every signal is
   sampled for 10 s. Its **rest level** is its 95th percentile.
2. **Each gesture, in turn**: "Wink left three times" (and so on), for up to 15 s. An **attempt**
   is a stretch where the signal rises over the rest level plus half of the way from the rest level
   to the highest signal so far, and falls back under it; its **peak** is its highest signal. The
   step ends after three attempts, or at 15 s.

Then, for each gesture: if it had fewer than three attempts, or its lowest peak is less than 0.15
(8° for the head and nod) over the rest level, its levels stay as they were and the dialog says
"Wink left: not reliable for you; try another gesture." Otherwise its on level is the rest level
plus 40% of the way to the lowest peak, and its release level is the rest level plus half of the
way to the new on level.

## What is stored

One key in the kv store, `face-gestures`, owned by `face/store.ts`: a `FaceSettings`, each
gesture's direction, on level (stored as `threshold`), release level and hold. Missing is the
defaults; a missing release level is half the stored on level. It is the device's own, like the
tool settings.

The winks' other-eye levels (`otherBelow`) stored before the release level came in are dropped.
Their on levels are kept, though they now apply to the difference between the eyes rather than the
winking eye alone, so a wink may want calibrating again.

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

## The test page

`public/gesture-test.html`, `public/gesture-test.webmanifest` and their entry in `src/sw.ts` are
removed, and so is the TODO item about removing them.
