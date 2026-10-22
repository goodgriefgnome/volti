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
      const viewport = page.getViewport({ scale: (cssW / base.width) * dpr });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport, background: '#ffffff' }).promise;
      page.cleanup();
      return canvas;
    });
    this.queue = p;
    this.cache.set(k, p);
    p.catch(() => this.cache.delete(k));
    return p;
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
