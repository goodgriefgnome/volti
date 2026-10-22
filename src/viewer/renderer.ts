// The legacy build carries fallbacks for JavaScript features newer than some Android Chrome versions.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const assets = import.meta.env.BASE_URL + 'pdfjs/';

export async function openPdf(file: File): Promise<PageCache> {
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: assets + 'cmaps/',
    standardFontDataUrl: assets + 'standard_fonts/',
    wasmUrl: assets + 'wasm/',
    iccUrl: assets + 'iccs/',
  });
  return new PageCache(task, await task.promise);
}

/** Largest canvas drawn while supersampling, in pixels; bigger ones risk running out of graphics memory. */
const MAX_SUPERSAMPLE_PIXELS = 24e6;

/** How much larger than the screen to draw a page before shrinking it: 2 where memory allows. */
export function supersample(width: number, height: number): number {
  const room = Math.sqrt(MAX_SUPERSAMPLE_PIXELS / (width * height));
  return room >= 2 ? 2 : room >= 1.5 ? 1.5 : 1;
}

/**
 * Renders pages to canvases and keeps the ones around the current spread,
 * so turning to a neighbouring spread shows a page that is already drawn.
 */
export class PageCache {
  private cache = new Map<string, Promise<HTMLCanvasElement>>();
  private aspects = new Map<number, number>();
  private queue: Promise<unknown> = Promise.resolve();

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

  private key(num: number, cssW: number, cssH: number) { return `${num}@${cssW}x${cssH}`; }

  has(num: number, cssW: number, cssH: number) { return this.cache.has(this.key(num, cssW, cssH)); }

  /** One render at a time, so pre-drawing never slows down the page you asked for more than one render. */
  render(num: number, cssW: number, cssH: number, dpr: number): Promise<HTMLCanvasElement> {
    const k = this.key(num, cssW, cssH);
    let p = this.cache.get(k);
    if (p) return p;
    p = this.queue.catch(() => {}).then(async () => {
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
    this.queue = p;
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
