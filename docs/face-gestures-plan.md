# Face gestures: plan

How to get to what `face-gestures-spec.md` describes. Read the spec first; where the two disagree,
the spec wins. Each stage is one commit, or a few, and every commit leaves `npm test` and
`npm run build` passing. Before each push, also try the stage in the running app (`npm run dev`)
with the checks it lists. Commit and push each stage before starting the next.

Code style: match what is there (read `ARCHITECTURE.md` first). Each new module starts with a
comment saying what belongs in it; a pure one says **Pure** in it. Comments say what something is
or why, in the tone of the code around them. The tests run in Node without a DOM: put the logic in
pure functions and test those.

`public/gesture-test.html` already does most of this in one file: the gestures, the hold and
"let go" rules, the pose angles, loading MediaPipe and the detection loop. Read it before stage 2,
and lift from it.

## Where things go

A new directory, `src/face/`, at layer 2, beside `scores/` (it uses `ui/` and `storage/`, nothing above or beside it; the layers test lets a directory import only from lower layers), so both
the reader (layer 7) and the dialogs (layer 6) can use it:

| File | What | Pure |
| --- | --- | --- |
| `face/gestures.ts` | The gestures, their names, `FaceSettings`, the defaults, `hasGestures` | yes |
| `face/_pose.ts` | Yaw and pitch from the face's transform | yes |
| `face/_detector.ts` | Each frame's scores in, a turn and the ring's progress out | yes |
| `face/calibration.ts` | Rest levels, attempts and thresholds | yes |
| `face/store.ts` | Loading and saving `FaceSettings` | |
| `face/_landmarker.ts` | Loading MediaPipe and the model, once; one frame's scores | |
| `face/watcher.ts` | `FaceWatcher`: the camera, the detection loop, statuses and events | |
| `face/face-button.ts` | The button: its glyph, states, split ring, long press, pulse | |

And:

| File | What | Pure |
| --- | --- | --- |
| `reader/_turn-gate.ts` | The 100 ms gate on turns | yes |
| `reader/_face-watch.ts` | When watching is on; which state the button shows | yes |
| `dialogs/face-gestures.ts` | The Face gestures dialog | |
| `styles/face.css` | The button's and the dialog's styles | |
| `scripts/copy-mediapipe.mjs` | Puts MediaPipe's WASM and the model in `public/mediapipe/` | |

## Stage 1: the turn gate

`src/reader/_turn-gate.ts`, pure:

```ts
/** How long after a turn that went through another is dropped, either way. */
export const TURN_GAP_MS = 100;

export interface TurnGate { lastAt?: number }

/** Whether a turn asked for at `at` (ms) goes through, and the gate after it. */
export function gateTurn(g: TurnGate, at: number): { gate: TurnGate; pass: boolean };
```

A turn passes when there is no `lastAt`, or `at - lastAt >= TURN_GAP_MS`; a passing turn sets
`lastAt`, a dropped one leaves it.

In `reader/reader.ts`, a field `private turnGate: TurnGate = {}`, and in `act` (now
`reader.ts:864`), before `this.turn`, for `next` and `prev` only:

```ts
const { gate, pass } = gateTurn(this.turnGate, performance.now());
this.turnGate = gate;
if (!pass) return;
```

`toggleChrome` doesn't go through it. Every turn already goes through `act` (taps and keys from
`_input.ts`); face gestures will too.

Tests (`_turn-gate.test.ts`): the first turn passes; one 50 ms later is dropped; one 100 ms after
the first passes; a dropped turn doesn't move `lastAt` (turns at 0, 60 and 110: the third passes).

Manual check: a pedal or arrow key still turns once per press; two very quick taps turn once.

## Stage 2: the gestures and the detector, pure

Add `face: 2` to `LAYERS` in `src/layers.test.ts`, and a row for `face/` to the layers table in
`ARCHITECTURE.md` (layer 2: "Face gestures: the gestures and their settings, watching the front
camera with MediaPipe, and the button that shows it").

`face/gestures.ts`:

```ts
export type FaceGesture = 'winkLeft' | 'winkRight' | 'longBlink' | 'mouthLeft' | 'mouthRight' | 'headLeft' | 'headRight' | 'nodDown';
export type TurnDir = 'next' | 'prev';

/** Each gesture, in the order the settings show them, with its name and what it measures. */
export const GESTURES: readonly { id: FaceGesture; name: string; kind: 'score' | 'angle' }[];

export interface GestureTune {
  direction: TurnDir | 'none';
  /** A score (0.05–0.95) or, for the head and nod, an angle in degrees (5–45). */
  threshold: number;
  /** ms, 100–1500. */
  hold: number;
  /** Winks only: the other eye's score must be under this. */
  otherBelow?: number;
}
export type FaceSettings = Record<FaceGesture, GestureTune>;

export const DEFAULT_FACE_SETTINGS: FaceSettings;
/** Whether any gesture turns a page. */
export function hasGestures(s: FaceSettings): boolean;
/** Stored settings with every gesture present and every value in its range; missing ones are the defaults. */
export function faceSettingsFrom(stored: unknown): FaceSettings;

/** One frame: the blendshape scores by name, and the head's angles in degrees. */
export interface FaceFrame { scores: Record<string, number>; yaw: number; pitch: number }
/** How far a gesture is on in a frame, for its meter and calibration: its score, or its angle. */
export function measure(g: FaceGesture, f: FaceFrame): number;
```

Defaults and ranges are in the spec. `measure`: winks their own eye's score, the long blink the
lower of the two eyes, the mouth its score, `headLeft` the yaw, `headRight` minus the yaw, `nodDown`
the pitch. Check the signs against the test page (its "Head to your left" is `yaw > deg`), and
check them again in the app in stage 5.

`face/_pose.ts`: `export function poseOf(m: { data: ArrayLike<number> }): { yaw: number; pitch: number }`,
`pose` from the test page without `roll`.

`face/_detector.ts`:

```ts
export interface Progress { near: number; hold: number }   // each 0..1
export interface DetectorState { /** Per gesture: since when it has been on, or whether it turned and wasn't let go. */ ... }
export const NEW_DETECTOR: DetectorState;

/**
 * One frame at `now` (ms), or `null` for a frame without a face (which lets every gesture go).
 * Gives the turn this frame makes, if any, and each direction's progress for the ring.
 */
export function step(s: DetectorState, f: FaceFrame | null, settings: FaceSettings, now: number):
  { state: DetectorState; turn?: TurnDir; progress: Record<TurnDir, Progress> };
```

The rules, from the test page's `step` without its pause after a turn (the gate does that now):

- A gesture is **on** when its rule in the spec holds. A wink is on only while the other eye is
  under `otherBelow`.
- Off: it forgets when it came on, and is let go.
- On and let go: it starts timing; when it has been on for `hold`, it turns, and is not let go
  until it is off again. Only one gesture turns in a frame: the first in `GESTURES` order.
- Gestures with direction `none` are skipped.
- Progress for a direction is the largest over its gestures: `near` is `measure / threshold`, at
  most 1, and 0 for a wink whose other eye isn't under its level, or for a gesture not let go;
  `hold` is the time on over `hold`, at most 1, and 0 while off.

Tests (`_detector.test.ts`, `_pose.test.ts`, `gestures.test.ts`), each with frames built by a
small helper:

- a wink held past its hold turns once, at the right frame, in its direction; held longer, it
  doesn't turn again; let go and done again, it turns again;
- a wink shorter than its hold doesn't turn;
- both eyes closed (a blink) is not a wink, and its `near` is 0; with the long blink set, it is one;
- a gesture set to none never turns and shows no progress;
- two gestures set to next: progress is the larger;
- a frame with no face lets go;
- `measure` signs for `headLeft` and `headRight`; `poseOf` of the identity matrix is 0, 0;
- `faceSettingsFrom(undefined)` is the defaults; out-of-range values are clamped; an unknown
  direction becomes none.

## Stage 3: storing the settings

- `storage/keys.ts`: `faceGestures: 'face-gestures'`, described as "The face gestures' settings, a
  FaceSettings (face/store.ts)."
- `face/store.ts`:

  ```ts
  export async function loadFaceSettings(): Promise<FaceSettings>;   // faceSettingsFrom(kv.get(...))
  export const saveFaceSettings = (s: FaceSettings) => kv.set(keys.faceGestures, s);
  ```

- `STORAGE.md`: a row in "Every key", and a section `### face-gestures: the face gestures'
  settings` saying what `FaceSettings` holds and that missing is the defaults.

No `DATA_VERSION` change: nothing stored before changes.

## Stage 4: MediaPipe in the build

1. `npm install --save-exact @mediapipe/tasks-vision@1.1.1` (the version the test page used; a
   later one only if it is at least two weeks old and `vision.d.ts` still has the same
   `FaceLandmarker` API).
2. `scripts/copy-mediapipe.mjs`, run before `dev` and `build` beside `copy-pdfjs.mjs` (add it to
   `predev` and `prebuild` in `package.json`):
   - empties `public/mediapipe/`, then copies `vision_wasm_internal.js` and
     `vision_wasm_internal.wasm` from `node_modules/@mediapipe/tasks-vision/wasm/`;
   - copies the model to `public/mediapipe/face_landmarker.task`, from
     `node_modules/.cache/volti/face_landmarker.task`, downloading it there first when it isn't
     there, from
     `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`;
   - checks the model's SHA-256 is
     `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`, and fails (exit 1, saying
     so) when it isn't, deleting the download.
   Add `public/mediapipe/` to `.gitignore`.
3. `vite.config.ts`, `injectManifest`: add `task` to `globPatterns`, and raise
   `maximumFileSizeToCacheInBytes` to `16 * 1024 * 1024`, with a comment that MediaPipe's WASM is
   13.5 MB.
4. `scripts/licenses.ts`: `@mediapipe/tasks-vision` ships no licence file, so add it to `noFile`:
   "Copyright Google LLC. Licensed under the Apache License, Version 2.0: the full text is under
   pdfjs-dist in this file." Add to `header`: "The face model (mediapipe/face_landmarker.task) is
   Google's, under the Apache License, Version 2.0." The package only appears in the list once
   stage 5 imports it.

Checks: `npm run build` lists `mediapipe/vision_wasm_internal.wasm` and
`mediapipe/face_landmarker.task` in the precache (the line "precache N entries" grows by about
17 MB); `dist/mediapipe/` holds the three files. Deleting `node_modules/.cache/volti/` and building
again downloads the model once.

## Stage 5: watching the camera, and the button

`face/_landmarker.ts`:

```ts
/**
 * The landmarker, made on first use and kept for the session: the model and WASM from mediapipe/
 * next to the app; GPU, else CPU. A failed attempt isn't kept: the next call tries again.
 */
export async function landmarker(): Promise<FaceLandmarker>;
/** One frame's scores, or null when no face is in it. */
export function detect(l: FaceLandmarker, video: HTMLVideoElement, now: number): FaceFrame | null;
```

It imports `@mediapipe/tasks-vision` with a dynamic `import()`, so the package is its own chunk,
loaded only here. The base path is `` `${import.meta.env.BASE_URL}mediapipe` ``. Options as the test
page: `runningMode: 'VIDEO'`, `numFaces: 1`, blendshapes and transforms on.

`face/watcher.ts`:

```ts
export type CameraStatus = 'stopped' | 'starting' | 'running' | 'paused';

export interface WatcherEvents {
  /** The camera's status changed. */
  status(s: CameraStatus): void;
  /** Whether a face is seen: false after a second without one, true again on the next face. */
  face(seen: boolean): void;
  /** Each frame, for meters and calibration; null without a face. */
  frame(f: FaceFrame | null): void;
  /** Each frame: how close each direction is. */
  progress(p: Record<TurnDir, Progress>): void;
  /** A gesture turned. */
  turn(dir: TurnDir): void;
  /** The camera or the model couldn't start, or the camera ended: stopped. */
  failed(e: unknown): void;
}

export class FaceWatcher {
  constructor(events: Partial<WatcherEvents>, settings: FaceSettings);
  /** The video element, for a preview (the dialog shows it; the reader doesn't). */
  readonly video: HTMLVideoElement;
  /** Start the front camera and detection (status starting, then running). */
  start(): Promise<void>;
  /** Stop the camera and detection (status stopped). Safe to call when stopped. */
  stop(): void;
  /** New settings: the detector starts afresh with them. */
  setSettings(s: FaceSettings): void;
}

/** Load MediaPipe and the model in the background, if any gesture is set; failures are dropped (starting tries again). */
export async function warmUp(): Promise<void>;
```

`warmUp` loads the settings (`loadFaceSettings`) and, when `hasGestures`, calls `landmarker()`,
catching everything. In `library/library.ts`, the constructor's first `void this.refresh()` (now
`library.ts:121`) becomes `void this.refresh().then(() => warmUp())`, so the loading starts once the
library has read its scores, and never competes with that.

- `start`: `getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } })`,
  the video `playsInline`, `muted`, `autoplay`; `landmarker()`; then the loop.
- The loop runs on `requestAnimationFrame`, detecting at most 15 times a second and only on a new
  video frame (the test page's `tick`). Each detection: `detect`, then `step`, then the events.
- The track's `mute` sets `paused` (the detector is reset), `unmute` sets `running`; `ended`
  stops and calls `failed`.
- Any error in `start` stops the camera and calls `failed`.

`face/face-button.ts`:

```ts
export type FaceButtonState = 'unavailable' | 'off' | 'starting' | 'watching' | 'noFace' | 'paused';

export interface FaceButton {
  el: HTMLElement;
  show(s: FaceButtonState): void;
  /** The split ring; no progress empties it. */
  progress(p?: Record<TurnDir, Progress>): void;
  /** One pulse. */
  pulse(): void;
}

/** The button. `tap` and `longPress` are not called when made with `interactive: false` (the dialog's). */
export function faceButton(o: { tap?: () => void; longPress?: () => void; interactive?: boolean }): FaceButton;
```

- The glyph, in a 24×24 `viewBox`, stroked 2 px with round caps and joins, no fill, 22 px across:

  ```ts
  const VIEWFINDER = 'M4 8V5.5C4 4.7 4.7 4 5.5 4H8M16 4h2.5c.8 0 1.5.7 1.5 1.5V8M20 16v2.5c0 .8-.7 1.5-1.5 1.5H16M8 20H5.5c-.8 0-1.5-.7-1.5-1.5V16'
    + 'M14.5 10.5a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0' // the head
    + 'M7.8 16.5c.9-1.6 2.4-2.5 4.2-2.5s3.3.9 4.2 2.5'; // the shoulders
  const SLASH = 'M4 4l16 16'; // added for "can't turn on"
  ```

- The states' looks are in the spec's table. The button's base look is the reader's `.back`
  (`styles/reader.css:36-40`). A ring is a `box-shadow: 0 0 0 2.5px <colour>`; Starting's turning
  arc is an `::after` with a 2.5 px border whose top is the accent, rotating once every 0.9 s; the
  blink is a `scaleY(0.12)` at 94% of a 3.6 s animation; the pulse is a `box-shadow` growing from 0
  to 12 px while fading, 0.7 s.
- The split ring is an SVG laid over the button, 64 px square, centred on it, with
  `pointer-events: none`. Each half is two paths (faint, then solid over it), stroke 4, round caps,
  no fill: an arc of radius 28.5 round the centre (32, 32), from the top (0°) to `±170° × fraction`,
  clockwise for next and anticlockwise for back:

  ```ts
  /** The arc of radius r round (32, 32) from angle a to b, in degrees from the top, clockwise positive. */
  function arc(r: number, a: number, b: number): string {
    const p = (d: number) => { const t = (d - 90) * Math.PI / 180; return `${32 + r * Math.cos(t)} ${32 + r * Math.sin(t)}`; };
    return `M${p(a)}A${r} ${r} 0 ${Math.abs(b - a) > 180 ? 1 : 0} ${b > a ? 1 : 0} ${p(b)}`;
  }
  ```

  Faint is the accent at 35% opacity; solid is the accent. Draw nothing for a fraction of 0.
- Long press: `onLongPress` from `ui/long-press.ts`; while the press is held, a class on the
  button runs the filling ring (a CSS animation of 500 ms, `LONG_PRESS_MS`).
- `aria-label`: "Face gestures", with `aria-pressed` true while watching.
- Styles in `styles/face.css`, imported by `main.ts` after `reader.css`; the colours are the
  reader's tokens in `styles/base.css` (`--accent`, `--warn`) plus a grey token added there for
  paused.

No unit tests here (DOM and camera); stage 6's state machine is tested. Checks are in stage 6.

## Stage 6: the reader

`reader/_face-watch.ts`, pure:

```ts
export type Watching = 'off' | 'on';
export type WatchEvent =
  | { kind: 'tap'; available: boolean }
  | { kind: 'toolbarShown' } | { kind: 'readerClosed' } | { kind: 'pageHidden' }
  | { kind: 'settingsOpened' } | { kind: 'cameraFailed' } | { kind: 'gesturesChanged'; available: boolean };

/** Whether watching is on after `e`: see "When it watches" in the spec. */
export function nextWatching(w: Watching, e: WatchEvent): Watching;

/** What the button shows. */
export function buttonState(o: { available: boolean; watching: Watching; camera: CameraStatus; faceSeen: boolean }): FaceButtonState;
```

`tap` turns on from off when `available`, and off from on; every other event turns off, except
`gesturesChanged` with `available`, which leaves it. `buttonState`: not available → `unavailable`;
off → `off`; on and camera `stopped` or `starting` → `starting`; `paused` → `paused`; running
without a face → `noFace`; else `watching`.

Tests (`_face-watch.test.ts`): each event from each state; a tap while unavailable stays off; each
`buttonState` row.

In `reader/reader.ts`:

- Fields: `faceSettings` (loaded with `loadFaceSettings` in the constructor, as the tool settings
  are), `watching: Watching = 'off'`, `camera: CameraStatus = 'stopped'`, `faceSeen = false`, and
  `face: FaceWatcher` made with the events below, and `faceButton`.
- The button is made beside `back` (now `reader.ts:309-314`) and appended to `root` after it.
  `tap`: when `!hasGestures(this.faceSettings)`, open the settings; else `this.watchEvent({ kind: 'tap', available: true })`.
  `longPress`: open the settings.
- One method takes every event:

  ```ts
  /** Tell the face watch what happened; start or stop the camera as it says, and show the button. */
  private watchEvent(e: WatchEvent): void
  ```

  It calls `nextWatching`; going on, `void this.face.start()`; going off, `this.face.stop()` and
  `faceButton.progress()`; then `faceButton.show(buttonState(...))`.
- Where the events come from: `showChrome(true)` → `toolbarShown`; `close()` → `readerClosed`
  (before `this.input.detach()`); `onVisible` when hidden → `pageHidden`; opening the settings →
  `settingsOpened`; the watcher's `failed` → `cameraFailed`, and
  `this.say(failed('start the camera', e))`.
- The watcher's events: `status` and `face` update the fields and the button; `progress` →
  `faceButton.progress(p)`; `turn` → `this.act(dir)` (through the gate), and `faceButton.pulse()`
  when the page turned (`act` can say whether it did: make it return a boolean, or check the gate
  first).
- Opening the settings: `watchEvent({ kind: 'settingsOpened' })`, then `openFaceGestures(...)`
  (stage 8), and when it closes, load the settings again, `this.face.setSettings(s)`, and
  `watchEvent({ kind: 'gesturesChanged', available: hasGestures(s) })`. Until stage 8, the settings
  open nothing.
- CSS: the button shows only while `.reader.chrome-hidden`, like `.back`, at the top right with the
  safe-area insets: `top: max(12px, env(safe-area-inset-top, 0px))`, `right: max(12px, env(safe-area-inset-right, 0px))`, so the split ring stays on the screen.

Manual checks (with a gesture set by hand in the kv store, as the dialog comes in stage 8, or with
stage 8 done first if easier):

- With no gesture set, the button is struck through.
- Tap: starting, then watching; cover the camera: no face, blinking; uncover: watching.
- Each set gesture turns the page; the ring fills as described; the button pulses on a turn.
- Show the toolbar: the button goes, the camera light goes off; hide it: the button is off.
- Switch to another app and back: off. Pull down the notification shade: watching carries on, or
  shows paused and comes back.
- Turning the head the person's left is `headLeft`.
- Deny camera permission: off, and the reader says why.

## Stage 7: calibration, pure

`face/calibration.ts`:

```ts
/** The 95th percentile of a gesture's measures while resting. */
export function restLevel(samples: number[]): number;

/** The attempts in a gesture step's samples, each its peak (and, for winks, the other eye at it). */
export function attempts(samples: { value: number; other?: number }[], rest: number): { peak: number; other?: number }[];

/** The calibrated tune for a gesture, or why it isn't reliable. */
export function calibrated(g: FaceGesture, tune: GestureTune, rest: number, found: { peak: number; other?: number }[]):
  { tune: GestureTune } | { unreliable: true };
```

The rules are in the spec ("Calibration"). `attempts` uses a rising line: rest plus half the way
to the highest value so far; an attempt starts when a sample goes over it and ends when one falls
under it. Clamp results to the ranges in `gestures.ts`.

Tests: `restLevel` of 100 values; `attempts` finds three clear bumps, and doesn't count noise
under the line; `calibrated` sets 40% of the way to the lowest peak; too few attempts or too small
a gap is unreliable; a wink's `otherBelow`.

## Stage 8: the settings dialog

`dialogs/face-gestures.ts`:

```ts
/** The Face gestures dialog: starts the camera while open; `closed` is called when it closes, however. */
export function openFaceGestures(closed?: () => void): void;
```

- `showDialog('Face gestures', 'face-gestures')`, filled as the spec's "The settings" says.
- Its own `FaceWatcher`, started on opening and stopped in `whenOverlayCloses` (`ui/overlay.ts`),
  which also calls `closed`. Its `frame` event feeds the meters, `progress` the preview button's
  ring, `turn` the page number and a pulse, `failed` the line under the preview.
- Each change: update the settings, `watcher.setSettings`, and `saveFaceSettings`, with
  `failedOnce('save the face gestures', e)` on failure.
- The sliders: `<input type="range">`, sensitivity running from the highest threshold (left) to
  the lowest (right); hold 100–1500 ms in steps of 50.
- Calibrate: replaces the gesture rows with the step's instruction, a countdown and Cancel, and
  collects `measure` values from the `frame` events for each step; at the end, `calibrated` for each
  gesture set to a direction, saves, and shows the rows again with the unreliable ones' lines.
- `library/_folder-banner.ts`: **Face gestures…** after **Marking colours…**.
- `reader/reader.ts`: the button's long press, and its tap while unavailable, open it (stage 6's
  hook).

Manual checks:

- From the library and from the button: the camera starts; closing the dialog any way stops it.
- Set wink right to Next: the button in the reader can be turned on. Set everything to None:
  struck through again, and a tap opens the dialog.
- The meters move; a slider moves the mark; the preview's page turns on the gesture.
- Calibrate with two gestures: the thresholds change; Cancel leaves them; a gesture you don't make
  is reported as not reliable.
- Settings survive a reload.

## Stage 9: removing the test page, and the docs

- Delete `public/gesture-test.html` and `public/gesture-test.webmanifest`, and remove
  `/\/gesture-test\.html/` from the denylist in `src/sw.ts`.
- `TODO.md`: delete the item "Remove the gesture test page".
- `ARCHITECTURE.md`: in "The two screens", a line on the face button and `_face-watch.ts`, and on
  the turn gate (every turn goes through `act` and `gateTurn`).
- `README.md`, if it lists features: face gestures.

Check: `npm run build`, and the app still loads offline after an update (install, go offline,
reload).

## Decisions made here that we didn't discuss

- `face/` is a new directory at layer 2, so the reader and the dialog can share it.
- Only MediaPipe's SIMD WASM is served (13.5 MB): every current browser has WASM SIMD; the
  non-SIMD build would add 12.6 MB to everyone's download.
- The model is downloaded at build time and checked by its SHA-256, not committed to the repo.
- The precache limit goes to 16 MB for all files.
- The landmarker is kept once loaded, for the rest of the session, so turning watching back on is
  quick.
- A failure while loading MediaPipe in the background is dropped, not shown: starting the camera
  tries again and says why it fails.
- A wink's "other eye" level is set by calibration only; the dialog doesn't show it.
- Settings are saved at every change, as the marking colours are.
- The dialog starts the camera as soon as it opens.
- Only one gesture turns per frame, the first in the table's order.
