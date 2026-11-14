# Face gestures: turning without Release, the plan

How to get to `face-turning-spec.md`. Where this plan and the spec disagree, the spec wins.

Run `npm test` and `npm run build` before each commit; each stage is one commit (or a few), each
leaving both passing. Match the style of `src/face/`: a comment on every exported thing, short
sentences, British prose and American identifiers, and keep to the vocabulary test
(`src/vocabulary.test.ts`).

## Stage 1: the zero point

The zero point comes into the levels; Release stays for now, so nothing else changes yet.

- `src/face/_fit.ts`:
  - `Fit` gains `restMax?: number`: the largest `strength(template, x)` over every enabled trial's
    rest frames. Work it out in `buildFit` beside `rest` (line ~61) and return it with `rest` and
    `peaks`.
  - `FIT_VERSION` goes up by one (it is 3 now: make it 4).
- `src/face/gestures.ts`:
  - Add `export const ZERO_CAP_FRAC = 0.5;` with a comment: the zero point is never more than this
    share of the way from the rest level to On.
  - `levelsOf(g, hold)` also gives `zero: Math.min(fit.restMax ?? rest, rest + ZERO_CAP_FRAC * (o - rest))`.
    It returns undefined, as now, when the gesture isn't fitted; treat a missing `restMax` as `rest`.
  - The stored-settings parser keeps `restMax` like `rest` (a number, else dropped); see how `rest`
    and `peaks` are read (around line 118).
- `STORAGE.md`: add `restMax?: number` to `Fit` (line ~312), "the most strength any rest frame
  reached".
- Tests:
  - `_fit.test.ts`: `restMax` is the largest rest strength, and at least `rest`.
  - `gestures.test.ts`: `levelsOf` gives `zero` as `restMax` when that's under halfway, and halfway
    from `rest` to On when it isn't, following On set by hand; `restMax` survives a store round trip.

## Stage 2: the detector by direction

Rewrite `src/face/_detector.ts` to the spec's Turning, and the ring to its Ring.

- `Active` (`src/face/gestures.ts:75`) gains `zero: number` (from `levelsOf`, through `activeOf`).
  Keep `release` until stage 3.
- `src/face/_detector.ts`:
  - Constants, each with a comment: `FILL_RATE = 1` and `DRAIN_RATE = 2` (how fast the fill moves
    toward and away from turning, per ms of frame time), `MAX_STEP_MS = 200`.
  - State:

    ```ts
    /** A direction's fill (ms, 0 to the hold), and whether it has turned and not yet been let go. */
    interface DirectionState { fill: number; spent: boolean }
    /** The time of the last frame (ms), and each direction's fill. */
    export interface DetectorState { last?: number; next: DirectionState; prev: DirectionState }
    export const NEW_DETECTOR: DetectorState = { next: { fill: 0, spent: false }, prev: { fill: 0, spent: false } };
    ```

  - `Progress` stays `{ near: number; hold: number }`; change its comment: `near` is the faint arc
    (the largest share of the way from a gesture's zero point to its On), `hold` the fill over the hold.
  - `step(s, x, active, now)` keeps its signature and what it returns. On each call:
    1. No face (`x` null): return `NEW_DETECTOR` with `last: now`, no turn, both progresses 0.
    2. `dt = s.last === undefined ? 0 : Math.min(MAX_STEP_MS, now - s.last)`.
    3. For each direction in the order `next`, `prev`: its gestures are those of `active` with that
       direction; with none, it stays as it was and its progress is 0. Otherwise:
       - `on` = some gesture has `strength(g.template, x) >= g.on`;
       - `near` = the largest of each gesture's `near` (below);
       - `hold` = the gestures' `hold` (one for all: take the first's);
       - armed: `fill = on ? fill + FILL_RATE * dt : max(0, fill - DRAIN_RATE * dt)`; if
         `fill >= hold` and nothing has turned this frame: turn this direction, `spent = true`,
         `fill = hold`; if something has turned already, cap the fill at the hold (the step below
         spends it anyway);
       - spent: `fill = on ? min(hold, fill + DRAIN_RATE * dt) : fill - FILL_RATE * dt`; if
         `fill <= 0`: `fill = 0`, `spent = false`;
       - progress: `{ near, hold: fill / hold }`.
    4. If a direction turned, the other becomes `{ fill: <its hold, or 0 with no gestures>, spent: true }`
       and its progress `hold` 1.
    5. Return the new state with `last: now`.
  - A gesture's `near`: `g.on <= g.zero ? (y >= g.on ? 1 : 0) : clamp((y - g.zero) / (g.on - g.zero), 0, 1)`.
  - Update the module's top comment.
- `src/face/face-button.ts:85–91`: the solid arc is drawn from `p.hold` always (drop the
  `p.near >= 1` condition and its comment).
- `src/styles/face.css:16–17`: `.face-faint` 6 px wide, `.face-solid` 2 px wide (both keep the
  accent colour, round ends; faint keeps 35%). Check the solid is drawn after the faint one (it is:
  `face-button.ts` appends faint then solid).
- `src/face/watcher.ts` needs no change (it starts afresh with `NEW_DETECTOR` as now); check
  `tick` still passes `now`.
- Tests: rewrite `src/face/_detector.test.ts` for the new rule. Use `src/face/_test-frames.ts` for
  frames, a 500 ms hold and frames 67 ms apart, and check:
  - a clean hold turns at the first frame at or past 500 ms, once, and not again while held;
  - one frame under On in the middle of a hold delays the turn by about 3 × 67 ms;
  - on three frames in five (a share of 0.6, under two thirds) never turns, however long; on nine
    frames in ten turns, later than 500 ms;
  - after a turn: re-armed after 500 ms let go, not before; a frame back above On while letting go
    delays it by about 3 × 67 ms; then a new hold turns again;
  - two Next gestures, alternating frame by frame, each on half the time: Next turns (they add up);
  - a Next turn spends Back: a Back gesture held through it doesn't turn until let go for the hold
    and held again;
  - both full on one frame: Next turns, Back is spent;
  - a frame with no face: both re-armed at 0, a hold then turns after 500 ms;
  - a gap of 2 s between frames moves the fill by 200 ms only;
  - progress: `near` 0 at the zero point, 0.5 halfway to On, 1 at On; `hold` is fill / hold, and
    stays 1 while spent and held.
  - `face-button` tests, if any check the solid arc's condition: the solid shows with faint not full.

## Stage 3: no Release anywhere

- `src/face/gestures.ts`: remove `RELEASE_FRAC`; `levelsOf` gives `{ on, zero, hold }`; `Active` loses
  `release`. Fix every caller the compiler shows.
- `src/face/_meter.ts`: remove the Release line and tag; `MeterOptions` loses `release`;
  `levels(on: number)`. Update its top comment and the callers in `src/face/_details.ts` (~line 104)
  and `src/face/dialog.ts` (~line 281). Remove the Release styles from `src/styles/face.css` (search
  `.release`).
- `src/face/_dialog-helpers.ts` (`trialView`, ~line 77): the Strength view's levels are
  `[levels.on, levels.zero]`; At rest is bad when `atRest >= rest + ZERO_CAP_FRAC * (on - rest)`,
  using `g.fit.rest`.
- Conflicts, `src/face/_fit.ts`:
  - `Contender` loses `release` and gains `on: number` and `direction: TurnDir`.
  - `firesOn` compares with `j.on`; its comment says On.
  - `conflictOf(a, b)` returns undefined at once when `a.direction === b.direction`; the why says
    `its On is` in place of `its release is`.
  - `src/face/_settling.ts:15` passes `on: l.on` and `direction: g.direction`.
- Tests:
  - `_fit.test.ts`: two gestures of the same direction, one containing the other, don't conflict;
    with different directions they do; a `j` whose median on `i` is between halfway-to-On and On
    doesn't fire on `i`; one at On or over does; the why names On.
  - `_settling.test.ts`: a contained gesture keeps its direction when it shares it, and is set to None
    when it doesn't.
  - `_dialog-helpers.test.ts`: the Strength view's levels and At rest's warning as above.
  - Meter tests, if any, lose Release.

## Stage 4: the docs

Bring the docs up to the spec, in the style they have, then delete `face-turning-spec.md` and this
plan, and fold what they said into:

- `docs/face-classifier-spec.md`: The levels (no Release; the zero point), Turning (by direction,
  the fill), Gestures that conflict (On, different directions only). The table under How the
  constants were chosen measured the old turning: leave it, with one line saying it was measured
  with Release, before turning by direction.
- `docs/face-gestures-spec.md`: How close a gesture is (the ring, lines ~41–53), the On/Release
  bullets and turning paragraph (~118–130), the meter (~174, ~207), the trials' Strength view
  (~263–267).
- `STORAGE.md` (~320): drop "Release is not stored: it is halfway from `rest` to On."
- `TODO.manual.md`: replace the Release checks (~482–494) with the manual checks below.

## Manual checks (in the app, with a face)

- Hold a gesture: the faint arc fills as you go toward it, then the thin solid arc fills, and the
  page turns after the hold. Keep holding: no second turn; the solid arc stays full.
- Let go: the solid arc drains over the hold; hold again before it empties: it fills back up, and
  no turn. Let it empty, hold again: it turns.
- Blink or twitch briefly during a hold: the turn comes a little later, not from the start.
- Two gestures set to Next: either turns the page; switching from one to the other mid-hold keeps
  the fill.
- A Next gesture and a Back gesture at once: only one turn; the other direction needs letting go.
- In the dialog: the meter has no Release line; a trial's Strength trace shows On and the zero point.
- Give two gestures where one contains the other the same direction: both stay; give them
  different directions: the later one is set to None, and its note names On.
