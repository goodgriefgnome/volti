// Reading PDFs with pdf.js: opening one, the shapes of its pages, and drawing them. All use of
// pdf.js is here; the page cache (pages.ts) keeps what is drawn.

// The legacy build carries fallbacks for JavaScript features newer than some Android Chrome versions.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

import type { PageSource } from './internal-types';
import { PageCache } from './pages';

const assets = import.meta.env.BASE_URL + 'pdfjs/';

/**
 * Open a PDF, which takes `data` (it can't be used again). One protected by a password asks
 * `password` for it, saying whether the last one was wrong; null gives up, and the opening fails.
 */
export async function openPdf(data: Uint8Array, password?: (wrong: boolean) => Promise<string | null>): Promise<PageCache> {
  const task = pdfjs.getDocument({
    data,
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
  return new PageCache(Promise.resolve(new PdfSource(doc)));
}

/** Largest canvas drawn while supersampling, in pixels; bigger ones risk running out of graphics memory. */
const MAX_SUPERSAMPLE_PIXELS = 24e6;

/** How much larger than the screen to draw a page before shrinking it: 2 where memory allows. */
export function supersample(width: number, height: number): number {
  const room = Math.sqrt(MAX_SUPERSAMPLE_PIXELS / (width * height));
  return room >= 2 ? 2 : room >= 1.5 ? 1.5 : 1;
}

/** A PDF's pages, drawn by pdf.js. */
class PdfSource implements PageSource {
  constructor(private doc: pdfjs.PDFDocumentProxy) {}

  get pages() { return this.doc.numPages; }

  async aspect(num: number) {
    const vp = (await this.doc.getPage(num)).getViewport({ scale: 1 });
    return vp.height / vp.width;
  }

  /** Draw a page `width` device pixels wide. */
  async draw(num: number, width: number): Promise<HTMLCanvasElement> {
    const page = await this.doc.getPage(num);
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

  /** Draw a page `pageWidth` pixels wide, and cut `region` (in those pixels) out of it. */
  async region(num: number, pageWidth: number, region: { x: number; y: number; w: number; h: number }): Promise<HTMLCanvasElement> {
    const page = await this.doc.getPage(num);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: pageWidth / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = region.w;
    canvas.height = region.h;
    await page.render({ canvas, viewport, transform: [1, 0, 0, 1, -region.x, -region.y], background: '#ffffff' }).promise;
    return canvas;
  }

  /** Close the document, freeing it in the worker: its loading task does that. */
  destroy() {
    void this.doc.loadingTask.destroy();
  }
}
