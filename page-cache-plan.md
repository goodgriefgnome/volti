# One page cache for the app: plan

Today each opener of an original makes its own `PageCache` (`originals/original.ts`), which
draws pages, keeps some in memory, schedules drawing, and looks at the saved pictures
(`pictures/pictures.ts`) through a hook the reader sets. This plan replaces that with:

- **`page-cache/`**, a new directory in layer 1, below `originals/`. It holds the one page cache
  for the app: pages drawn in memory under a budget, pages saved in OPFS (the pages setlists play,
  and other pages worth saving), the scheduling of draws, and stand-ins for progressive drawing.
  It knows nothing about files: it is given a `PageSource` to draw from.
- **`originals/`** implements `PageSource` privately, keeps one open source per original id
  (closed 5 s after its last draw), stores page aspects by id, and gives `Original.draw` and
  `Original.drawProgressive`, which go through the cache. `Original.pages()` and `PageCache` go.
- **`pictures/`** keeps only the maker, which tells the cache which pages to keep offline.

Eight steps, one commit each. After every step `npm test` and `npm run build` pass and the app
behaves as before (steps 7 and 8 change what the storage view shows, as described).

## Decisions already made

These were settled in discussion; don't reopen them while implementing.

1. The cache is a single module-level instance. Tests reset it with `resetPageCacheForTests()`.
2. Pages are keyed by `(id, page, pxWidth)`, `pxWidth` in device pixels. Two widths `a` and `b`
   are **equivalent** when `|a − b| ≤ max(4, 0.01 × max(a, b))`. When several held or saved
   pages are equivalent to the one asked for, take the widest (scaling down beats scaling up).
   Pages kept for setlists ("pinned") must match their width **exactly**.
3. Saved pages live under an **epoch**, a number in `page-cache/` bumped when page drawing
   changes noticeably. A new epoch deletes every saved page, pinned ones included. The old
   `page-pictures/` folder is deleted, not migrated.
4. Memory budget: `min(16 screens, max(20 MiB, 5% of device memory, 4 screens))`, where one
   screen is `screen.width × screen.height × devicePixelRatio² × 4` bytes and device memory is
   `navigator.deviceMemory` GB (left out where the browser doesn't give it).
5. Disk budget: 30% of `navigator.storage.estimate().quota`, for pinned and other pages together.
   Pinned pages are never evicted; other pages go least recently used first. Shrinking when the
   origin runs out of quota is a later design (step 8 files it).
6. A page that isn't pinned is written to OPFS only when it is **evicted from memory**, and only
   if `source.size ≥ 4 × estimatedBytes(page)`, where
   `estimatedBytes = pxWidth × round(pxWidth × aspect) × WEBP_BYTES_PER_PIXEL` and
   `WEBP_BYTES_PER_PIXEL = 0.3`. A pinned page is written as soon as it is drawn.
7. One global limit of **2** draws at once. Priorities `now` > `ahead` > `later`; a `later` draw
   also waits while any `now` draw is queued or running.
8. Two requests for the same page (same key and crop) share one draw. The draw is cancelled when
   every requester has aborted; cancelling reaches pdf.js (`RenderTask.cancel()`). Opening a
   source is never cancelled.
9. Failures aren't remembered: each request fails on its own, and nothing failed is stored.
10. Supersampling depends only on the page and `pxWidth` (as `supersample(width, height)` does
    today for the whole page), never on the crop. A crop is exactly the same pixels as the whole
    page drawn at that width, then cut.
11. Evicting a page only drops the cache's reference. **Never** set `width = 0` on a canvas the
    cache has handed out.
12. Stand-ins, for progressive drawing: first, the narrowest page **held in memory** that is
    wider than asked for; failing that, the page of the **closest width**, held or saved. Then
    the exact page. Nothing is drawn just to be a stand-in. No caller moves to
    `drawProgressive` in this plan.
13. Aspects are stored by `originals/`, by id, in the kv store, and never deleted.
14. Export doesn't use the cache. It gets aspects from `Original.aspects()`.
15. A score that can't be read (no access, or no password given) is drawn **by id**: the reader
    calls the cache with no source, so only saved pages can be shown.

## The interfaces

### `page-cache/types.ts`

```ts
/** A part of a page drawn `pxWidth` device pixels wide, in those pixels. */
export interface Crop { x: number; y: number; w: number; h: number }

export type Priority = 'now' | 'ahead' | 'later';

/** What draws an original's pages, for the cache. originals/ makes these; nothing else sees them. */
export interface PageSource {
  /** The bytes that have to be parsed to draw any of its pages: its file's size. */
  readonly size: number;
  /**
   * Draw page `page` (from 1) `pxWidth` device pixels wide, or `crop` of it. Rejects with a
   * DOMException named 'AbortError' once `signal` aborts.
   */
  draw(page: number, pxWidth: number, crop: Crop | undefined, signal: AbortSignal): Promise<HTMLCanvasElement>;
}

export interface DrawRequest {
  /** The original's id. */
  id: string;
  /** Where to draw it from; none when the original can't be read, so only saved pages can be had. */
  source?: PageSource;
  /** From 1. */
  page: number;
  /** The whole page's width, in device pixels. */
  pxWidth: number;
  /** The page's height / width. */
  aspect: number;
  crop?: Crop;
  priority: Priority;
  signal?: AbortSignal;
}

export interface Drawn {
  /** The page, or the crop of it, as drawn at `pxWidth`. */
  canvas: HTMLCanvasElement;
  /** The whole page's width it was drawn at: scale by request.pxWidth / pxWidth to place it. */
  pxWidth: number;
  /** Equivalent to what was asked for (decision 2); false for a stand-in. */
  exact: boolean;
}

/** A page to keep offline, at exactly this width. */
export interface OfflinePage { page: number; pxWidth: number; aspect: number }

export interface OfflineScore {
  id: string;
  /** None when the original can't be read now: its pages missing stay to do. */
  source?: PageSource;
  pages: OfflinePage[];
}

export interface OfflineProgress { done: number; of: number }

/** Thrown when there is no source and nothing held or saved for the request. */
export class NotSaved extends Error { name = 'NotSaved'; }
```

### `page-cache/cache.ts` (public)

```ts
/** The page as asked for: held, saved, or drawn. */
export function drawPage(req: DrawRequest): Promise<Drawn>;

/**
 * Stand-ins already at hand (decision 12), each closer to what was asked for than the last, then
 * the page as asked for. Breaking out of the loop aborts the draw, as `req.signal` does.
 */
export function drawPageProgressive(req: DrawRequest): AsyncIterable<Drawn>;

/**
 * Keep exactly these pages saved (pinned), drawing those not saved yet, two at a time, at
 * `later` priority. Pinned pages not in `scores` become ordinary saved pages. The pinned pages of
 * the ids in `keep` stay as they are (their pages couldn't be worked out). A new call stops the
 * one before; so does `signal`.
 */
export function keepOffline(scores: readonly OfflineScore[], keep: readonly string[], signal?: AbortSignal): AsyncIterable<OfflineProgress>;

/** Whether any page of `id` is saved. */
export function hasSaved(id: string): Promise<boolean>;

/** The room the saved pages take: those kept for setlists, and the rest. */
export function savedBytes(): Promise<{ setlists: number; other: number }>;

/** For tests: forget everything held, queued and known saved, as if the app had just started. */
export function resetPageCacheForTests(): void;
```

### Internal files of `page-cache/`

| File | Holds | Exports (all used only inside `page-cache/`) |
| --- | --- | --- |
| `_match.ts` | **Pure.** Decision 2 and 12 as functions | `equivalent(a, b): boolean`, `bestExact(widths, asked): number \| undefined`, `standIns(held, saved, asked): { pxWidth: number; held: boolean }[]` |
| `_budget.ts` | Decisions 4, 5, 6 | `memoryBudget(): number`, `diskBudget(): Promise<number>`, `estimatedBytes(pxWidth, aspect): number`, `worthSaving(sourceSize, pxWidth, aspect): boolean` |
| `_memory.ts` | Pages held, least recently used first | `class Held { get(key): HTMLCanvasElement \| undefined; widths(id, page): number[]; put(key, canvas, onEvict): void; clear(): void }` |
| `_scheduler.ts` | Decisions 7 and 8 | `schedule<T>(key: string, priority: Priority, signal: AbortSignal \| undefined, run: (signal: AbortSignal) => Promise<T>): Promise<T>`, `resetScheduler(): void` |
| `_disk.ts` | OPFS under `page-cache-<EPOCH>/`, with an `index.json` | `class Saved { widths(id, page): Promise<number[]>; read(id, page, pxWidth): Promise<HTMLCanvasElement \| null>; write(id, page, pxWidth, canvas, pinned: boolean): Promise<void>; pin(set: Set<string>, keep: Set<string>): Promise<void>; has(id): Promise<boolean>; bytes(): Promise<{ setlists: number; other: number }>; evictTo(budget: number): Promise<void> }` |

A key is `` `${id}/${page}/${pxWidth}` ``; a scheduler key adds the crop
(`` `${key}/${x},${y},${w},${h}` ``) when there is one.

### `originals/`

In `originals/types.ts`, `Original` becomes:

```ts
import type { Crop, Drawn, Priority } from '../page-cache/types';

export interface DrawOptions { crop?: Crop; priority?: Priority; signal?: AbortSignal }

/** A source file Volti has read: what a score is made from. */
export interface Original extends SourceFile {
  /** Each page's height / width, in order: as stored, else worked out by opening it, and stored. */
  aspects(): Promise<number[]>;
  /** Page `page` (from 1), `pxWidth` device pixels wide, through the page cache. Priority defaults to 'now'. */
  draw(page: number, pxWidth: number, options?: DrawOptions): Promise<Drawn>;
  /** As draw, with stand-ins first (page-cache's drawPageProgressive). */
  drawProgressive(page: number, pxWidth: number, options?: DrawOptions): AsyncIterable<Drawn>;
  /** Its music as a PDF, for export. */
  pdf(): Promise<RenderedPdf>;
}
```

`pages()`, `PageCache`, `PagePictures` and the `_When` type are removed.

In `originals/original.ts`, a new public function:

```ts
/** The aspects stored for an original, without reading its file. */
export function knownAspects(id: string): Promise<number[] | undefined>;
```

In `originals/_types.ts`, today's `PageSource` (the open pdf.js or image source) is renamed
`OpenPages`, so the name `PageSource` means the cache's interface everywhere:

```ts
/** An original's pages, open: pdf.js's document, or an image's bitmap. Pages are numbered from 1. */
export interface OpenPages {
  readonly pages: number;
  aspect(num: number): Promise<number>;
  /** Draw a page `pxWidth` device pixels wide, or `crop` of it; stops when `signal` aborts. */
  draw(num: number, pxWidth: number, crop: Crop | undefined, signal: AbortSignal): Promise<HTMLCanvasElement>;
  destroy(): void;
}

export interface Content {
  pages(): Promise<OpenPages>;
  pdf(): Promise<RenderedPdf>;
}
```

`region` is removed from `OpenPages`, `PdfSource` and `ImageSource`.

A new internal file `originals/_sources.ts` keeps one open source per id:

```ts
/**
 * The page source for an original: opens `content`'s pages on its first draw, shares them with
 * every Original of the same id, and closes them 5 s after its last draw completes, unless it is
 * the original drawn most recently.
 */
export function sourceFor(id: string, size: number, content: Content): PageSource;

/** For tests: close every source now. */
export function closeSourcesForTests(): void;
```

## Steps

### 1. `originals/`: one draw, with a crop and a signal

- Rename `PageSource` in `_types.ts` to `OpenPages`, with the signature above, and update
  `_pdf-source.ts`, `_image-source.ts` and `original.ts`.
- `PdfSource.draw(num, pxWidth, crop, signal)`:
  - Work out `ss = supersample(pxWidth, round(pxWidth × pageAspect))` exactly as today.
  - Without a crop: draw as today.
  - With a crop: render a canvas `crop.w × ss` by `crop.h × ss`, with the viewport at
    `scale × ss` and `transform: [1, 0, 0, 1, −crop.x × ss, −crop.y × ss]`, then shrink it to
    `crop.w × crop.h` as the whole-page path does.
  - Call `renderTask.cancel()` when `signal` aborts, and reject with an `AbortError`
    (`signal.throwIfAborted()` after the await, and before starting).
- `ImageSource.draw(num, pxWidth, crop, signal)`: without a crop, as today; with one, today's
  `region` code. Call `signal.throwIfAborted()` before and after each await.
- `PageCache.render` passes `new AbortController().signal` and no crop; `renderRegion` calls
  `draw` with the crop. Delete `region`.
- `pagesDrawn` passes a signal that never aborts.

Check: zoom in on a PDF page and on a photo, and compare a close-up with before.

### 2. `originals/`: aspects stored by id

- Move `loadAspects` from `scores/store.ts` into `originals/original.ts` as `knownAspects`, and
  the writing of `keys.aspects(id)` with it. Update the comment on `keys.aspects` to name
  `originals/original.ts`.
- Add `aspects()` to `Original`, implemented in `FileOriginal`: `knownAspects(id)`, else open the
  pages, read every aspect, close them, store the aspects, and return them. Keep the result in a
  field so a second call doesn't touch storage.
- `loadScore(id, title, aspects)` no longer reads or writes aspects; it just uses the ones it is
  given.
- Callers of `loadAspects` (`library/library.ts`, `reader/_open-scores.ts`, `pictures/maker.ts`)
  call `knownAspects`. Callers of `cache.allAspects()` that only want the aspects (`export/pdf.ts`,
  the maker) call `o.aspects()` instead; export then no longer calls `pages()`.

### 3. `page-cache/`, not used yet

- Add `'page-cache': 1` to `LAYERS` in `src/layers.test.ts`.
- Write `types.ts`, then the internal files in the order of the table, then `cache.ts`.
- `cache.ts`'s `drawPage`:
  1. Without a crop, look for an equivalent page held (`Held`, then `bestExact`); return it with
     `exact: true`, marking it recently used.
  2. With a crop, if an equivalent whole page is held, cut the crop from it (scaled by
     `held / asked`) and return that, `exact: true`.
  3. Without a crop, look for an equivalent saved page (`Saved.widths`, `bestExact`), read it,
     hold it, and return it.
  4. Without a source, throw `NotSaved`.
  5. Otherwise `schedule(key, priority, signal, (s) => source.draw(page, pxWidth, crop, s))`.
     Hold the result (not a crop) and return it. If the key is pinned and not saved yet, write it
     now (decision 6).
- `Held.put`'s `onEvict` writes the page to `Saved` when `worthSaving(source.size, …)` holds, so
  `Held` must remember the source's size with each page.
- `drawPageProgressive`: yield each of `standIns(…)` with `exact: false` (read saved ones with
  `Saved.read`), then the result of `drawPage`. Wrap the request's signal in an
  `AbortController` and abort it in the generator's `finally`, so breaking out cancels.
- `keepOffline`: build the set of pinned keys, call `Saved.pin(set, keep)`, then draw each page
  not saved through `drawPage` at `later` priority, two at a time, yielding progress after each.
  Pages of scores without a source count in `of` but are never done.
- On first use, delete `page-pictures/` and every `page-cache-<n>/` whose `n` isn't `EPOCH`.
- Tests next to the files: `_match.test.ts` (pure); `_memory.test.ts` and `_scheduler.test.ts`,
  with fake canvases (`{ width, height } as HTMLCanvasElement`) and fake sources that resolve when
  told to. Cover: sharing a draw, cancelling only when every requester aborted, `later` waiting
  for `now`, never more than 2 running, and eviction order. `_disk.ts` isn't unit tested (OPFS).

### 4. `originals/`: drawing through the cache

- Write `_sources.ts` (signature above). It keeps a `Map<string, { content; open?: Promise<OpenPages>; running: number; timer? }>`.
  Its `draw` opens `content.pages()` if not open, counts the draw while it runs, and when the
  count falls to 0, starts a 5 s timer to `destroy()` it, unless the id is the one drawn last.
- `FileOriginal` takes the file's size when read (`_readOriginal` already has the `File`) and
  makes its source with `sourceFor(id, file.size, content)`.
- `FileOriginal.draw` calls `drawPage({ id, source, page, pxWidth, aspect: (await this.aspects())[page - 1], crop, priority: priority ?? 'now', signal })`;
  `drawProgressive` likewise with `drawPageProgressive`.
- `PageCache` stays for now, so nothing else changes in this step.

### 5. Callers that draw thumbnails and previews

Replace `cache.render(p + 1, w, h, dpr())` with
`(await o.draw(p + 1, Math.round(w * dpr()))).canvas` in:
`dialogs/open-score.ts` (drop `LibraryScore.close` and its callers), `library/_incoming.ts`
(drop the `caches` list), `reader/_toolbar-menus.ts` (`source`), and the reader's thumbnails
(`reader/reader.ts`, `thumb`). `drawFrame` scales by the canvas's own size, so a page drawn at an
equivalent width fits.

### 6. The reader

- `reader/_open-scores.ts`:
  - `OpenScore.cache?: PageCache` becomes `draw?: (page: number, pxWidth: number, options?: DrawOptions) => Promise<Drawn>`.
  - `openPages(o, ask)` returns `{ draw, aspects }`:
    - When `o.read(…)` succeeds: `draw` is the Original's `draw`, and `aspects` comes from
      `aspects()`.
    - When it fails with `NoAccess` or `PasswordNotGiven`, and `knownAspects(o.id)` and
      `hasSaved(o.id)` both give something: `draw` is
      `(page, pxWidth, opt) => drawPage({ id: o.id, page, pxWidth, aspect: aspects[page - 1], priority: opt?.priority ?? 'now', crop: opt?.crop, signal: opt?.signal })`
      (no source), and `aspects` is the known ones.
    - Otherwise, rethrow.
  - Remember which of the two it was (`readable: boolean` on `OpenScore`). `reader.ts`'s
    `readable()` uses it instead of `cache.ready()`.
  - `destroy`, `keepNear` and `accessAllowed` drop `draw` instead of destroying a cache.
- `reader/reader.ts`:
  - Draw the screen's pages with `draw(p + 1, Math.round(w * scale), { priority: 'now' })`. A
    `NotSaved` error is handled as `NoAccess` is today.
  - Pass `d.canvas` to `paintSlot`.
  - `predraw`: delete the `keepOnly` call. Make an `AbortController` for each screen, abort it
    when the screen changes (where `seq` is bumped), and pass its signal with
    `priority: 'ahead'`.
  - Drop the `save` argument everywhere: the cache saves pinned pages itself.
- `reader/_view.ts`: `cache(): PageCache` becomes `draw(): OpenScore['draw']`.
- `reader/_detail.ts`: `cache.renderRegion(page, fw, region)` becomes
  `(await draw(page, fw, { crop: region, priority: 'now', signal })).canvas`, with an
  `AbortController` aborted wherever `seq` is bumped.

Check: read a score and a setlist, turn quickly, zoom in; after a restart before Allow access,
play a setlist whose pages are saved.

### 7. Offline pages and the storage view

- Rewrite `pictures/maker.ts`'s `make`:
  - Work out each score's pages and exact widths as today, with aspects from `knownAspects`,
    else `(await original.read()).aspects()`. Ids whose aspects can't be had go in `keep`.
  - Call `keepPagesOffline` (below) with an entry per id: the read Original when there is one,
    else just the id. Abort the previous run's signal on a new call. Consume the progress
    (nothing shows it yet: step 8 files that).
- Add to `originals/original.ts`, so the maker never holds a `PageSource`:

  ```ts
  /** page-cache's keepOffline, for originals: each entry's source is its Original's, if it has one. */
  export function keepPagesOffline(
    entries: readonly { id: string; original?: Original; pages: OfflinePage[] }[],
    keep: readonly string[],
    signal?: AbortSignal,
  ): AsyncIterable<OfflineProgress>;
  ```

  It maps each entry to an `OfflineScore` (taking `source` from the `FileOriginal`) and returns
  `keepOffline(…)`.
- `library/library.ts`'s `accessAllowed` calls `makePictures(this.originals, this.setlists)`.
- `library/_storage.ts`: replace `picturesBytes` with `savedBytes()`, shown as two parts:
  "Setlist pages" and "Page cache", each with its own key and colour in `styles/`.
- Delete `pictures/pictures.ts`.

### 8. Remove the old cache, and the docs

- Delete `PageCache`, `PagePictures`, `_When`, `Original.pages()`, and `PageCache.opening`.
- `ARCHITECTURE.md`: add `page-cache/` to the layer table (layer 1) and describe it; update the
  `originals/` file list (`_sources`), and say that `pictures/` holds only the maker.
- `TODO.md`:
  - Remove "One page cache for the app, kept between sessions".
  - Under "Confirmed features which require more thought", add:
    - Progressive drawing for thumbnails when they are first drawn [needs thought].
    - The cache giving room back when the origin runs short of quota [needs thought].
    - Showing offline progress on the setlist's row.
  - Under Manual check: reading, turning, zooming, close-ups; setlists before Allow access; the
    storage view's two new parts; memory on a long setlist.
- Delete this file.

## Things to watch

- `layers.test.ts` must still pass after every step: `page-cache/` imports nothing above layer 0,
  and nothing outside `originals/` may import `originals/_sources.ts`.
- `Original.draw` returns a canvas the cache may still hold, and that other callers may hold too.
  Don't draw on it, and don't clear it.
- The service worker must stay free of pdf.js: `page-cache/` must not import `originals/`.
