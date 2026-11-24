# Page turning: plan

How to get to what `page-turning-spec.md` describes. Read the spec first; where the two disagree,
the spec wins. Each stage is one commit, or a few, and every commit leaves `npm test` and
`npm run build` passing. Before each push, also try the stage in the running app (`npm run dev`)
with the checks it lists. Commit and push each stage before starting the next.

**This plan starts after `reader-split-plan.md` is done.** It names the reader's parts from that
plan: `Pager` (`reader/_pager.ts`), `Screen` (`reader/_screen.ts`), `StageZoom`, and the pure
`reader/_landing.ts`. Find methods by name; line numbers drift.

The tests run in Node, without a DOM. Logic worth testing goes in pure functions (`render/strip.ts`,
`reader/_turning.ts`, `reader/_landing.ts`, `settings/turning.ts`), and the tests call those.

Code style: match what is there. Each new module starts with a comment saying what belongs in it.
Comments say what something is or why, in the same tone as the code around them.

## How it fits together

- `settings/turning.ts` holds the two device settings, Advance and the smallest scale, in memory,
  with getters; `settings/store.ts` loads them at start-up and saves them.
- `render/strip.ts` is the maths: each frame's fitted size, the strip, the screen starting at a
  frame (its whole frames, its part, where each goes on the stage), the list of screens for an
  Advance, and where landing on a frame goes. It replaces `framesOnScreen`, `screenAt` and
  `placeScreen`'s use for the reader.
- The `Pager` keeps `frame`, the first frame of the screen shown, as now. It is always the start of
  a screen in the list: every place that sets it goes through `landingIndex`. Turning moves along
  the list.
- The `Screen` shows the screen starting at `frame` from `stripScreen`: a slot for each whole frame
  and one for the part, placed where the strip says. A turn slides from the old slots to the new.

## Stage 1: the settings

A new module, `src/settings/turning.ts`:

```ts
// How the reader lays out and turns pages on this device: whether a turn advances a page or a
// screen, and how far a page may shrink to fit more on a screen. Held in memory, loaded at start-up
// (settings/store.ts). Pure: no storage.

export type Advance = 'page' | 'screen';

/** Advance from what is stored: 'page' or 'screen'; anything else is 'page'. */
export function advanceFrom(raw: unknown): Advance;
/** The smallest scale, in percent, from what is stored: a whole multiple of 5 from 10 to 100; anything else is 90. */
export function smallestScaleFrom(raw: unknown): number;

export function advance(): Advance;
export function setAdvance(a: Advance): void;
/** The smallest scale as a fraction, 0.1 to 1. */
export function smallestScale(): number;
/** The smallest scale in percent, as the dialog shows it. */
export function smallestScalePercent(): number;
export function setSmallestScalePercent(p: number): void;
```

The values start at `'page'` and `90`, as `markings/placed.ts` holds the marking colours.

`src/settings/store.ts`:

```ts
// The reader's device settings in the kv store (settings/turning.ts holds them in memory).

/** Load Advance and the smallest scale; what isn't stored keeps its default. */
export async function loadTurningSettings(): Promise<void>;
export async function saveAdvance(a: Advance): Promise<void>;
export async function saveSmallestScale(percent: number): Promise<void>;
```

Each save sets the in-memory value too. `storage/keys.ts` gets two keys, after `toolSettings`:

```ts
/** Whether a turn advances a page or a screen, 'page' | 'screen'; the device's own (settings/store.ts). */
advance: 'advance',
/** How far a page may shrink to fit more on a screen, in percent, 10 to 100; the device's own (settings/store.ts). */
smallestPageScale: 'smallest-page-scale',
```

`main.ts` calls `loadTurningSettings()` beside `loadMarkingColors()`, with the same `failedOnce`.

`STORAGE.md`: two rows in "Every key", and a section for the two after `placed-mark-colors`, in
its style: what each holds, that missing is the default (Page; 90), and that both are the device's
own, never synced.

Tests, `src/settings/turning.test.ts`:

- `advanceFrom`: `'page'` and `'screen'` come through; `undefined`, `'Page'`, `2` give `'page'`.
- `smallestScaleFrom`: `10`, `55`, `100` come through; `5`, `105`, `92`, `'90'`, `undefined`, `NaN`
  give `90`.
- `setSmallestScalePercent(60)` then `smallestScale()` is `0.6`.

No change in the app. Check: the app starts; DevTools shows no new keys yet.

## Stage 2: the strip, pure

A new module, `src/render/strip.ts`:

```ts
// An item's frames laid end to end as a strip, each at its fitted size, and the screens onto it:
// which frames a screen starting at a frame shows whole, the part after them, where each goes on
// the stage, the list of screens for an Advance, and where landing on a frame goes. Pure maths: the
// reader puts boxes where this says (reader/_screen.ts).

import type { Frame } from '../scores/frames';
import type { Advance } from '../settings/turning';
import type { ScreenBox } from './screen';

/** A frame on the strip, in device pixels: where it starts along, its length along, its size across and where it sits across. */
export interface StripFrame { at: number; len: number; size: number; off: number }

export interface Strip {
  /** 'x' on a landscape stage (wider than tall), 'y' on a portrait one. */
  along: 'x' | 'y';
  /** The stage's length along, in device pixels. */
  length: number;
  scale: number;
  frames: StripFrame[];
  /** When every frame fits on the stage at once: where the strip starts along, centred. Else null. */
  centred: number | null;
}

/**
 * A frame's fitted size on a W × H stage (device pixels), `aspect` its height over width: its full
 * size (as large as fits the stage), shrunk to the largest share 1/n of the stage along (gaps
 * included) it can reach without going below `smallest` of its full size; never larger than full.
 */
export function _fitted(aspect: number, W: number, H: number, gap: number, smallest: number): { w: number; h: number };

/** The strip of frames of these aspects on a W × H stage (CSS pixels) at `scale` device pixels per CSS pixel. */
export function layStrip(aspects: readonly number[], W: number, H: number, scale: number, smallest: number): Strip;

/** A screen: its first frame, the frames whole on it, the part after them, and where each goes. */
export interface StripScreen {
  first: number;
  /** Frame indices whole on the screen, in order. */
  whole: number[];
  /** The frame after them, partly on the screen; undefined when none is. */
  part?: number;
  /** Where each of `whole`, then `part`, goes on the stage, as placeScreen gives (the part runs past the stage's edge). */
  boxes: ScreenBox[];
  /** Past the item's last frame, the empty stretch along, in CSS pixels from the stage's start; null when there is none. */
  empty: { at: number; len: number } | null;
}

/** The screen starting at frame `first`. */
export function stripScreen(s: Strip, first: number): StripScreen;

/** The first frame of each screen in the list, in order (spec, "The list of screens"). */
export function screenStarts(s: Strip, advance: Advance): number[];

/** Where landing on `frame` goes: the index in `starts` of the screen starting there, else of the last one starting before it (0 when none does). */
export function landingIndex(starts: readonly number[], frame: number): number;

/** How far the strip moves, in CSS pixels along, from the screen starting at frame `a` to the one at `b`. */
export function stripDistance(s: Strip, a: number, b: number): number;

/** Each page the frames are cut from, with the widths (CSS pixels) it is drawn at: every frame at its fitted width. */
export function stripPageWidths(frames: readonly Frame[], W: number, H: number, scale: number, smallest: number): Map<number, Set<number>>;
```

How to work them out (all in device pixels: `Wd = Math.round(W * scale)`, `Hd`, `gap =
Math.round(GAP * scale)` with `GAP` exported from `render/screen.ts`):

- `_fitted`: full size as `_placeFrames` sizes a frame alone (round from the limiting side, floor with
  the same `1e-6`). `L` is `W` on a landscape stage, else `H`; `f` the full size along. `n =
  Math.floor((L + gap) / (f * smallest + gap) + 1e-6)`. When `n >= 2`, `share = Math.floor((L -
  gap * (n - 1)) / n)`; when `share < f`, the frame's length along becomes `share` and its size
  across follows from its aspect (floored). Otherwise the full size.
- `layStrip`: each frame's fitted size; `at` from 0, each frame's `len` plus `gap` after it; `off`
  centres it across (`Math.floor((across - size) / 2)`). `centred` is
  `Math.floor((length - total) / 2)` when the total (lengths and gaps) is at most `length`, else
  `null`.
- `stripScreen`: the window is `[at(first), at(first) + length]`. A frame is whole when
  `at + len <= at(first) + length`; the first frame not whole, if it starts before the window's
  end, is the part. Each box's position along is `(centred ?? 0) + at(j) - at(first)`, across its
  `off`; `x, y, w, h` in CSS pixels (divide by `scale`), `fw, fh` the device sizes. `empty` is the
  stretch from the end of the item's last frame (plus `gap`) to the window's end, when the last
  frame is whole on this screen and that stretch is longer than `gap`.
- `screenStarts`: with `centred` not null, `[0]`. Page: 0, 1, 2, … up to and including the first
  start on which the last frame is whole. Screen: from 0, each next start is the screen's `part`
  (or the frame after its last whole one), until a screen holds the last frame whole.
- `landingIndex`: as its comment says; frames are never below 0.
- `stripPageWidths`: for every frame, its fitted width in CSS pixels (`w / scale`) for each page it
  is cut from, gathered into sets as `readPageWidths` does.

Tests, `src/render/strip.test.ts`. Use `A4` from `scores/model.ts` for portrait frames and `1 / A4`
for landscape, `scale` 1, and these stages: 1280 × 800 (16:10), 1024 × 768 (4:3), 800 × 1280.

- `_fitted`, at 0.9: a portrait frame on 1280 × 800 is 565 × 800 (it fits in half already); on
  1024 × 768 it is 509 wide (shrunk about 6% to fill half exactly); a landscape frame on 1280 × 800
  is 1131 × 800; at 1 nothing shrinks (543 wide on 1024 × 768); at 0.6 a portrait frame on
  1280 × 800 is 422 wide (a third).
- `layStrip`: frames don't overlap and are `gap` apart; a portrait stage gives `along: 'y'`; two
  portrait frames on 1280 × 800 are `centred`, ten are not.
- `stripScreen` on the spec's example (P1–P5, L6, P7, L8, P9, P10) at 1280 × 800, 0.9: from P1, whole
  P1 P2 and part P3; from P5, whole P5 and part L6; from L6, whole L6 and part P7; from P9, whole
  P9 P10, no part, and `empty` when there is room past P10. The part's box runs past 1280.
- `screenStarts`, same frames: Screen gives `[0, 2, 4, 5, 6, 7, 8]`; Page gives
  `[0, 1, 2, 3, 4, 5, 6, 7, 8]`. On 1024 × 768, Screen with ten portrait frames gives
  `[0, 2, 4, 6, 8]` (two fit exactly, no part). One frame gives `[0]`; two portrait frames on
  1280 × 800 give `[0]` (centred).
- At 0.6 on 1280 × 800, ten portrait frames: Screen gives `[0, 3, 6, 9]`; the last screen's `empty`
  is not null.
- `landingIndex([0, 2, 4, 5], f)`: 2 → 1; 3 → 1; 5 → 3; 9 → 3; 0 → 0.
- `stripDistance`: from 0 to 2 is P1's and P2's lengths and two gaps, in CSS pixels.
- `stripPageWidths`: every page of every frame, each at one width per frame size.

No change in the app.

## Stage 3: the reader on the list

Everything that decides where a screen starts or what is on it goes through the strip. Advance
comes from `advance()`, the smallest scale from `smallestScale()`; the settings can't be changed
yet, so the reader reads Page and 90%.

`reader/_turning.ts`: `Place` becomes `{ k: number; items: number; screen: number; screens: number }`
(the index in the list, and the list's length). `Turn`'s `{ to: 'frame'; frame }` becomes
`{ to: 'screen'; screen: number }`. `turnFrom`: `screen + dir` when it is within `0 … screens - 1`;
otherwise as now (`score`, `item`, `none`). Update `_turning.test.ts`: the same cases, by screen index
(forward from 0 of 3 is 1; back from 0 in a score is `score`, −1; and so on).

`reader/_landing.ts`: `lastScreenStart` goes, with its tests. `afterEdit` takes `last: number` (the
index of the last frame on the screen, whole or part) in place of `shown`, and a focus on a frame
from `frame` to `last` is on the screen. Its `show` answer's `frame` is any frame: the `Pager`
lands it. Update its tests.

`Pager`:

- A method `strip(frames = this.frames): Strip`: `layStrip(frames.map((f) => f.aspect),
  stage.clientWidth, stage.clientHeight, dpr(), smallestScale())`, and `starts(frames?)`:
  `screenStarts(this.strip(frames), advance())`.
- `land()`: sets `frame` to `starts[landingIndex(starts, frame)]`. The `Screen`'s host's
  `setFrame` (the clamp at the top of `show`) calls it, so every show lands: after a jump, an edit,
  a resize or a change of setting.
- `goTo`'s `'last'` is the list's last start. `lastScreen` goes.
- `turn`: the `Place` from `starts().indexOf(frame)` and the list's length; on `screen`, set
  `frame = starts[t.screen]` and `screen.show({ turned: true, slide: dir })` (the slide is stage 5;
  until then `show` ignores it).
- `relayout`: passes the screen's last frame (from the `Screen`, below) to `afterEdit`.

`Screen`:

- `FrameSlot` (`reader/_slots.ts`) gets `part?: boolean`.
- `show` works out `const sc = stripScreen(host.strip(), host.frame())` in place of `screenAt`. The
  frames drawn are `sc.whole` and `sc.part`; `placeSlots` takes the boxes from `sc.boxes` in place
  of placing them itself (give it a `boxes: ScreenBox[]` parameter and drop `W`, `H`, `scale`,
  `after`; the part's slot has `part: true`). `pageWidths` takes the boxes' widths, as now.
- In a setlist, when `sc.empty` is not null, the blank (`blankBox` with the next title) is a box at
  `sc.empty`, as long as the last frame and its size across, placed like the frames.
- A getter `last` (the last frame on the screen, whole or part) for the `Pager`. `shown` goes.
- The page info counts whole frames only: `Page n of N`, or `Pages n–m of N`.
- The cut editor decorates the whole frames only: `decorate` is given the slots without `part`.
  Tools work on the part as on any slot.
- `predraw` draws the screens before and after in the list (the `Pager` gives their starts through
  the host: `neighbours(): number[]`), each frame at its fitted width; in a setlist, the next
  item's first screen from its own strip.
- `showUnread`: the unread box is laid as one A4 frame alone, centred (`layStrip([A4], …)` and
  `stripScreen(…, 0)`), with no blank beside it.

`styles/reader.css`: `.screen` gets `overflow: hidden`, so a part stays cut at the stage's edge when
the zoom shrinks the screen below the toolbar.

`render/screen.ts`: `screenAt` and `readPageWidths` go; `offlinePageWidths` takes `smallest` and
gathers `stripPageWidths` for `W × H` and `H × W`. `offline/pages.ts` passes `smallestScale()`.
`render/layout.ts`: `framesOnScreen` and `_sideBySide` go when nothing uses them; `placeScreen`
stays only if something still does. Update `screen.test.ts` and `layout.test.ts` to what is left.

Check in the app (Chrome's device mode at 1280 × 800 with touch, and at 1024 × 768):

- Open a score of portrait pages: two and a sliver of the third show, the first flush left. Turn:
  one page along (Page is the default). Back: the screen before, exactly.
- A score with a landscape page among portrait ones: the portrait page before it shows with part
  of it; the next screen is the landscape page with a sliver of the next.
- At 1024 × 768 two portrait pages fill the width exactly, a little smaller than before.
- A two-page score is centred, on one screen.
- Rotate to portrait: landscape pages stack two to a screen, top first; the first page shown stays.
- In a setlist, the last screen of an entry has the next title in its empty part; turn on into the
  next entry and back.
- Cut a frame in two on the screen; remove a cut on an earlier screen: the reader lands sensibly.
- Pinch out with the toolbar showing: the part stays cut at the stage's edge.
- Pages kept offline (a setlist's status) still say they are saved after the job runs again.

## Stage 4: the setting's controls

**The toolbar button.** In `reader/_toolbar.ts`:

- `ToolbarActions` gets `advance(): void` ("Switch between advancing a page and a screen").
  `ToolbarView` gets `advance: Advance`.
- A button made beside Cuts, as Cuts is (`this.button('advance', '', act.advance, 'advance-button')`,
  an icon and a `label` span), in the same group, after Cuts and before its rule. Its icon is a new
  path constant `PAGES` (two pages side by side with an arrow from the left one to the right one),
  drawn as `SCISSORS` is.
- `sync` sets its label to `Page` or `Screen` and its `title` and `aria-label` to "Advance a page"
  or "Advance a screen". It is not in the list of buttons disabled when the score isn't open.
- `styles/reader.css`: `.bar .advance-button` as `.bar .cuts-button`; its label hides below 680 px
  as Cuts' does.

In `reader.ts`, `advance` does: `void saveAdvance(advance() === 'page' ? 'screen' : 'page')` (with
`failedOnce('save how pages advance', e)`), then `this.syncBar()` and `this.screen.show()`: the
reader lands on the first frame it was showing.

**The dialog.** A new module, `src/library/_page-scale.ts`, as `_marking-colors.ts` is:

```ts
// The Page scale dialog, from the library's ⋯ menu: how far a page may shrink to fit more on a
// screen.

export function openPageScale(): void;
```

`showDialog('Page scale')`; a row with an `input type="range"` (`min` 10, `max` 100, `step` 5,
value `smallestScalePercent()`, `aria-label` "Smallest page scale") and the value beside it
(`90%`); the hint "Pages may shrink to fit more on a screen, down to 90% of their full size." with
the number following the slider; Done. Each `input` event saves through `saveSmallestScale`, with
`failedOnce('save the page scale', e)`. `library/_folder-banner.ts` adds
`{ label: 'Page scale…', run: openPageScale }` after Face gestures…. Style the row as
`.marking-colors-row` is, in the library's CSS beside it.

The offline job works out widths from the smallest scale: after a save, ask the library to run it
again, as a setlist change does (find where `pinSetlistPages` is called on a change, and call it
there from the dialog through the library).

Check in the app: the button shows Page; tap it: Screen, and the screen lands where it was; turn
by screens; tap again. Reload: it is kept. In the library, ⋯ → Page scale…: the slider at 90%;
set 60% and open a portrait score at 1280 × 800: three pages a screen. Set 100% at 1024 × 768: two
pages no longer fit, one and a part do. DevTools shows `advance` and `smallest-page-scale`.

## Stage 5: the slide

In `Screen.show`, an option `slide?: 1 | -1`, given only by `Pager.turn` for a turn within an item.

- Before the new slots replace the old in `screenEl`, keep the old boxes (slots and the blank) and
  the old first frame.
- When `slide` is given, there were old boxes, and `matchMedia('(prefers-reduced-motion: reduce)')`
  doesn't match: append the new boxes after the old ones (so they are on top), and animate with
  `Element.animate` for `quick()` ms, with `ease-out`: each old box from no shift to `-d` along, each
  new box from `+d` to none, where `d = stripDistance(strip, oldFirst, newFirst)` and the shift is
  `translateX` on a landscape stage, `translateY` on a portrait one. When they finish, remove the
  old boxes.
- `quick()` reads `--quick` from `getComputedStyle(document.documentElement)` as milliseconds
  (`parseFloat`), falling back to 160.
- Any `show` that starts while a slide runs first finishes it at once: cancel the animations and
  remove the old boxes. `stop()` does the same.
- Otherwise, as now: the old boxes are replaced at once.

Everything else in `show` (placing fresh, the cut editor, the chrome, the page info, the score
card, saving the place, drawing ahead) runs as now, without waiting for the slide.

Check in the app: turn forward and back with Page and with Screen: the strip slides by a page or a
screen, and back slides the other way; at the landscape page, the rest of it slides in at the
same size. Turn quickly three times: no stray pages stay behind. With the OS's reduce motion on
(DevTools → Rendering → prefers-reduced-motion), turns are instant. Jumps (the title menu, the
Advance button, rotating) don't slide. Turn with the toolbar showing and zoomed out: the slide stays
inside the screen.

## Stage 6: the docs and the lists

- `ARCHITECTURE.md`, "Words": **strip**, **screen** (the stretch of the strip that fills the stage,
  from its first frame), **whole**, **part**, **fitted size**, **smallest scale** and **Advance**, in
  its style. Where it describes the reader's screens or turning, say it as the spec does.
- `TODO.md`: remove "Turning back so forward restores the screen", "Page-turn strategies" and
  "Square frames". Add, in "Confirmed features which require more thought": "**Half turns on
  screens of one:** for a frame that fills the screen alone, turning it by half a frame: the top
  half of the next page over the bottom half of this one. A choice of its own, separate from
  Advance."
- `TODO.manual.md`: a group "**Turning by the strip** (a tablet in both orientations, and Chrome's
  device mode at 1024 × 768)" with the checks below.

## Stage 7: the slide time, and the Page turning dialog

The slide at `--quick` (160 ms) was too quick to see on the tablet. The slide time becomes a
setting, and the Page scale dialog becomes **Page turning…**, holding it beside the smallest scale.

**The setting.** In `settings/turning.ts` (its opening comment adds "and how long a turn slides"):

```ts
/** The slide time, in ms, from what is stored: a whole multiple of 50 from 0 to 1,000; anything else is 300. */
export function slideMsFrom(raw: unknown): number;
/** How long a turn slides, in ms; 0 is no slide. */
export const slideMs = (): number => ms;
export function setSlideMs(m: number): void { ms = slideMsFrom(m); }
```

with `let ms = 300;` beside `percent`. In `settings/store.ts`, `loadTurningSettings` also loads
`keys.slideMs` through `slideMsFrom`, and:

```ts
export async function saveSlideMs(ms: number): Promise<void>;
```

as `saveSmallestScale` is. `storage/keys.ts`: `slideMs: 'slide-ms'`, with a comment as its
neighbours have. `STORAGE.md`: a row for `slide-ms` beside `smallest-page-scale`, and its section
("### `advance`, `smallest-page-scale` and `slide-ms`") says it is a whole number of ms, 0 to 1,000
in steps of 50, 300 without it, per device, never synced.

Tests (`settings/turning.test.ts`, beside `smallestScaleFrom`'s): `slideMsFrom` keeps 0, 50, 300
and 1000; gives 300 for undefined, null, -50, 1050, 125, 300.5 and '300'.

**The slide.** In `reader/_screen.ts` `put`: the duration is `slideMs()`, and the slide is skipped
also when `slideMs() === 0`. Its doc comment says "over the slide time" in place of "over
`--quick`". `--quick` stays in `base.css` for everything else that uses it.

**The dialog.** `git mv src/library/_page-scale.ts src/library/_page-turning.ts`. Its opening
comment: "The Page turning dialog, from the library's ⋯ menu: how far a page may shrink to fit
more on a screen, and how long a turn slides." `openPageScale` becomes
`openPageTurning(changed: () => void)`, with `showDialog('Page turning')`. Two rows, each a label,
a range input and its value, each followed by its hint (lay the label out as the other dialogs
label their rows, e.g. `_face-gestures.ts`):

- **Smallest page scale**: as now.
- **Slide**: `min` 0, `max` 1000, `step` 50, value `slideMs()`, `aria-label` "Slide time". The
  value reads `300 ms`, or `Off` at 0. The hint: "A turn slides the pages along over 300 ms." with
  the number following the slider, or "Turns show the next pages at once." at 0. When
  `matchMedia('(prefers-reduced-motion: reduce)')` matches, the hint is "This device asks for
  reduced motion, so turns don't slide." whatever the slider says. Each `input` saves through
  `saveSlideMs`, with `failedOnce('save the slide time', e)`. It doesn't call `changed`: nothing
  kept offline depends on it.

Then Done. Rename the row class `page-scale-row` to `page-turning-row`, in the module and in
`styles/library.css`. `library/_folder-banner.ts`: `{ label: 'Page turning…', run: () =>
openPageTurning(() => lib.pin()) }` in place of Page scale…. Anywhere else the app or the docs
(`TODO.manual.md`, `ARCHITECTURE.md`) say "Page scale" for the dialog, say "Page turning".

`TODO.manual.md`, in "Turning by the strip": "Library ⋯ → Page turning…: the slide at 300 ms; a
turn visibly slides. Set it to Off: turns are instant. 1,000 ms: a slow slide. With the device's
reduce motion on, the hint says turns don't slide, and they don't."

Check in the app: ⋯ → Page turning… shows both sliders, at 90% and 300 ms. Turn: the slide is
visible. Off: instant. Reload: kept. DevTools shows `slide-ms`.

## Stage 8: no more shares than the item has frames

A two-page score of narrow pages shrank both to a third of the stage, leaving a third empty. A
frame now shrinks to no smaller share than 1/(the item's number of frames).

- `render/strip.ts`: `_fitted` gets a last parameter, `count: number` (the item's number of
  frames), and takes `n = Math.min(n, count)` before `if (n < 2)`. Its doc comment says so.
  `layStrip` passes `aspects.length`. Nothing else changes: the pager, `showUnread` (one frame,
  so full size) and the offline widths (`offline/pages.ts` lays each entry's frames on their own)
  all go through `layStrip`.
- Tests in `render/strip.test.ts`: the existing `_fitted` calls pass a large count (e.g. 10) and
  keep their results. New: a narrow portrait aspect (1.75) at 1280 × 800, 0.9: with count 10 it
  takes a third (w ≤ ⌊(1280 − 12) / 3⌋); with count 2 it is at full size (h 800); with count 1 at
  full size. `layStrip([N, N], 1280, 800, 1, 0.9)` (N = 1.75) has both frames 800 high, and is
  centred; `layStrip(Array(5).fill(N), …)` keeps them at a third.
- `TODO.manual.md`, "Turning by the strip": "A two-page score of narrow pages, landscape: both
  pages at the screen's full height, centred."

Check in the app: a two-page score that showed small in landscape shows both pages at full height.

## Manual checks for the whole

1. A score of portrait pages, the tablet landscape: two pages and a sliver of the third, the first
   flush left. The toolbar's Advance shows Page. Turn: one page along, sliding. Back: exactly the
   screen before.
2. Tap Advance: Screen. The same pages show. Turn: two pages along. Back, forward, back: always the
   same screens.
3. A score with a landscape page after an odd number of portrait ones: the last portrait page shows
   with part of the landscape page; the next screen is the landscape page whole, at the same
   height, with a sliver of the page after.
4. A two-page score: centred, one screen; turning goes to the next score (offered first) as now.
5. Rotate to portrait: landscape pages stack, top first; the page at the top is the first page shown
   before. Rotate back.
6. A setlist: the last screen of an entry shows the next title in its empty part; turn on, and back
   into the entry's last screen.
7. Library ⋯ → Page turning…: 60%: three portrait pages a screen; 100% on a 4:3 tablet: one page and
   a part; 90% again.
8. Close and open the app: Advance and the page scale are kept.
9. Edit cuts on the screen: the cut tabs show on whole pages, not on the part; a cut made keeps the
   reader near it.
10. Turn quickly, and with a pedal or a face gesture: every turn slides, none leaves pages behind.
11. With reduce motion on, turns are instant, and Page turning… says so. With the slide Off, too.
12. Offline: a setlist's pages are all saved again after changing the page scale.

## Decisions not discussed

- The settings live in a new `settings/` module (in memory, loaded at start-up), like the marking
  colours, so the offline job can read the smallest scale outside the reader.
- The part takes ink and the tools like any slot, but the cut editor's tabs show only on whole
  frames, as the part's would be cut off.
- The unread screen ("Missing", "Needs access") is one A4 box, centred, with no blank beside it.
- The slide moves the boxes themselves with `Element.animate`, inside the zoomed screen, so the
  zoom and the slide don't fight.
- Changing the page scale reruns the offline job, as its widths depend on it.
- The slide time is per device, beside Advance and the smallest scale; changing it does not
  rerun the offline job.
