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
  return new PageCache(task, await task.promise);
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
  /** Draws waiting for a turn: pages wanted now go before pages drawn ahead. */
  private waiting: { now: (() => void)[]; ahead: (() => void)[] } = { now: [], ahead: [] };
  private drawing = 0;

  constructor(private task: pdfjs.PDFDocumentLoadingTask, private doc: pdfjs.PDFDocumentProxy) {}

  get numPages() { return this.doc.numPages; }

  /** Page height / width. */
  async aspect(num: number): Promise<number> {
    let a = this.aspects.get(num);
    if (a === undefined) {
      const vp = (await this.doc.getPage(num)).getViewport({ scale: 1 });
      a = vp.height / vp.width;
      this.aspects.set(num, a);
    }
    return a;
  }

  /** Height / width of every page, in order. */
  allAspects(): Promise<number[]> {
    return Promise.all(Array.from({ length: this.numPages }, (_, i) => this.aspect(i + 1)));
  }

  private key(num: number, cssW: number, cssH: number) { return `${num}@${cssW}x${cssH}`; }

  has(num: number, cssW: number, cssH: number) { return this.cache.has(this.key(num, cssW, cssH)); }

  /** Wait for a turn to draw, then hand it on when done. */
  private async turn<T>(ahead: boolean, draw: (waited: boolean) => Promise<T>): Promise<T> {
    const waited = this.drawing >= AT_ONCE;
    if (waited) await new Promise<void>((go) => this.waiting[ahead ? 'ahead' : 'now'].push(go));
    else this.drawing++;
    try {
      return await draw(waited);
    } finally {
      const next = this.waiting.now.shift() ?? this.waiting.ahead.shift();
      if (next) next(); // the turn passes straight on
      else this.drawing--;
    }
  }

  /**
   * Draw a page, a couple at a time. A page drawn `ahead` (one not on the screen yet) waits for
   * any page wanted now, so drawing ahead never holds up the page asked for for long.
   */
  render(num: number, cssW: number, cssH: number, dpr: number, ahead = false): Promise<HTMLCanvasElement> {
    const k = this.key(num, cssW, cssH);
    let p = this.cache.get(k);
    if (p) return p;
    p = this.turn(ahead, async (waited) => {
      // Turned past while it waited: no longer kept, so not worth drawing.
      if (ahead && waited && !this.cache.has(k)) throw new Error('No longer wanted');
      const page = await this.doc.getPage(num);
      const base = page.getViewport({ scale: 1 });
      // Size the result in whole screen pixels, so the browser never has to stretch it.
      const width = Math.round(cssW * dpr);
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
    });
    this.cache.set(k, p);
    p.catch(() => this.cache.delete(k));
    return p;
  }

  /**
   * Draw part of a page for a zoomed-in close-up: the page is drawn `pageWidth` pixels wide and
   * `region` (in those pixels) is cut out of it. Not cached, as it changes with every pan and pinch.
   */
  async renderRegion(num: number, pageWidth: number, region: { x: number; y: number; w: number; h: number }): Promise<HTMLCanvasElement> {
    const page = await this.doc.getPage(num);
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
    void this.task.destroy();
  }
}
