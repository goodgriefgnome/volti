// Reading PDFs with pdf.js: opening one, the shapes of its pages, and drawing pages to canvases,
// keeping the pages around the current screen. All use of pdf.js is here; another kind of source
// (images) would get a file beside it.

// The legacy build carries fallbacks for JavaScript features newer than some Android Chrome versions.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const assets = import.meta.env.BASE_URL + 'pdfjs/';

/**
 * Open a PDF. One protected by a password asks `password` for it, saying whether the last one was
 * wrong; null gives up, and the opening fails.
 */
export async function openPdf(file: File, password?: (wrong: boolean) => Promise<string | null>): Promise<PageCache> {
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: assets + 'cmaps/',
    standardFontDataUrl: assets + 'standard_fonts/',
    wasmUrl: assets + 'wasm/',
    iccUrl: assets + 'iccs/',
  });
  task.onPassword = (answer: (p: string | Error) => void, reason: number) => {
    const ask = password?.(reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD) ?? Promise.resolve(null);
    void ask.then((p) => answer(p ?? new Error('No password')), (e: Error) => answer(e));
  };
  const doc = await task.promise;
  return new PageCache(Promise.resolve({ task, doc }));
}

interface Opened { task: pdfjs.PDFDocumentLoadingTask; doc: pdfjs.PDFDocumentProxy }

/** Saved pictures of a score's pages, by page number and width in device pixels: looked at before a page is drawn. */
export interface PagePictures {
  get(num: number, width: number): Promise<HTMLCanvasElement | null>;
  /** Offered each page drawn for reading: kept if it is one to keep. */
  put(num: number, width: number, canvas: HTMLCanvasElement): void;
}

/**
 * How soon a page is wanted: `now` on the screen, `ahead` on a neighbouring screen, `later` in
 * the background (it also waits while any page is drawn for the screen, in any score).
 */
export type When = 'now' | 'ahead' | 'later';

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

/** Largest canvas drawn while supersampling, in pixels; bigger ones risk running out of graphics memory. */
const MAX_SUPERSAMPLE_PIXELS = 24e6;

/** How much larger than the screen to draw a page before shrinking it: 2 where memory allows. */
export function supersample(width: number, height: number): number {
  const room = Math.sqrt(MAX_SUPERSAMPLE_PIXELS / (width * height));
  return room >= 2 ? 2 : room >= 1.5 ? 1.5 : 1;
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

  constructor(private opened: Promise<Opened>) {
    opened.catch(() => {}); // a failure shows where a page is drawn
  }

  /** A cache for a PDF still opening: drawing a page waits for it, but a saved picture doesn't. */
  static opening(cache: Promise<PageCache>): PageCache {
    return new PageCache(cache.then((c) => c.opened));
  }

  private async doc() { return (await this.opened).doc; }

  /** Page height / width. */
  async aspect(num: number): Promise<number> {
    let a = this.aspects.get(num);
    if (a === undefined) {
      const vp = (await (await this.doc()).getPage(num)).getViewport({ scale: 1 });
      a = vp.height / vp.width;
      this.aspects.set(num, a);
    }
    return a;
  }

  /** Height / width of every page, in order. */
  async allAspects(): Promise<number[]> {
    const n = (await this.doc()).numPages;
    return Promise.all(Array.from({ length: n }, (_, i) => this.aspect(i + 1)));
  }

  private key(num: number, cssW: number, cssH: number) { return `${num}@${cssW}x${cssH}`; }

  has(num: number, cssW: number, cssH: number) { return this.cache.has(this.key(num, cssW, cssH)); }

  /** Wait for a turn to draw, then hand it on when done. */
  private async turn<T>(when: When, draw: (waited: boolean) => Promise<T>): Promise<T> {
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
  render(num: number, cssW: number, cssH: number, dpr: number, when: When = 'now', save = false): Promise<HTMLCanvasElement> {
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
        return this.draw(num, width);
      });
      if (save) this.pictures?.put(num, width, canvas);
      return canvas;
    })();
    this.cache.set(k, p);
    p.catch(() => this.cache.delete(k));
    return p;
  }

  /** Draw a page `width` device pixels wide. */
  private async draw(num: number, width: number): Promise<HTMLCanvasElement> {
    const page = await (await this.doc()).getPage(num);
    const base = page.getViewport({ scale: 1 });
    const scale = width / base.width;
    const height = Math.round(base.height * scale);
    // Draw larger, then shrink with high-quality smoothing: this keeps staff lines even
    // and stops scanned pages from looking jagged.
    const ss = supersample(width, height);
    const big = document.createElement('canvas');
    const viewport = page.getViewport({ scale: scale * ss });
    big.width = Math.round(viewport.width);
    big.height = Math.round(viewport.height);
    try {
      await page.render({ canvas: big, viewport, background: '#ffffff' }).promise;
    } finally {
      page.cleanup();
    }
    if (ss === 1) return big;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(big, 0, 0, width, height);
    big.width = big.height = 0; // free its memory now rather than at garbage collection
    return canvas;
  }

  /**
   * Draw part of a page for a zoomed-in close-up: the page is drawn `pageWidth` pixels wide and
   * `region` (in those pixels) is cut out of it. Not cached, as it changes with every pan and pinch.
   */
  async renderRegion(num: number, pageWidth: number, region: { x: number; y: number; w: number; h: number }): Promise<HTMLCanvasElement> {
    const page = await (await this.doc()).getPage(num);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: pageWidth / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = region.w;
    canvas.height = region.h;
    await page.render({ canvas, viewport, transform: [1, 0, 0, 1, -region.x, -region.y], background: '#ffffff' }).promise;
    return canvas;
  }

  /** Drop everything except the given pages at the given size. */
  keepOnly(nums: number[], sizeOf: (num: number) => { w: number; h: number } | undefined) {
    const keep = new Set(nums.map((n) => { const s = sizeOf(n); return s && this.key(n, s.w, s.h); }));
    for (const k of this.cache.keys()) if (!keep.has(k)) this.cache.delete(k);
  }

  destroy() {
    this.cache.clear();
    void this.opened.then(({ task }) => task.destroy(), () => {});
  }
}
