// The one page cache for the app. A page asked for is found held in memory, else saved in OPFS,
// else drawn from the source it is given (two draws at once, the screen's first). Pages leave
// memory under a budget and are saved then if drawing them again would be slow enough to be worth
// it; pages setlists play are pinned: kept saved, drawn in the background to get them saved. It
// knows nothing about files: a PageSource draws.

import { bestExact, standIns } from './_match';
import { diskBudget, worthSaving } from './_budget';
import { Held } from './_memory';
import { resetScheduler, schedule } from './_scheduler';
import { Saved } from './_disk';
import { NotSaved, type Crop, type DrawRequest, type Drawn, type OfflineProgress, type OfflineScore } from './types';

let held = new Held();
let saved = new Saved();
/** The keys (`id/page/pxWidth`) of the pages kept for setlists: written as soon as they are drawn. */
let pinned = new Set<string>();
/** Stops the keeping offline going on. */
let keeping: AbortController | undefined;

const keyOf = (id: string, page: number, pxWidth: number) => `${id}/${page}/${pxWidth}`;
const cropKey = (c: Crop) => `${c.x},${c.y},${c.w},${c.h}`;

/** Save a page that is wanted saved, and keep the saved pages within budget. */
async function save(id: string, page: number, pxWidth: number, canvas: HTMLCanvasElement, isPinned: boolean) {
  await saved.write(id, page, pxWidth, canvas, isPinned);
  await saved.evictTo(await diskBudget());
}

/** Hold a whole page; when it leaves memory it is saved if the source is slow enough to draw again. */
function hold(req: DrawRequest, pxWidth: number, canvas: HTMLCanvasElement, fromDisk: boolean) {
  const { id, page, source, aspect } = req;
  held.put(keyOf(id, page, pxWidth), canvas, (c) => {
    if (!fromDisk && source && worthSaving(source.size, pxWidth, aspect)) void save(id, page, pxWidth, c, false);
  });
}

/** `crop` (in pixels of a page `asked` wide) of a page drawn `pxWidth` wide, as a new canvas. */
function cut(canvas: HTMLCanvasElement, crop: Crop, asked: number, pxWidth: number): HTMLCanvasElement {
  const s = pxWidth / asked;
  const out = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(crop.w * s)), height: Math.max(1, Math.round(crop.h * s)) });
  out.getContext('2d', { alpha: false })!.drawImage(canvas, crop.x * s, crop.y * s, crop.w * s, crop.h * s, 0, 0, out.width, out.height);
  return out;
}

/** A whole page equivalent to the one asked for, held or saved (then held); with its width. */
async function whole(req: DrawRequest): Promise<{ canvas: HTMLCanvasElement; pxWidth: number } | undefined> {
  const { id, page, pxWidth } = req;
  const inMemory = bestExact(held.widths(id, page), pxWidth);
  const c = inMemory !== undefined && held.get(keyOf(id, page, inMemory));
  if (c) return { canvas: c, pxWidth: inMemory! };
  const onDisk = bestExact(await saved.widths(id, page), pxWidth);
  if (onDisk === undefined) return undefined;
  // Read in the meantime by another request?
  const again = held.get(keyOf(id, page, onDisk));
  if (again) return { canvas: again, pxWidth: onDisk };
  const read = await saved.read(id, page, onDisk);
  if (!read) return undefined;
  hold(req, onDisk, read, true);
  return { canvas: read, pxWidth: onDisk };
}

/** Draw a page (or a crop of it) from the source, at exactly the width asked; a whole page is held, and saved if pinned. */
async function render(req: DrawRequest): Promise<Drawn> {
  const { id, page, pxWidth, crop, source, priority, signal } = req;
  const key = keyOf(id, page, pxWidth);
  const canvas = await schedule(crop ? `${key}/${cropKey(crop)}` : key, priority, signal, (s) => source!.draw(page, pxWidth, crop, s));
  if (!crop) {
    hold(req, pxWidth, canvas, false);
    if (pinned.has(key)) void save(id, page, pxWidth, canvas, true);
  }
  return { canvas, pxWidth, exact: true };
}

/** The page as asked for: held, saved, or drawn. */
export async function drawPage(req: DrawRequest): Promise<Drawn> {
  req.signal?.throwIfAborted();
  const have = await whole(req);
  if (have) {
    if (!req.crop) return { canvas: have.canvas, pxWidth: have.pxWidth, exact: true };
    return { canvas: cut(have.canvas, req.crop, req.pxWidth, have.pxWidth), pxWidth: have.pxWidth, exact: true };
  }
  if (!req.source) throw new NotSaved(`No page ${req.page} of ${req.id} is saved`);
  return render(req);
}

/**
 * Stand-ins already at hand (decision 12), each closer to what was asked for than the last, then
 * the page as asked for. Breaking out of the loop aborts the draw, as `req.signal` does.
 */
export async function* drawPageProgressive(req: DrawRequest): AsyncGenerator<Drawn> {
  const own = new AbortController();
  const stop = () => own.abort(req.signal?.reason);
  req.signal?.addEventListener('abort', stop, { once: true });
  try {
    req.signal?.throwIfAborted();
    const { id, page, pxWidth, crop } = req;
    for (const s of standIns(held.widths(id, page), await saved.widths(id, page), pxWidth)) {
      let canvas = s.held ? held.get(keyOf(id, page, s.pxWidth)) : undefined;
      if (!canvas) {
        canvas = (await saved.read(id, page, s.pxWidth)) ?? undefined;
        if (canvas) hold(req, s.pxWidth, canvas, true);
      }
      own.signal.throwIfAborted();
      if (canvas) yield { canvas: crop ? cut(canvas, crop, pxWidth, s.pxWidth) : canvas, pxWidth: s.pxWidth, exact: false };
    }
    yield await drawPage({ ...req, signal: own.signal });
  } finally {
    req.signal?.removeEventListener('abort', stop);
    own.abort();
  }
}

/**
 * Keep exactly these pages saved (pinned), drawing those not saved yet, two at a time, at
 * `later` priority. Pinned pages not in `scores` become ordinary saved pages. The pinned pages of
 * the ids in `keep` stay as they are (their pages couldn't be worked out). A new call stops the
 * one before; so does `signal`.
 */
export function keepOffline(scores: readonly OfflineScore[], keep: readonly string[], signal?: AbortSignal): AsyncIterable<OfflineProgress> {
  keeping?.abort();
  const own = keeping = new AbortController();
  if (signal?.aborted) own.abort();
  else signal?.addEventListener('abort', () => own.abort(), { once: true });
  pinned = new Set(scores.flatMap((s) => s.pages.map((p) => keyOf(s.id, p.page, p.pxWidth))));
  return keepRun(scores, keep, own.signal, pinned);
}

/** The work of keepOffline: yields how many pages are saved after each is, until done or stopped. */
async function* keepRun(scores: readonly OfflineScore[], keep: readonly string[], signal: AbortSignal, mine: Set<string>): AsyncGenerator<OfflineProgress> {
  await saved.pin(mine, new Set(keep));
  let done = 0;
  const todo: { score: OfflineScore; page: number; pxWidth: number; aspect: number }[] = [];
  let of = 0;
  for (const score of scores) {
    for (const p of score.pages) {
      of++;
      if (signal.aborted) return;
      if ((await saved.widths(score.id, p.page)).includes(p.pxWidth)) done++;
      else todo.push({ score, ...p });
    }
  }
  yield { done, of };
  // Pages finished, handed to the loop below as they come.
  let wake: (() => void) | undefined;
  const finished: boolean[] = [];
  let working = 0;
  const next = () => {
    const job = todo.shift();
    if (!job || signal.aborted) return;
    const { score, page, pxWidth, aspect } = job;
    if (!score.source) return next(); // can't be drawn now: stays to do
    working++;
    void (async () => {
      const key = keyOf(score.id, page, pxWidth);
      const inMemory = held.get(key);
      if (inMemory) await save(score.id, page, pxWidth, inMemory, true);
      else {
        const { canvas } = await render({ id: score.id, source: score.source, page, pxWidth, aspect, priority: 'later', signal });
        await saved.write(score.id, page, pxWidth, canvas, true); // the write render began, if it has not finished
      }
    })().then(() => finished.push(true), (e) => {
      if (!signal.aborted) console.warn('Could not draw a page to keep offline:', e);
      finished.push(false);
    }).finally(() => {
      working--;
      next();
      wake?.();
    });
  };
  next();
  next();
  while (working || finished.length) {
    if (!finished.length) await new Promise<void>((r) => { wake = r; });
    if (signal.aborted) return;
    for (const ok of finished.splice(0)) {
      if (ok) done++;
      yield { done, of };
    }
  }
}

/** Whether any page of `id` is saved. */
export const hasSaved = (id: string): Promise<boolean> => saved.has(id);

/** The room the saved pages take: those kept for setlists, and the rest. */
export const savedBytes = (): Promise<{ setlists: number; other: number }> => saved.bytes();

/** For tests: forget everything held, queued and known saved, as if the app had just started. */
export function resetPageCacheForTests(): void {
  keeping?.abort();
  keeping = undefined;
  pinned = new Set();
  held = new Held();
  saved = new Saved();
  resetScheduler();
}
