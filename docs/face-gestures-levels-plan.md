# Face gestures, one signal and release levels: plan

How to get each face gesture down to one signal with an on level and a release level, all
adjustable. What the result must be is in `face-gestures-spec.md` ("How close a gesture is", "The
gestures", "The settings", "Calibration", "What is stored"); where the two disagree, the spec wins.

What changes, in short:

- A wink's signal is the winking eye's score minus the other eye's, at least 0. The hidden
  other-eye level (`otherBelow`) goes.
- Each gesture gets a `release` level beside its `threshold` (shown as **On**). Once on, a gesture
  stays on until its signal falls under `release`, not just under `threshold`.
- The ring's faint arc counts from `release` up to `threshold`.
- The dialog's **Sensitivity** slider becomes **On** and **Release** sliders on the meter's scale,
  and the meter gets a second mark.
- Calibration sets `release` as well, and no longer looks at the other eye.

The stored field keeps the name `threshold`, so stored on levels are kept. Stored `otherBelow`
values are dropped (`faceSettingsFrom` simply no longer reads them).

## Stage 1: the signal, the levels, the detector and calibration

One commit. Everything here is pure and unit-tested; the dialog changes only as much as it must to
compile.

### `src/face/gestures.ts`

- `GestureTune`: remove `otherBelow`; add

  ```ts
  /** The level the signal must fall under to let go once on: in the threshold's range, never over it. */
  release: number;
  ```

  Update `threshold`'s comment to say it is the on level, shown as **On**.
- Remove `OTHER_RANGE`, `otherEye` and `isWink`.
- `measure`: the winks become

  ```ts
  case 'winkLeft': return Math.max(0, (s.eyeBlinkLeft ?? 0) - (s.eyeBlinkRight ?? 0));
  case 'winkRight': return Math.max(0, (s.eyeBlinkRight ?? 0) - (s.eyeBlinkLeft ?? 0));
  ```

  Rename its comment to "A gesture's signal in a frame: what its meter shows and its levels compare
  against."
- `tune(threshold, hold = 250)` sets `release: threshold / 2`. The defaults are otherwise as now.
- Add, for the dialog and `faceSettingsFrom`:

  ```ts
  /** A tune with new levels, kept in range and with release never over threshold: a threshold
   *  moved under release takes release down with it; a release moved over threshold stops there. */
  export function withLevels(g: FaceGesture, t: GestureTune, to: { threshold?: number; release?: number }): GestureTune
  ```

  Clamp each given level to `thresholdRange(g)`, then set `release = min(release, threshold)`.
  That one rule covers both cases.
- `faceSettingsFrom`: read `threshold` as now; read `release` with `num`, defaulting to half the
  read threshold; then clamp release to `[range.min, threshold]`. Don't read `otherBelow`.

Tests (`gestures.test.ts`):

- Update the two existing `faceSettingsFrom` expectations: no `otherBelow`, a `release`.
- Missing release is half the stored threshold (stored `threshold: 0.6` gives `release: 0.3`).
- A stored release over the threshold comes back equal to the threshold.
- A stored `otherBelow` doesn't appear in the result.
- `measure` of a wink: 0.9 and 0.1 gives 0.8; a blink (0.9 and 0.9) gives 0; the other eye more
  closed gives 0, not a negative.
- `withLevels`: moving threshold under release takes release down; moving release over threshold
  stops at threshold; both clamp to the range.

### `src/face/_detector.ts`

Remove `otherUnder`, `isOn` and the `otherEye` import. A gesture is held (on) when its `Seen` has
`since` or `turned`. Each frame, for each gesture:

1. If its direction is none, or there is no face: `{ turned: false }`, no progress.
2. `v = measure(id, f)`. It is on if it was held and `v > t.release`, or wasn't and `v >
   t.threshold`.
3. Not on: `{ turned: false }`, and bump the faint progress with `near(v, t)`, hold 0.
4. On and `turned`: unchanged, no progress (nothing until let go).
5. On, not turned: `since = seen.since ?? now`. If no turn yet this frame and `now − since >=
   t.hold`, turn and store `{ turned: true }`. Otherwise store `{ since, turned: false }` and bump
   progress with near 1 and hold `(now − since) / t.hold`.

```ts
/** How close a signal is to its on level, counted from its release level: 0..1. */
function near(v: number, t: GestureTune): number
```

When `threshold === release`, it is 1 for `v > threshold` and 0 otherwise (no division by zero).

`face/face-button.ts` needs no change: it already draws the solid arc only while `near >= 1`.
Update its comment at line 89 to say "once the gesture is on".

Tests (`_detector.test.ts`); the existing ones keep passing with the defaults (on 0.5, release
0.25). Add:

- A wink whose signal dips between release and on (say to 0.35) during its hold still turns, at
  the same time as one that didn't dip.
- A dip under release during the hold restarts the hold.
- After a turn, a dip to between release and on doesn't let go: holding on again doesn't turn
  again. A dip under release does, and the next hold turns.
- A blink (both eyes 0.9) never turns a wink and gives it no progress.
- Progress: a signal at release gives near 0; halfway between release and on gives 0.5; once on,
  near is 1 and hold grows.
- A null frame lets a held gesture go.

### `src/face/calibration.ts`

- `attempts(samples: number[], rest: number): number[]`: the peaks, as now but without `other`.
- `calibrated(g, tune, rest, peaks: number[])`: on level as now, then

  ```ts
  release = clamp(rest + (threshold - rest) / 2, r.min, threshold)
  ```

  Drop the `otherBelow` branch and the `OTHER_RANGE` import.
- Update the module comment: it works out the on and release levels.

Tests (`calibration.test.ts`): adjust `bumps` to plain numbers; remove the other-eye tests; add
that the release is halfway from rest to the new on level (rest 0.1, peaks 0.9/0.6/0.8: on 0.3,
release 0.2); and that a release that would fall under the range's minimum is clamped up to it
(headLeft, rest 0°).

### `src/dialogs/face-gestures.ts` (only to compile)

- Remove the `otherEye` import; `samples` is a `Map<FaceGesture, number[]>`; push `measure(g, f)`;
  `top` is `Math.max(...s)`.

Run the tests and the build; commit.

## Stage 2: the dialog's sliders and meter

One commit, in `src/dialogs/face-gestures.ts` and `src/styles/face.css`.

- The meter: add a second mark, `el('div', 'mark release')`, placed like the first at `release /
  scale`. `placeMark` places both.
- Replace the **Sensitivity** slider with:

  ```ts
  slider('On', range.min, range.max, step, t.threshold, show, (v) => setLevels({ threshold: v })),
  slider('Release', range.min, range.max, step, t.release, show, (v) => setLevels({ release: v })),
  ```

  where `show` is `v.toFixed(2)` for scores and `` `${v}°` `` for angles, and `setLevels` calls
  `change(id, withLevels(id, settings[id], to))`, places the marks, and sets each slider's value
  and text from the result (so the Release thumb jumps back when dragged past On, and follows On
  down). `slider` will need to return its input and text, or a `set(v)` function, for this.
  Remove the comment about the slider running backwards.
- `change` already saves; nothing else changes.
- `face.css`: `.face-meter .mark.release { opacity: 0.45; }`.

Run the tests and the build; commit.

## Manual checks in the app

1. Open **Face gestures…**, set Wink left to Next. The meter shows two marks, On at the 0.50 point
   and Release at 0.25.
2. Blink normally: the meter stays near 0. Wink left: it jumps near the right.
3. Drag Release past On: it stops at On. Drag On under Release: Release follows it down.
4. With On at 0.5 and Release at 0.25, wink and partly open the eye during the hold: the page
   number in the preview still turns. Open fully: it doesn't, and winking again turns it again.
5. Watch the preview button's right half: nothing until the signal passes Release, then the faint
   arc grows to full at On, then the solid arc fills over the hold.
6. Calibrate with a wink and a head turn set: afterwards each Release sits about halfway between
   resting and On; Cancel leaves both levels where they were.
7. Close and reopen the dialog: the levels are as you left them.

## Decisions not discussed

- The stored on level keeps the field name `threshold`, so stored values survive; only the dialog
  calls it **On**.
- The release level shares the on level's range (0.05–0.95, or 5°–45°), so it can't be 0.
- The sliders run on the meter's scale, low to high, rather than as a reversed "sensitivity".
- A stored settings without a release gets half its on level, not a recalibration.
- A frame with no face still lets every gesture go, whatever the release level.
