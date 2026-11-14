# The Face gestures dialog, redesigned: plan

How to get to what `face-dialog-spec.md` describes. Read the spec first; where the two disagree,
the spec wins. Each stage is one commit, or a few, and every commit leaves `npm test` and
`npm run build` passing. Before each push, also try the stage in the running app (`npm run dev`)
where it shows. Commit and push each stage before starting the next.

The tests run in Node, without a DOM. Logic worth testing goes in pure modules (`_fit.ts`,
`_template.ts`, `gestures.ts`, and the new `_dialog-model.ts`), and the tests call those; the DOM
modules stay thin.

Code style: match what is there (`src/face/` is a good model). Each new module starts with a comment
saying what belongs in it. Comments say what something is or why, in the same tone as the code
around them. British spelling in prose and on screen, American in identifiers and CSS.

Line numbers below are as the files are before stage 1; find things by name once they drift.

## The shape at the end

`src/face/`:

| Module | Holds |
| --- | --- |
| `_template.ts` | Channels, `fit` (now with channel changes), `strength`, `withThreshold`, `candidates` |
| `_fit.ts` | `buildFit` (enabled trials, channel changes), flags, the conflict check |
| `gestures.ts` | `Gesture`, `FaceSettings` (with `hold`), `GestureChannels`, levels, parsing |
| `_dialog-model.ts` (new) | Pure helpers for the dialog: order, status, trial numbers, the blame line |
| `store.ts` | Settings, trials (with `setTrialDisabled`, `deleteDisabledTrials`), the recording page |
| `dialog.ts` | The dialog and its list view |
| `_details.ts` (rewritten) | A gesture's details view |
| `_channel-row.ts` (new) | A channel's row, with its limit |
| `_trials.ts` (new) | The trials panel |
| `_play-from.ts` (new) | Play from, and picking a score and a page |
| `_recording-screen.ts` (new, replaces `_round.ts`) | The recording screen |
| `_meter.ts` (new) | The strength meter with an On handle, on the list and in the details |

`_round.ts` goes. The CSS is in `src/styles/face.css`.

## Stage 1: the words

Renames only; no change in behaviour, but the stored fit's shape changes, so its version goes up.

- `src/face/_template.ts`:
  - `score(t, x)` becomes `strength(t, x)`.
  - `Cap` becomes `Limit`; `Template.caps` becomes `Template.limits`; its field `cap` becomes
    `limit`. `overOf` becomes `pastLimit`. `overshoot` stays (it is a word for what a limit does).
  - `Row.clear` becomes `Row.separation`.
  - `MIN_CAP` becomes `MIN_LIMIT`.
  - Comments: "score" for strength, "cap" for limit, "clear" for separation.
- `src/face/_detector.ts`: "signal" in comments becomes "strength"; `score` calls become
  `strength`.
- `src/face/_fit.ts`, `_details.ts`, `dialog.ts`, `_settling.ts`, `gestures.ts`: follow the renames.
  `flagText`'s `unreliable` words become "Unreliable: a trial left out of the fit has little more
  strength than rest." `conflictOf`'s words: "it scores 0.97" becomes "its strength is 0.97".
- `FIT_VERSION` becomes 2 (`_fit.ts:10`).
- `gestures.ts`, `fitFrom` and `faceSettingsFrom`: a stored fit whose `version` is not
  `FIT_VERSION` must not drop its gesture (today a fit that doesn't parse drops it, and the old
  fits have `caps`). Parse such a fit as `{ version, trials, flags: [] }` only, ignoring the rest:
  `loadFaceSettings` then fits it again from its trials. Keep `rowOk` and `limitOk` checking the
  new field names.
- `src/vocabulary.test.ts`, `RETIRED`, add:
  - `{ on: 'raw', goes: /\bscore\(|\bsignal\b/, wins: 'strength', in: /^(face\/|styles\/face\.css)/ }`
  - `{ on: 'words', goes: /\bcaps?\b|\bcapped\b/i, wins: 'limit', in: /^(face\/|styles\/face\.css)/ }`

  (*Score* stays for the music, which the recording stage brings into `face/`; MediaPipe's
  `scores` keeps its own name.)
- Tests: rename in `_template.test.ts`, `_fit.test.ts`, `gestures.test.ts`, `_detector.test.ts`,
  `flow.test.ts`. Add to `gestures.test.ts`: a stored gesture whose fit has version 1 and `caps` is
  kept, with its id, name and direction, and a fit of `{ version: 1, trials, flags: [] }`.

## Stage 2: one hold, Release from On, disabled trials

- `gestures.ts`:
  - `FaceSettings` becomes `{ hold: number; gestures: Gesture[] }`. `NO_GESTURES` has `hold:
    HOLD_DEFAULT`. `HOLD_DEFAULT` becomes 500.
  - `Gesture` loses `hold` and `release`. `newGesture` follows.
  - `levelsOf(g: Gesture, hold: number)`: `on` is `g.on ?? fit.on`; `release` is
    `rest + 0.5 * (on - rest)` (`fit.rest`); `hold` as given. Export `RELEASE_FRAC = 0.5`.
  - `withLevels(g, on: number)`: only On now, clamped to `LEVEL_RANGE`.
  - `withoutOn(g)`: drops `g.on` (for Reset).
  - `activeOf(s)` passes `s.hold`.
  - `faceSettingsFrom`: `hold` from `stored.hold` (clamped), else `HOLD_DEFAULT`; each gesture's
    `hold` and `release` are ignored.
- `_fit.ts`: `Fit` loses `release` and `missed`; `buildFit` stops working them out. `Template`
  loses `missed` (`_template.ts`); `fit` stops keeping it. `_details.ts`'s "Just missed" line and
  `nearest` go.
- `_recording.ts`: `Trial` gains `disabled?: true`.
- `_fit.ts`: `buildFit(trials)` fits from `trials.filter((t) => !t.disabled)`; `trials` in the fit
  counts those.
- `store.ts`:
  - `setTrialDisabled(id: string, index: number, disabled: boolean): Promise<Trial[]>`: loads,
    changes one trial (`index` in stored order), saves, returns them.
  - `deleteDisabledTrials(id: string): Promise<Trial[]>`.
- `_settling.ts`, `dialog.ts`, `reader/reader.ts`: follow (`levelsOf` takes the hold; the dialog's
  Release slider goes; its Hold slider moves under the preview, setting `settings.hold`).
- Tests (`gestures.test.ts`, `_fit.test.ts`):
  - Release is halfway between rest and On, fitted and by hand.
  - `faceSettingsFrom` gives `hold` 500 when missing, clamps it, and drops a gesture's own hold.
  - `buildFit` of five trials, two disabled, has `trials: 3`, and is the fit of the three.
  - `activeOf` gives every gesture the settings' hold.

## Stage 3: channel changes in the fit

- `gestures.ts`:

  ```ts
  /** A gesture's channels as changed by hand, by channel name. */
  export interface GestureChannels { forcedOff: string[]; forcedOn: string[]; thresholds: Record<string, number> }
  ```

  `Gesture` gains `channels?: GestureChannels`. `faceSettingsFrom` keeps it when its lists are
  strings and its thresholds numbers, dropping unknown channel names.
- `_template.ts`:
  - `fit(trials: TrialFrames[], channels?: GestureChannels): Template`, as the spec's "Fitting with
    channel changes": skip forced-off channels when picking rows and limits; add forced-on channels
    as rows after the picked ones (worked out as any row, if their held median differs from their
    rest median); apply `thresholds` to a row's `edge` (then `span` and `separation` again) or a
    limit's `limit`; a limit's `full` is its partner row's edge after that. Keep thresholds 0.02
    from rest (rows) and short of `full` (limits) with `clamp`.
  - `withThreshold(t: Template, c: number, v: number): Template`: the template with one row's edge or
    one limit's limit moved (and a moved edge's limit's `full`), for scoring while a handle is
    dragged.
  - `interface Candidate { c: number; span: number; separation: number; moves: boolean }` and
    `candidates(trials: TrialFrames[], t: Template): Candidate[]`: every channel not in `t` (nor a
    limit), by separation from the highest, those that don't move last.
- `_fit.ts`: `buildFit(trials, channels?)` passes `channels` to every `fit` (the leave-one-out ones
  too).
- `store.ts` (`refit`) and `dialog.ts` (after a round): pass `g.channels`.
- Tests (`_template.test.ts`, `_fit.test.ts`):
  - A wink's template without forced changes is as before.
  - Forcing off `eyeBlinkRight` leaves it out of the rows, and its limit (`eyeBlinkLeft`) goes too.
  - Forcing off `eyeBlinkLeft` alone leaves the row and drops the limit.
  - Forcing on a channel that moves a little but isn't clear adds it as a row, beside ten picked;
    one that doesn't move isn't added.
  - A threshold moved for a row changes its edge and span, and its limit's `full`; one moved past
    its rest value is kept 0.02 from it.
  - `withThreshold` moves only the one channel.
  - `candidates` are sorted by separation, non-movers last, and leave out the template's channels.

## Stage 4: the dialog's model

New `src/face/_dialog-model.ts`, pure:

```ts
/** The gestures as the list shows them: fitted first, then the others, each in the order added. */
export function listOrder(gestures: Gesture[]): Gesture[];

/** A gesture's status line, or the words for one not fitted ("Record 2 more trials"). */
export function statusOf(g: Gesture): { text: string; warn: boolean };

/** One trial's numbers and trace for the trials panel. `shown` is 'strength' or a channel index. */
export interface TrialView {
  trace: { t: number; v: number }[];      // every frame, t in ms from the trial's start
  held: [number, number];                  // tUp, tDown
  levels: [number, number];                // the two dashed levels
  numbers: number[];                       // Held, At rest (and Past, 0 to 1, for a channel)
  bad: boolean[];                          // which numbers are in the warning colour
  misfires: number[];                      // with strength shown: the t of each misfire
}
export function trialView(trial: Trial, index: number, all: Trial[], g: Gesture, shown: 'strength' | number): TrialView;

/** Which trials the fires-while-resting flag is to blame on, as the details' line says it. */
export function blameLine(g: Gesture, trials: Trial[]): string | undefined;
```

- `trialView` follows the spec's "The trials". A trial's held strength is `fit.peaks` for enabled
  trials; for a disabled one, its median held strength against the fit itself.
- Tests (`_dialog-model.test.ts`): the order; each status; a trial's numbers and bad flags with
  strength, a channel and a limit shown, on frames from `_test-frames.ts`; misfire times; the blame
  line for one trial and for two.

## Stage 5: the list

Rewrite the list part of `dialog.ts` (`renderRows` and around it):

- The preview: video, button, and **Gesture hold** beside them (label, value, slider under them).
  No page number, and `turn` only pulses the button.
- Rows as the spec's "The list", in `listOrder`. The pencil asks for the name over the dialog, as
  Add gesture… does (an inline field in the row, OK and Cancel); `askText` closes the dialog, so
  don't use it.
- New `_meter.ts`: `strengthMeter(o: { tall: boolean; on: number; release: number; ticks?: {...};
  drag(on: number): void }): { el: HTMLElement; show(strength: number): void; levels(on: number,
  release: number): void }`. Pointer events on the whole meter move On (`setPointerCapture`); the
  handle is `role="slider"` with arrow keys. The list's is 8 px tall with a 14 px handle; the
  details' 24 px with tags.
- Record from a row still runs the old round (`_round.ts`) until stage 8.
- A row's › and a tap on it open the details (stage 6; until then, nothing).

## Stage 6: the details

Rewrite `_details.ts`: `openDetails(host: DetailsHost, g: Gesture)`, where `DetailsHost` gives it
the settings, `change(id, f)`, `commit`, the frame listeners, the preview's elements and `back()`.
The dialog swaps its content between the list and the details.

- Header, preview, the what-is-wrong box (with `blameLine`), On level (`strengthMeter`, tall, with
  ticks) with Reset (`withoutOn`), Channels with Reset (drops `channels`, fits again), the rows
  (`_channel-row.ts`), Add channel… (a menu over the dialog, from `candidates`), and the foot row.
- `_channel-row.ts`: `channelRow(o: { row?: Row; limit?: Limit; forcedOff: boolean;
  limitForcedOff: boolean; ... callbacks }): { el: HTMLElement; show(x: Float32Array | null): void }`.
  Draw the lanes as the spec says; the pennant, bracket and tick come after the dots in the DOM, or
  have a higher `z-index`, so they are drawn over them. A drag scores the meters with
  `withThreshold` until let go, then changes `channels.thresholds` and fits again.
- Fitting again (switch, chip, threshold, Add channel, Reset): load the trials, `buildFit(trials,
  g.channels)`, `withFit`, `settled(..., g.id)`, commit, re-render the details, as the dialog does
  after a round now. It runs through the dialog's `later` queue.
- The Delete N disabled trials… button appears with the trials panel (stage 7).

## Stage 7: the trials

New `_trials.ts`: `trialsPanel(o: { g: Gesture; trials: Trial[]; disable(index: number, disabled:
boolean): void }): HTMLElement`.

- The Show chips, the scrolling box (sticky header), rows from `trialView`, latest first. Traces are
  SVG polylines in a `viewBox` of the trial's length by 1, `preserveAspectRatio="none"`, with
  `vector-effect: non-scaling-stroke`; the held part a rect, the levels dashed lines, misfires short
  lines at the bottom.
- A switch calls `setTrialDisabled`, then fits again (as in stage 6).
- **Delete N disabled trials…** asks first, then `deleteDisabledTrials` and fits again.

## Stage 8: recording

- `store.ts`: `RecordingPage = { scoreId: string; page: number } | { empty: true }`,
  `loadRecordingPage(): Promise<RecordingPage | undefined>`, `saveRecordingPage(p: RecordingPage)`;
  key `keys.faceRecordingPage = 'face-recording-page'` in `storage/keys.ts`, with its comment, and a
  line in `STORAGE.md` beside the face keys.
- New `_play-from.ts`: `playFrom(name: string, start: (page: PagePicture) => void)`, over the
  dialog (`showOnTop`). The list of scores comes from `libraryFiles` (`originals/library-files.ts`),
  its first batch, as `Library.currentFiles` does (`library/library.ts:180`), by `titleOf(path)`.
  A score is opened with `openScore` (`dialogs/open-score.ts`); its pages' thumbnails come from its
  `pages(page, width)` (the last canvas each gives), one per page of its original (`aspects`), and it
  is closed when the picking is done. `PagePicture` is the picked page drawn to fit the screen, a
  canvas; for empty staves, a canvas the app draws (five-line staves, evenly spaced, on white).
- New `_recording-screen.ts`, replacing `_round.ts`: `recordUntilTapped(o: { name: string; page:
  PagePicture; frames: Set<FrameListener>; done(trials: Trial[], problem?: string): void }): { stop():
  void }`. A full-screen overlay with the page and the bar the spec describes; trials one after
  another (the timing, tones and instructions are `_round.ts`'s, moved); a `pointerdown` anywhere
  stops. `ROUND` goes from `_recording.ts`.
- `dialog.ts`: Record, on a row or in the details, opens Play from, then the recording screen;
  `done` does what a round's end does now (save the trials, fit again with the gesture's channels,
  settle, re-render). Closing the dialog stops a recording first.
- Tests: none new in Node (the screen is DOM). Keep `_recording.test.ts` passing.

## Stage 9: the docs

- Fold `face-dialog-spec.md` into `face-gestures-spec.md` (its sections "The gestures", "The
  settings" becoming "The dialog", "Recording", "What is stored") and `face-classifier-spec.md`
  ("The template": forced channels and thresholds; limits for caps; "The levels": Release from On;
  strength for score). Use this spec's words.
- Delete `face-dialog-spec.md`, this plan, and `docs/face-gestures-ui-proposal.html`.
- `TODO.manual.md`: a group **Face gestures dialog, redesigned** with the checks below.

## Manual checks (on the tablet, with the camera and the sound on)

- After updating: every gesture is kept, with its trials; Gesture hold shows 500 ms; each fitted
  gesture's On is the fitted one, and Release is halfway between rest and On.
- The list: fitted gestures first; one with two trials shows only its name, pencil, Record and
  "Record 1 more trial", and tapping it opens nothing. Rename one with the pencil.
- Drag On on a list row's meter: its dashed Release follows; open its details: On is where it was
  left, and Reset beside On level puts it back.
- In the details, wink: the right eye's dot passes the pennant and fills; blink: the left eye's
  ring passes the bracket and turns orange, and the strength stays low.
- Tap `eyeBlinkLeft`'s chip: it greys and strikes through; blink: the strength now rises. Tap it
  again. Switch `eyeBlinkRight`'s row off: the whole row greys, pennant and bracket in place.
- Drag a pennant: the meter and the ring follow at once; let go: the gesture is fitted again, On
  goes back to the fitted one, and Reset shows beside Channels; Reset puts it all back.
- Add channel…: the list is by separation, those that don't move greyed at the end; add one: it
  shows as a row.
- Trials: the latest first, all of them scrolling; Show a channel: the traces and numbers change.
  Disable a trial: it fades, the gesture is fitted again, and "Delete 1 disabled trial…" shows;
  delete it, asked first.
- A trial done badly at rest shows red ticks under its trace, and the what-is-wrong box names it.
- Record: Play from asks for a page the first time; pick a score and a page. The screen shows it
  still, with the instruction at the top; record three trials and tap: the dialog comes back with
  three more trials. Record again: Play from offers the same page; Start goes straight to it.
- With the library empty, Change… offers only Empty staves.
- In the reader, turn pages with each gesture: each turns after about half a second's hold.

## Decisions made in writing this, to overrule

1. The renames retire `score(`, `signal`, `cap` and `capped` in `src/face/` only; `clear` is renamed
   but not retired (it is also `Set.clear` and `clearTimeout`).
2. Old stored fits are parsed as version-only, so every gesture is fitted again on first load; this
   drops hand-set On levels.
3. Rename asks inline in the row, as Add gesture… does, not with `askText`.
4. Done in the details closes the dialog, as on the list.
5. A disabled trial's held strength in the trials panel is against the fit itself (it isn't in the
   fit to be left out of).
6. The page to play from is an original's page (as the excerpt picker shows them), not a frame of
   the reader.
7. Empty staves is drawn by the app, not stored.
