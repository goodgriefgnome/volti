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
import { NotSaved, type Crop, type DrawRequest, type Drawn, type PinnedKey } from './types';

let held = new Held();
let saved = new Saved();
/** The keys (`id/page/pxWidth`) of the pages kept for setlists: written as soon as they are drawn. */
let pinned = new Set<string>();

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

/** The canvases of a progressive draw, stand-ins first. */
export async function* canvasesOf(drawn: AsyncIterable<Drawn>): AsyncGenerator<HTMLCanvasElement> {
  for await (const d of drawn) yield d.canvas;
}

/**
 * Pin exactly these pages (keep them saved, drawn in the background by `saveOffline`); the pinned
 * pages of the ids in `unknown` stay as they are (their pages couldn't be worked out), and every
 * other pinned page becomes an ordinary saved one. Gives those of `pages` already saved at exactly
 * their width.
 */
export async function pinOffline(pages: readonly PinnedKey[], unknown: readonly string[]): Promise<PinnedKey[]> {
  pinned = new Set(pages.map((p) => keyOf(p.id, p.page, p.pxWidth)));
  await saved.pin(pinned, new Set(unknown));
  const already: PinnedKey[] = [];
  for (const p of pages) if ((await saved.widths(p.id, p.page)).includes(p.pxWidth)) already.push(p);
  return already;
}

/**
 * Save one pinned page: from memory if it is held, else drawn at `later` priority and written.
 * Throws when it can't be drawn, and when `req.signal` aborts.
 */
export async function saveOffline(req: DrawRequest): Promise<void> {
  const { id, page, pxWidth, signal } = req;
  signal?.throwIfAborted();
  const inMemory = held.get(keyOf(id, page, pxWidth));
  if (inMemory) await save(id, page, pxWidth, inMemory, true);
  else {
    const { canvas } = await render({ ...req, priority: 'later' });
    await saved.write(id, page, pxWidth, canvas, true); // the write render began, if it has not finished
  }
}

/** Whether any page of `id` is saved. */
export const hasSaved = (id: string): Promise<boolean> => saved.has(id);

/** The room the saved pages take: those kept for setlists, and the rest. */
export const savedBytes = (): Promise<{ setlists: number; other: number }> => saved.bytes();

/** For tests: forget everything held, queued and known saved, as if the app had just started. */
export function resetPageCacheForTests(): void {
  pinned = new Set();
  held = new Held();
  saved = new Saved();
  resetScheduler();
}
