// Reading a source file into an original, and the page cache an original gives. `_readOriginal`
// picks how the file is read by its first bytes (a PDF: _pdf-source.ts, else an image:
// _image-source.ts) and wraps what that gives with the file in an original that passes its id, path,
// moving and removing to the file. `PageCache` keeps the pages drawn from an OpenPages: it draws a
// couple at a time, those for the screen first, keeps those around the current screen, and uses
// saved pictures where there are some.

import { readImage } from './_image-source';
import type { Content, OpenPages, Readable } from './_types';
import { isPdf, readPdf } from './_pdf-source';
import type { AskPassword, Original, PagePictures, RenderedPdf } from './types';

/**
 * Read a source file: an image as it is; a PDF asks for its password now if it has one Volti
 * doesn't know yet, and otherwise reads its music only when its pages or its PDF are wanted.
 */
export async function _readOriginal(f: Readable, ask?: AskPassword): Promise<Original> {
  const file = await f.file();
  const bytes = new Uint8Array(await file.slice(0, 2048).arrayBuffer());
  return new FileOriginal(f, isPdf(bytes) ? await readPdf(f, ask) : readImage(f));
}

/** An original: its file's id, path, moving and removing, and itself as what reading it gives. */
class FileOriginal implements Original {
  constructor(private f: Readable, private content: Content) {}
  get id() { return this.f.id; }
  get path() { return this.f.path; }
  move(path: string) { return this.f.move(path); }
  remove() { return this.f.remove(); }
  async read() { return this; }
  pdf(): Promise<RenderedPdf> { return this.content.pdf(); }
  /** Awaits the source first, so a NoAccess or PasswordNotGiven rejects here. */
  async pages(): Promise<PageCache> { return new PageCache(Promise.resolve(await this.content.pages())); }
}

/**
 * How soon a page is wanted: `now` on the screen, `ahead` on a neighbouring screen, `later` in
 * the background (it also waits while any page is drawn for the screen, in any score).
 */
export type _When = 'now' | 'ahead' | 'later';

/** Pages being drawn for the screen, in any score, and what waits for there to be none. */
let forScreen = 0;
let quiet: (() => void)[] = [];
const whenQuiet = () => (forScreen ? new Promise<void>((go) => quiet.push(go)) : Promise.resolve());
function screenDrawn() {
  if (--forScreen) return;
  const waiting = quiet;
  quiet = [];
  for (const go of waiting) go();
}

/** Pages drawn at once: two overlap well (the worker reads one while the other is painted); more only use up memory. */
const AT_ONCE = 2;

/**
 * Renders pages to canvases and keeps the ones around the current spread,
 * so turning to a neighbouring spread shows a page that is already drawn.
 */
export class PageCache {
  private cache = new Map<string, Promise<HTMLCanvasElement>>();
  private aspects = new Map<number, number>();
  /** Draws waiting for a turn: pages wanted now go before the rest. */
  private waiting: { now: (() => void)[]; later: (() => void)[] } = { now: [], later: [] };
  private drawing = 0;
  /** Saved pictures of the pages, used instead of drawing them. */
  pictures?: PagePictures;

  constructor(private opened: Promise<OpenPages>) {
    opened.catch(() => {}); // a failure shows where a page is drawn
  }

  /** A cache for an original still opening: drawing a page waits for it, but a saved picture doesn't. */
  static opening(cache: Promise<PageCache>): PageCache {
    return new PageCache(cache.then((c) => c.opened));
  }

  /** Page height / width. */
  async aspect(num: number): Promise<number> {
    let a = this.aspects.get(num);
    if (a === undefined) {
      a = await (await this.opened).aspect(num);
      this.aspects.set(num, a);
    }
    return a;
  }

  /** Resolves once the original is open; rejects with why it couldn't be (NoAccess, PasswordNotGiven). */
  async ready(): Promise<void> {
    await this.opened;
  }

  /** Height / width of every page, in order. */
  async allAspects(): Promise<number[]> {
    const n = (await this.opened).pages;
    return Promise.all(Array.from({ length: n }, (_, i) => this.aspect(i + 1)));
  }

  private key(num: number, cssW: number, cssH: number) { return `${num}@${cssW}x${cssH}`; }

  has(num: number, cssW: number, cssH: number) { return this.cache.has(this.key(num, cssW, cssH)); }

  /** Wait for a turn to draw, then hand it on when done. */
  private async turn<T>(when: _When, draw: (waited: boolean) => Promise<T>): Promise<T> {
    if (when === 'later') await whenQuiet();
    const waited = this.drawing >= AT_ONCE;
    if (waited) await new Promise<void>((go) => this.waiting[when === 'now' ? 'now' : 'later'].push(go));
    else this.drawing++;
    if (when === 'now') forScreen++;
    try {
      return await draw(waited);
    } finally {
      if (when === 'now') screenDrawn();
      const next = this.waiting.now.shift() ?? this.waiting.later.shift();
      if (next) next(); // the turn passes straight on
      else this.drawing--;
    }
  }

  /**
   * A page, from its saved picture or drawn, a couple at a time. A page not wanted `now` waits for
   * any that is, so drawing ahead never holds up the page asked for for long. One drawn to `save`
   * (read at a size the reader shows, not a thumbnail) is offered to the saved pictures.
   */
  render(num: number, cssW: number, cssH: number, dpr: number, when: _When = 'now', save = false): Promise<HTMLCanvasElement> {
    const k = this.key(num, cssW, cssH);
    let p = this.cache.get(k);
    if (p) return p;
    // Size the result in whole screen pixels, so the browser never has to stretch it.
    const width = Math.round(cssW * dpr);
    p = (async () => {
      const saved = await this.pictures?.get(num, width);
      if (saved) return saved;
      const canvas = await this.turn(when, (waited) => {
        // Turned past while it waited: no longer kept, so not worth drawing.
        if (when === 'ahead' && waited && !this.cache.has(k)) throw new Error('No longer wanted');
        return this.opened.then((s) => s.draw(num, width, undefined, new AbortController().signal));
      });
      if (save) this.pictures?.put(num, width, canvas);
      return canvas;
    })();
    this.cache.set(k, p);
    p.catch(() => this.cache.delete(k));
    return p;
  }

  /**
   * Draw part of a page for a zoomed-in close-up: the page is drawn `pageWidth` pixels wide and
   * `region` (in those pixels) is cut out of it. Not cached, as it changes with every pan and pinch.
   */
  async renderRegion(num: number, pageWidth: number, region: { x: number; y: number; w: number; h: number }): Promise<HTMLCanvasElement> {
    return (await this.opened).draw(num, pageWidth, region, new AbortController().signal);
  }

  /** Drop everything except the given pages at the given size. */
  keepOnly(nums: number[], sizeOf: (num: number) => { w: number; h: number } | undefined) {
    const keep = new Set(nums.map((n) => { const s = sizeOf(n); return s && this.key(n, s.w, s.h); }));
    for (const k of this.cache.keys()) if (!keep.has(k)) this.cache.delete(k);
  }

  destroy() {
    this.cache.clear();
    void this.opened.then((s) => s.destroy(), () => {});
  }
}
