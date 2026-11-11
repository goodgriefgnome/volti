# Face gestures you define: plan

How to get from the eight built-in face gestures to what `face-gestures-spec.md` describes: gestures
the person adds and records, fitted and scored as `face-classifier-spec.md` says. Read both specs
first; where they and this plan disagree, the specs win. Each stage is one commit, or a few, and
every commit leaves `npm test` and `npm run build` passing. Commit and push each stage before
starting the next.

Code style: match what is there (read `ARCHITECTURE.md` first). Each new module starts with a
comment saying what belongs in it; a pure one says **Pure** in it. Comments say what something is
or why, in the tone of the code around them. The tests run in Node without a DOM: put the logic in
pure functions and test those. `src/layers.test.ts` lets a directory import from another only its
modules without a leading underscore: what `dialogs/` needs from `face/` has no underscore.

`public/face-classifier.html` already does the fitting, the scoring, the levels, the flags, the
conflict check and the recording with tones, in one file of plain JavaScript. It is the reference:
read its `fit`, `shortOf`, `overOf`, `shortfall`, `overshoot`, `score`, `build`, `firesOn`,
`conflictOf`, `settle`, `tone` and `recordTrials` before stage 1, and port them; don't change what
they compute. Leave that page as it is.

There is no camera where you run, so nothing here can be tried on a face. Each stage says what to
check in the running app without one (`npm run dev`, in a headless browser started with
`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`: the camera starts, and no face
is seen). What needs a face goes in `TODO.manual.md` in the last stage.

## Where things go

In `src/face/` (layer 2):

| File | What | Pure |
| --- | --- | --- |
| `face/template.ts` | New. The channels, a template, fitting one from trials' frames, a frame's score | yes |
| `face/model.ts` | New. A gesture's fit from its trials (template, levels, flags), and the conflict check | yes |
| `face/recording.ts` | New. A trial as stored, its held and rest frames, a trial's timetable, and a recorder that takes frames | yes |
| `face/tones.ts` | New. Playing a tone at a time, and when it will be heard | |
| `face/gestures.ts` | Rewritten. `Gesture`, `FaceSettings`, reading stored settings, levels, which gestures can turn | yes |
| `face/_detector.ts` | Changed. Takes the gestures that can turn and a frame's channels | yes |
| `face/store.ts` | Changed. Settings and trials; fitting again after a change of `FIT_VERSION` | |
| `face/watcher.ts` | Changed. Takes the gestures that can turn; gives each frame's time | |
| `face/_landmarker.ts` | Unchanged | |
| `face/calibration.ts`, `face/calibration.test.ts` | Removed | |

And:

| File | What |
| --- | --- |
| `dialogs/face-gestures.ts` | Rewritten: the rows, adding and removing, the sliders |
| `dialogs/_face-recording.ts` | New. A round of trials in the dialog: the instruction, the tones, the recorder |
| `dialogs/_face-details.ts` | New. A row's Details: the line and the table of channels |
| `styles/face.css` | The new rows' styles |
| `storage/keys.ts`, `stored-data.ts`, `STORAGE.md` | The trials' key, version 5 |
| `reader/reader.ts`, `library/library.ts` | The changed names (`hasGestures`, the watcher's settings) |

## Stage 1: templates

`src/face/template.ts`, pure, with `template.test.ts`. A port of the prototype's `fit` and `score`.

```ts
/** The 52 channels, in the order frames are stored in: each pair's left then right, then those without a counterpart. */
export const CHANNELS: readonly string[];
/** A frame's channels from MediaPipe's scores by name; a missing one is 0. */
export function channelsOf(scores: Record<string, number>): Float32Array;
/** A paired channel's counterpart on the other side, or -1. */
export function partnerOf(c: number): number;
/** `values`' quantile `q` (0 to 1), interpolating linearly; NaN of none. */
export function quantile(values: ArrayLike<number>, q: number): number;

/** One trial's frames as channels: those held, and those at rest with their times (ms). */
export interface TrialFrames { held: Float32Array[]; rest: Float32Array[]; restT: number[] }

/** A channel that moves: which way from rest, its held edge, the rest's reach, its rest value, its span, and how clear it is. */
export interface Row { c: number; side: 1 | -1; edge: number; far: number; rest: number; span: number; clear: number }
/** A capped channel: the way its counterpart moves, its cap, where it is wholly out, its rest value. */
export interface Cap { c: number; side: 1 | -1; cap: number; full: number; rest: number }
export interface Template { rows: Row[]; caps: Cap[]; missed: Row[] }

export function fit(trials: TrialFrames[]): Template;
/** How far short of the gesture a moving channel is, 0 to 1. */
export function shortOf(r: Row, v: number): number;
/** How far past its cap a capped channel is, 0 to 1. */
export function overOf(k: Cap, v: number): number;
/** A frame's score, 0 to 1; 0 for a template with no rows. */
export function score(t: Template, x: ArrayLike<number>): number;
```

- `CHANNELS` is the prototype's `NAMES` (its `MIRROR` pairs, then `jawLeft`/`jawRight` and
  `mouthLeft`/`mouthRight`, then `MIDLINE`), in that order.
- The constants are the prototype's, by the same names: `EDGE` 0.1, `MIN_SHIFT` 0.1, `MAX_SUPPORT`
  10, `MIN_CAP` 0.1, `MISSED` 4, `SPARE` 4. Export `MIN_SHIFT` (the dialog shows it).
- `missed` rows are `Row`s that didn't make it (their `clear` may be 0 or less).

Tests, on frames made in the test (a helper giving a trial's frames from "these channels at these
values when held, these at rest", with a small fixed jitter from a seeded generator, not
`Math.random`):

- `quantile`: the median and the ends of a short list; interpolation between two values.
- A channel held at 0.8 and at 0.02 at rest is a row, side +1, its edge near 0.8, its rest near
  0.02; a channel that doesn't move is not a row.
- A channel that goes down (0.25 at rest, 0.01 held) is a row with side -1.
- A channel whose held edge is under 0.1 from its rest value is not a row, and is in `missed`.
- A channel whose held and rest values overlap (rest reaching past the held edge) is not a row.
- More than ten moving channels: the ten clearest are kept.
- Caps: a wink (`eyeBlinkLeft` 0.7 held, `eyeBlinkRight` 0.25 held, both 0.03 at rest) has
  `eyeBlinkLeft` as a row and `eyeBlinkRight` as a cap, not as a row; its cap is near 0.25 and its
  `full` is the row's edge. A blink (both 0.8 held) has both as rows and no caps. A pair moving
  opposite ways keeps both rows and no caps. A channel without a counterpart gives no cap.
- `score`: 1 on a held frame, 0 on a rest frame, between for a frame halfway; a frame past the edge
  scores 1; with four rows, a frame with one row at rest and three at their edges scores 1 (the
  largest shortfall is left out), and with three rows it scores 2/3; the wink template scores a
  both-eyes-closed frame near 0 and scores a wink frame 1.

## Stage 2: trials, fits and conflicts

`src/face/recording.ts`, pure, with `recording.test.ts`:

```ts
/** What a stored frame holds: its time (ms from the trial's start), the 52 channels, yaw and pitch (degrees). */
export const STRIDE = 55;
/** A trial as stored: the times of its third tones (ms from its start), its frames, and how many. */
export interface Trial { tUp: number; tDown: number; n: number; data: Float32Array }
/** A trial's held and rest frames, by the labels of face-classifier-spec.md (500 ms either side of each tone left out). */
export function framesOf(t: Trial): TrialFrames;

/** A trial's timetable, in ms from its start: the rising and falling tones (three each), and its end. */
export interface TrialPlan { ups: number[]; downs: number[]; end: number }
/** A trial's timetable: a lead-in of 2 to 4 s, a hold of 3 to 5 s, 2 s after; `random` gives 0 to 1. */
export function planTrial(random: () => number): TrialPlan;
/** The tones' pitches (Hz), rising; falling is the reverse. The third of each is TONE_LONG_MS long, the others TONE_MS. */
export const TONES: readonly number[];   // 523, 659, 784
export const TONE_MS = 120, TONE_LONG_MS = 250;
/** How many trials a round records, and the least held and rest frames a trial must have to be kept. */
export const ROUND = 5, MIN_FRAMES = 15;

/** Collects one trial's frames. */
export interface Recorder {
  /** A frame at `t` (ms from the trial's start). */
  push(t: number, x: Float32Array, yaw: number, pitch: number): void;
  /** The trial, given when its third tones were heard; undefined when it has too few held or rest frames. */
  finish(tUp: number, tDown: number): Trial | undefined;
}
export function recorder(): Recorder;
```

- `planTrial`: with `lead = 2000 + 2000·random()` and `hold = 3000 + 2000·random()`: `ups` at
  `lead`, `lead + 1000`, `lead + 2000`; `downs` at `lead + hold`, `lead + hold + 1000`,
  `lead + hold + 2000`; `end = downs[2] + 2000`. So the third rising tone to the third falling one
  is `hold`.
- Tests: `planTrial` with `random` fixed at 0 and at 1; `framesOf` labels frames just inside and
  just outside each 500 ms guard; `recorder().finish` gives the frames pushed, in order, and
  undefined with too few held frames.

`src/face/model.ts`, pure, with `model.test.ts`. A port of the prototype's `build`, `firesOn`,
`conflictOf` and `settle`.

```ts
/** Raised when fitting changes what it computes: stored fits of an earlier version are fitted again. */
export const FIT_VERSION = 1;
export const MIN_TRIALS = 3;

export type Flag =
  | { kind: 'tooFew' }
  | { kind: 'noChannels' }
  | { kind: 'unreliable' }
  | { kind: 'firesAtRest'; frames: number; ms: number };

/** What a gesture's trials give: stored with the gesture. Fitted when it has `template`. */
export interface Fit {
  version: number;
  trials: number;
  flags: Flag[];
  template?: Template;
  /** The fitted levels, the rest level, and each rep's peak; with `template`. */
  on?: number; release?: number; rest?: number; peaks?: number[];
  /** With no template: the clearest channels, for saying what nearly moved. */
  missed?: Row[];
}
export function build(trials: Trial[]): Fit;
/** A flag in words, as face-gestures-spec.md has them. */
export function flagText(f: Flag): string;
```

- `build` is the prototype's: `ON_FRAC` 0.65, `REL_FRAC` 0.5, `MIN_GAP` 0.15; the rest level is the
  0.95 quantile of the scores of all rest frames; each peak is the median score of a trial's held
  frames against a template fitted without that trial; the "fires while resting" count and longest
  run as there (a run breaks at a gap of over 200 ms between rest frames; a run's length is from
  its first frame to its last, plus one frame, taken as 67 ms here: the app's 15 frames a second).

The conflict check, in `model.ts` too. It needs each gesture's levels, so it takes them as given:

```ts
/** A gesture as the conflict check sees it. */
export interface Contender { id: string; name: string; template: Template; release: number; held: Float32Array[][] /* each rep's held frames */ }
/** Why `a` can't turn pages beside `b`, in words, or undefined. */
export function conflictOf(a: Contender, b: Contender): string | undefined;
/**
 * Of `contenders` in order (with the one whose id is `changedId` moved last), the ids of those that
 * conflict with one already let through, each with why.
 */
export function settle(contenders: Contender[], changedId?: string): Map<string, string>;
```

- The words are the prototype's: `“B” also fires on it: it scores 0.97, and its release is 0.42.
  Both are mouthLeft` and `it also fires on “B”: …`; `It only needs …` when the two share no moving
  channel. The dialog puts `Set to None: ` before it and a full stop after.

Tests (with the frame helper of stage 1, moved to a shared `src/face/_test-frames.ts`):

- `build` on two trials: `tooFew`, no template.
- On trials where nothing moves: `noChannels`, no template, `missed` given.
- On five clean trials of a wink: a template, `on` between `rest` and the lowest peak at 0.65 of
  the way, `release` halfway from `rest` to `on`, no flags.
- On trials where one rep doesn't do the gesture: `unreliable`.
- On trials whose rest frames include the gesture for five frames in a row: `firesAtRest` with 5
  frames and about 330 ms.
- `conflictOf`: "mouth left" and "mouth left with brows up" conflict (the first fires on the
  second), and the words name `mouthLeft`; a wink of each eye don't conflict; a wink and a long
  blink don't conflict.
- `settle`: of two that conflict, the later one is in the result; with `changedId` the earlier
  one's, the earlier one is.

Nothing uses these yet. Check: `npm test`, `npm run build`.

## Stage 3: the switch

One commit: the old gestures go, and everything that used them changes together.

### `face/gestures.ts`, rewritten, pure

```ts
export type TurnDir = 'next' | 'prev';
export interface Gesture {
  id: string;
  name: string;
  direction: TurnDir | 'none';
  /** ms, 100–1500. */
  hold: number;
  /** The levels moved by hand; none is the fit's. */
  on?: number; release?: number;
  /** Why it was set to none, in words. */
  note?: string;
  fit: Fit;
}
export interface FaceSettings { gestures: Gesture[] }
export const NO_GESTURES: FaceSettings;
export const HOLD_RANGE = { min: 100, max: 1500 } as const;
export const HOLD_DEFAULT = 250;
export const LEVEL_RANGE = { min: 0.05, max: 0.95 } as const;

export function newGesture(name: string): Gesture;          // direction 'next', no trials: fit { version: FIT_VERSION, trials: 0, flags: [{ kind: 'tooFew' }] }; id from crypto.randomUUID()
/** A gesture's levels: by hand, else the fit's; undefined when it isn't fitted. Release never over on. */
export function levelsOf(g: Gesture): { on: number; release: number; hold: number } | undefined;
/** A gesture with new levels by hand, kept in range and with release never over on (as the old withLevels). */
export function withLevels(g: Gesture, to: { on?: number; release?: number }): Gesture;
/** A gesture that can turn a page, as the detector takes it. */
export interface Active { id: string; direction: TurnDir; on: number; release: number; hold: number; template: Template }
/** The gestures that can turn a page: fitted, with a direction. */
export function activeOf(s: FaceSettings): Active[];
export function hasGestures(s: FaceSettings): boolean;       // activeOf(s).length > 0
/** Stored settings made safe: not an object, or without a gestures list, is NO_GESTURES; a gesture without an id, a name or a fit is dropped; values out of range are clamped. */
export function faceSettingsFrom(stored: unknown): FaceSettings;
export interface FaceFrame { scores: Record<string, number>; yaw: number; pitch: number }   // as now
export const clamp: (v: number, min: number, max: number) => number;                        // as now
```

`FaceGesture`, `GESTURES`, `GestureTune`, `DEFAULT_FACE_SETTINGS`, `thresholdRange` and `measure`
go. Rewrite `gestures.test.ts` for the above: `faceSettingsFrom` on nothing, on the old shape (an
object keyed by `winkLeft` and so on: `NO_GESTURES`), on a good list, on a gesture with a hold of
5000 (clamped); `levelsOf` by hand and by fit, and undefined when not fitted; `withLevels` taking
release down with on; `activeOf` leaving out none and not fitted.

### `face/_detector.ts`

The same rules, by gesture id:

```ts
export type DetectorState = Record<string, Seen>;
export const NEW_DETECTOR: DetectorState = {};
/** One frame's channels at `now` (ms), or `null` for a frame without a face. */
export function step(s: DetectorState, x: Float32Array | null, active: Active[], now: number):
  { state: DetectorState; turn?: TurnDir; progress: Record<TurnDir, Progress> };
```

A gesture's signal is `score(g.template, x)`; it comes on at `>= on` and stays on while
`>= release` (the prototype's comparisons). `near` is as now, from `release` to `on`. Rewrite
`_detector.test.ts` with a one-row template (so the score is that channel's value over its edge):
the tests there now, restated (on at the on level, held for the hold, once until let go, no face
lets go, progress faint then solid, two gestures in one direction show the nearer), keep their
meaning.

### `face/watcher.ts`

- The constructor's second argument and `setSettings` take `Active[]` (rename `setSettings` to
  `setGestures`).
- `tick` makes `x = f ? channelsOf(f.scores) : null` once and gives it to `step`.
- The `frame` event becomes `frame(f: FaceFrame | null, x: Float32Array | null, now: number)`.
- `warmUp` is unchanged (it uses `hasGestures`).

### `face/store.ts`, `storage/keys.ts`, `stored-data.ts`, `STORAGE.md`

```ts
export function loadFaceSettings(): Promise<FaceSettings>;
export function saveFaceSettings(s: FaceSettings): Promise<void>;
export function loadTrials(id: string): Promise<Trial[]>;          // none stored: []
export function saveTrials(id: string, trials: Trial[]): Promise<void>;   // an empty list deletes the key
export function deleteTrials(id: string): Promise<void>;
/** Every gesture fitted again from its stored trials, levels by hand dropped, and conflicts settled. */
export function refit(s: FaceSettings): Promise<FaceSettings>;
```

- `keys.faceTrials = (id: string) => 'face-trials:' + id`, with its comment, and `faceGestures`'s
  comment updated.
- `loadFaceSettings`: `faceSettingsFrom` of what is stored; then, if any gesture's
  `fit.version !== FIT_VERSION`, `refit` it, save it and return that.
- `refit` and the dialog share one function for "these gestures and their trials, settled": put it
  in `face/model.ts` or a new pure `face/settling.ts`, tested:

  ```ts
  /** The settings with every gesture that conflicts set to none with its note; `changedId` gives way first. `trialsOf` has the trials of every gesture with a direction. */
  export function settled(s: FaceSettings, trialsOf: Map<string, Trial[]>, changedId?: string): FaceSettings;
  ```

  It makes a `Contender` of each gesture that can turn (its `levelsOf(g).release`, its trials'
  held frames from `framesOf`), calls `settle`, and for each id it gives sets `direction: 'none'`
  and `note: 'Set to None: ' + why + '.'`.
- `stored-data.ts`: `DATA_VERSION = 5`, and a step from 4: `kv.del(keys.faceGestures)`, with a
  comment saying the eight gestures' settings are dropped. Update `stored-data.test.ts` if it
  counts the steps.
- `STORAGE.md`: the table's row for `face-gestures`, a row for `face-trials:<id>`, and the
  `face-gestures` section rewritten from "What is stored" in `face-gestures-spec.md`.

### `reader/reader.ts`, `library/library.ts`

- `faceSettings` starts as `NO_GESTURES`; the watcher is made with `activeOf(this.faceSettings)`
  and told `setGestures(activeOf(s))` where it was told `setSettings(s)`.
- Nothing else changes: `hasGestures` keeps its name and meaning.

### `dialogs/face-gestures.ts`, rewritten; `face/calibration.ts` and its test removed

This stage's dialog has everything of the spec's but recording and Details:

- the preview, as now (the watcher made with `activeOf(settings)`);
- the rows: name, direction, trial count, **Remove**, the flags and the note, and, when fitted, the
  meter, **On**, **Release** and **Hold** (the present `slider` helper; the meter's fill is the
  gesture's score from the `frame` event's `x`);
- "No gestures yet. Add one, and record yourself doing it." with no rows;
- **Add gesture…** (with `askText` from `ui/ask-text.ts`; look at how `dialogs/setlists.ts` or the
  library asks for a name, and at how a dialog opened from a dialog comes back: `showDialog`
  shows one at a time, so reopen Face gestures after the name is given, or put the name field in
  the dialog itself if reopening restarts the camera noticeably; either is fine);
- **Done**.

Changing a direction runs the conflict check with that gesture's id as `changedId` (load the
trials of every gesture with a direction, `settled`, save, show again); changing it clears its
`note` first. Every change saves and calls `watcher.setGestures(activeOf(settings))`.

`styles/face.css`: styles for what is new in a row (the trial count, the buttons, the flags). Remove
`.face-calibrating` only when stage 4 has replaced it.

`README.md` (the Face gestures bullet) and `ARCHITECTURE.md` (the `face/` row, and the sentence on
page turns) say what is true now.

Check without a face: the library's ⋯ menu opens Face gestures; the camera starts (the fake one);
"No gestures yet…" shows; a gesture can be added, set to Back and None, and removed; its row says
"Record at least three trials."; the reader's face button shows "Can't turn on" and a tap opens the
dialog; reloading keeps the gestures; DevTools shows `face-gestures` as `{ gestures: [...] }` and
`data-version` as 5.

## Stage 4: recording

`src/face/tones.ts` (not pure): the prototype's `tone`:

```ts
/** Play a tone of `freq` Hz for `ms`, `at` ms from now; gives when it will be heard, on the performance clock (ms). */
export function tone(freq: number, at: number, ms: number): number;
/** Make sure sound can play (call from a tap). */
export function readyTones(): void;
```

`src/dialogs/_face-recording.ts`: a round, as "Recording" in `face-gestures-spec.md`:

```ts
export interface Round { cancel(): void }
/**
 * Record a round of trials into `panel`: counts down, plays each trial's tones, shows its
 * instruction, takes frames from `frames` (the dialog's frame listeners), and calls `done` with the
 * trials finished (perhaps none) and, when it ended early, why.
 */
export function recordRound(panel: HTMLElement, frames: Set<FrameListener>, done: (trials: Trial[], problem?: string) => void): Round;
```

- For each trial: `planTrial(Math.random)`; all six tones scheduled at once with `tone`, their
  returned times kept; the trial's start is `performance.now()` when they are scheduled; `tUp` and
  `tDown` are the third tones' heard times less the start. Frames are pushed to a `recorder()` with
  `now - start` from the `frame` event (its `now` is the animation frame's time, the performance
  clock's). The instruction changes by `setTimeout` at the times the spec gives. At `end`, `finish`.
- `cancel` stops the timers and the listener; tones already scheduled may still sound (stopping
  them is not needed, but do it if the oscillators are easily kept).

In `dialogs/face-gestures.ts`:

- a row's **Record 5 trials**: hides the rows and the buttons under them, `watcher.setGestures([])`,
  starts a round; when it is done: append its trials to the gesture's stored ones (`saveTrials`),
  `build` from all of them, set the gesture's `fit`, delete its `on`, `release` and `note`, run the
  conflict check with it as `changedId`, save, `watcher.setGestures(activeOf(settings))`, show the
  rows again, with the round's problem (if any) on the gesture's row;
- **Clear trials** (confirm with the app's way of asking; look for how removing a setlist asks):
  `deleteTrials`, `fit` back to `build([])`, levels by hand and note dropped;
- **Remove** also deletes the trials;
- closing the dialog cancels a round under way.

Remove what is left of calibration (`.face-calibrating` becomes the round's panel, renamed).

Check without a face: **Record 5 trials** counts down, plays the tones in the right order and
timing (listen, or log the scheduled times), shows the instructions in turn, and the round ends
after the first trial with "Your face wasn't seen for most of that trial. Try again."; **Cancel**
goes back to the rows; closing the dialog mid-round leaves nothing running (no tones scheduled
after it, no errors in the console).

Check the whole path without a camera, in a test of the pure parts: make three trials with the
frame helper through `recorder()`, `build` them, and take `activeOf` of settings holding that
gesture through `step` with held frames: it turns after the hold. Add this as a test
(`face/flow.test.ts`).

## Stage 5: Details

`src/dialogs/_face-details.ts`:

```ts
/** A fitted gesture's Details: the line and the table; `update` shows a frame's values in the Now column. */
export function faceDetails(g: Gesture): { el: HTMLElement; update(x: Float32Array | null): void };
```

As the spec's "Details": a `<details>` element (closed to start with; whether it is open is kept
while the dialog shows the rows again, by gesture id), the line, the table (moving channels, then
caps), and "Just missed:". The Now column is filled from the `frame` event's `x`; with no face it
shows a dash. A shortfall or overshoot over 0.25 gets the class the hints' errors use.

A gesture that isn't fitted for want of channels (`noChannels`) shows, under its flag, "The
clearest channels: mouthLeft (clear 0.00, moves 0.04), …; over 0 and 0.1 are needed." from
`fit.missed`.

Check without a face: no row can be fitted without one, so check the table by a test page of your
own or by putting a fitted gesture into the kv store by hand (DevTools, or a throwaway script that
builds one with the frame helper), then: Details opens and closes, stays open across a direction
change, the Now column shows dashes.

## Stage 6: what's left

- `TODO.manual.md`: a group **Face gestures you define**, with the manual checks below.
- `docs/face-gestures-spec.md` and `docs/face-classifier-spec.md`: read them against what was built,
  and where the build had to differ, say so in your last message rather than changing the spec.
- Search for what the old gestures left behind (`winkLeft`, `Calibrate`, `measure(`,
  `DEFAULT_FACE_SETTINGS`, `calibration`) in `src/`, `README.md`, `ARCHITECTURE.md`, `STORAGE.md`.
- `npm test`, `npm run build`, and the checks of stages 3 to 5 once more.

## Manual checks (on the tablet, with the camera)

1. After updating: the app opens ("Updating your scores…" may show briefly); the reader's face
   button is struck through; Face gestures shows "No gestures yet…".
2. Add "Mouth left". Record 5 trials while playing: the tones are heard, the instruction follows
   them, and after the fifth the row shows its meter and sliders, and no flag.
3. The meter rises when the mouth is pushed left, and the preview's ring fills and its page number
   goes up once, and again only after letting go.
4. Add a wink of one eye and record it. It turns its own direction; an ordinary blink doesn't turn
   it; the mouth gesture doesn't turn it, nor it the mouth gesture.
5. Open the wink's Details: the winking eye's channels are rows, the other eye's are caps; the Now
   column moves with the face, and goes red for the other eye during a blink.
6. Add "Mouth left, brows up", record it: it is set to None, and its row says which gesture fires
   on it and on which channels.
7. Record a round with the face out of the camera's view: the round ends after the first trial,
   saying the face wasn't seen.
8. Cancel a round during the third trial: the gesture has two more trials than before.
9. Move On and Release by hand, then record another round: they are back to the fitted ones.
10. Clear a gesture's trials: its meter goes, its direction stays, the button is struck through
    if it was the only one.
11. In the reader, with the toolbar hidden: tap the face button, and turn pages with each gesture;
    turn watching off and on again; reload the app and do it again without opening the dialog.
12. Remove a gesture: DevTools shows its `face-trials:` key gone.

## Decisions not in the specs' discussion

- Frames are recorded at the watcher's 15 a second, not the prototype's 30.
- Each stored frame keeps the head's yaw and pitch, though nothing uses them yet, so that head
  gestures can come later without recording again. Roll is not kept.
- The fit is stored with the gesture, so the reader never reads trials; a change of `FIT_VERSION`
  fits everything again on the next load.
- A new gesture starts set to Next.
- Names may repeat; a gesture can't be renamed (remove it and add it again).
- A round stops at a trial where the face wasn't seen, keeping the trials before it.
- The On and Release fractions (0.65, 0.5) are constants: the prototype's two boxes don't come over.
- The prototype page and `face-signals.html` stay.
