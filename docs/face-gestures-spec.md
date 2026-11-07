# Face gestures: spec

Turning pages with the face, seen by the front camera: a wink, the mouth pushed to one side, the
head turned or nodded, a long blink. What the result must be; how to get there is in
`face-gestures-plan.md`, and where the two disagree, this file wins.

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

- **Faint** (the accent colour at 35%) grows with how near the gesture's score is to its
  threshold: `score / threshold`, at most 1.
- Once the score is over the threshold, **solid** (the accent colour) grows over it with the time
  held: `held / hold`. The page turns when it is full.
- After a turn, that gesture shows nothing until it is let go (its score falls under the
  threshold).

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

| Gesture | Name shown | Is on while |
| --- | --- | --- |
| `winkLeft` | Wink left | `eyeBlinkLeft` is over its threshold and `eyeBlinkRight` is under its "other eye" level |
| `winkRight` | Wink right | the same, the other way round |
| `longBlink` | Long blink | both `eyeBlinkLeft` and `eyeBlinkRight` are over its threshold |
| `mouthLeft` | Mouth to the left | `mouthLeft` is over its threshold |
| `mouthRight` | Mouth to the right | `mouthRight` is over its threshold |
| `headLeft` | Head to the left | the head's yaw is over its threshold, turned to the person's left |
| `headRight` | Head to the right | the yaw is over its threshold, turned to the person's right |
| `nodDown` | Nod down | the head's pitch is over its threshold, tipped down |

Left and right are always the person's own, not the camera's. The scores are MediaPipe Face
Landmarker's blendshapes, from 0 to 1; yaw and pitch are in degrees, from the face's transform.
How close a wink is uses only the winking eye's score, and counts as 0 while the other eye isn't
under its level, so an ordinary blink doesn't light the ring.

Each gesture has:

- a **direction**: next, back, or none. Each gesture has one; several may share one.
- a **threshold**: a score from 0.05 to 0.95, or an angle from 5° to 45°.
- a **hold**: how long it must stay on to turn, from 100 to 1500 ms.
- for the winks only, the **other eye's level**, from 0.05 to 0.9: set by calibration, not shown.

A gesture turns the page when it has been on for its hold, unless it already turned and hasn't
been let go since. Turning also goes through the gate above.

The defaults: every direction none. Thresholds 0.5 (winks, mouth, long blink), 20° (head), 15°
(nod); holds 250 ms, and 700 ms for the long blink; the other eye's level 0.3.

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
   - a meter: its score now, with a mark at the threshold;
   - **Sensitivity**: a slider that moves the threshold (left is less sensitive: a higher
     threshold);
   - **Hold**: a slider, in ms.
3. **Calibrate** (below).
4. **Done**.

### Calibration

From **Calibrate**, for the gestures set to a direction; it sets their thresholds, which can then
be moved with the sliders. The dialog shows each step's instruction, a countdown, and **Cancel**,
which leaves every threshold as it was.

1. **Rest**: "Play as you normally would for 10 seconds, without gesturing." Every score is
   sampled for 10 s. Its **rest level** is its 95th percentile.
2. **Each gesture, in turn**: "Wink left three times" (and so on), for up to 15 s. An **attempt**
   is a stretch where the score rises over the rest level plus half of the way from the rest level
   to the highest score so far, and falls back under it; its **peak** is its highest score. The step
   ends after three attempts, or at 15 s.

Then, for each gesture: if it had fewer than three attempts, or its lowest peak is less than 0.15
(8° for the head and nod) over the rest level, its threshold stays as it was and the dialog says
"Wink left: not reliable for you; try another gesture." Otherwise its threshold is the rest level
plus 40% of the way to the lowest peak. For a wink, the other eye's level is halfway between the
other eye's score at the wink's peaks (the highest of the three) and the new threshold.

## What is stored

One new key in the kv store, `face-gestures`, owned by `face/store.ts`: a `FaceSettings`, each
gesture's direction, threshold, hold and (winks) other eye's level. Missing is the defaults. It is
the device's own, like the tool settings. No existing data changes.

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
