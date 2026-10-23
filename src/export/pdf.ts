// Exporting scores as PDFs that read as the reader does in 1-page mode: a page for each frame, the
// music cut from the original's pages, and the ink over it. The music stays as it is in the
// original (vectors, or the scan) where pdf-lib can read the original, and is drawn by pdf.js
// where it can't (an encrypted PDF, say). pdf-lib is only loaded to export.

import type { PDFDocument, PDFEmbeddedPage, PDFPage } from 'pdf-lib';
import type { Original } from '../originals/originals';
import type { PageCache } from '../originals/pdf';
import { drawFrame, drawFrameInk } from '../reader/frames';
import { pack, type Frame } from '../scores/frames';
import { frameHeight, type Aspects, type State } from '../scores/model';
import { visible } from '../scores/ownership';
import { loadScore } from '../scores/store';
import { spanCuts, type Span } from '../setlists/model';
import { openOriginal } from '../ui/passwords';
import { placeCut, shownSize, type SourcePage } from './placement';

/** One part of an export: a score, whole or the excerpt `span` of it. Each starts on a new page. */
export interface ExportPart { original: Original; span?: Span }

type PdfLib = typeof import('pdf-lib');

/** How many pixels wide ink, and music pdf-lib can't read, are drawn for a page. */
const RASTER_W = 2000;
/** The page width, in points, when pdf-lib can't read the original: A4. */
const A4_W = 595;

/** An original open for exporting: its score, pdf.js's copy and pdf-lib's (null when it can't read it). */
interface Source {
  state: State;
  aspects: Aspects;
  cache: PageCache;
  doc: PDFDocument | null;
  /** The width of the exported pages, in points: the original's first page as shown. */
  width: number;
  /** Its pages, each embedded in the export once, by 0-based page. */
  embedded: Map<number, Promise<PDFEmbeddedPage>>;
}

const sourcePage = (page: PDFPage): SourcePage => {
  const box = page.getCropBox();
  return { width: box.width, height: box.height, rotation: page.getRotation().angle };
};

async function open(lib: PdfLib, o: Original): Promise<Source> {
  const file = await o.getFile();
  const cache = await openOriginal(o);
  try {
    const aspects = await cache.allAspects();
    const { state } = await loadScore(o.id, o.title, aspects);
    const doc = await lib.PDFDocument.load(await file.arrayBuffer()).catch((e) => { console.warn('Exporting by drawing the pages:', e); return null; });
    const width = doc?.getPageCount() ? shownSize(sourcePage(doc.getPage(0))).width : A4_W;
    return { state, aspects, cache, doc, width, embedded: new Map() };
  } catch (e) {
    cache.destroy();
    throw e;
  }
}

async function pngOrJpeg(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg'): Promise<ArrayBuffer> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
  if (!blob) throw new Error('Could not draw a page');
  return blob.arrayBuffer();
}

/** The music of a frame from an original pdf-lib can read: each cut's band of its page, as it is. */
function drawMusic(lib: PdfLib, out: PDFDocument, page: PDFPage, src: Source & { doc: PDFDocument }, frame: Frame, W: number, H: number) {
  return Promise.all(frame.items.map(async (p) => {
    const from = src.doc.getPage(p.cut.page), sp = sourcePage(from);
    let embedded = src.embedded.get(p.cut.page);
    if (!embedded) {
      const box = from.getCropBox();
      embedded = out.embedPage(from, { left: box.x, bottom: box.y, right: box.x + box.width, top: box.y + box.height });
      src.embedded.set(p.cut.page, embedded);
    }
    return { p, sp, embedded: await embedded };
  })).then((cuts) => {
    for (const { p, sp, embedded } of cuts) {
      const { matrix, clip } = placeCut(p, sp, W, H);
      const name = page.node.newXObject('EmbeddedPdfPage', embedded.ref);
      page.pushOperators(
        lib.pushGraphicsState(),
        lib.rectangle(clip.x, clip.y, clip.width, clip.height), lib.clip(), lib.endPath(),
        lib.concatTransformationMatrix(...matrix),
        lib.drawObject(name),
        lib.popGraphicsState(),
      );
    }
  });
}

/** The music of a frame drawn by pdf.js, as the reader draws it. */
async function drawnMusic(src: Source, frame: Frame): Promise<HTMLCanvasElement> {
  const nums = [...new Set(frame.items.map((p) => p.cut.page))];
  const pages = new Map(await Promise.all(nums.map(async (n) => [n, await src.cache.render(n + 1, RASTER_W, Math.round(RASTER_W * src.aspects[n]), 1)] as const)));
  const canvas = Object.assign(document.createElement('canvas'), { width: RASTER_W, height: Math.round(RASTER_W * frameHeight(src.aspects)) });
  drawFrame(canvas.getContext('2d')!, frame, RASTER_W, (n) => pages.get(n), src.aspects);
  src.cache.keepOnly([], () => undefined);
  return canvas;
}

async function addFrame(lib: PdfLib, out: PDFDocument, src: Source, frame: Frame) {
  const W = src.width, H = W * frameHeight(src.aspects);
  const page = out.addPage([W, H]);
  if (src.doc) await drawMusic(lib, out, page, src as Source & { doc: PDFDocument }, frame, W, H);
  else page.drawImage(await out.embedJpg(await pngOrJpeg(await drawnMusic(src, frame), 'image/jpeg')), { x: 0, y: 0, width: W, height: H });
  const ink = src.state.ink;
  if (!frame.items.some((p) => (ink[p.cut.id] ?? []).some((m) => visible(m, p.cut, src.aspects[p.cut.page])))) return;
  const canvas = Object.assign(document.createElement('canvas'), { width: RASTER_W, height: Math.round(RASTER_W * frameHeight(src.aspects)) });
  drawFrameInk(canvas.getContext('2d')!, frame, ink, src.aspects, RASTER_W);
  page.drawImage(await out.embedPng(await pngOrJpeg(canvas, 'image/png')), { x: 0, y: 0, width: W, height: H });
}

/**
 * A PDF of the parts, one after another, each starting on a new page. `progress` hears how many
 * parts are done.
 */
export async function exportPdf(parts: readonly ExportPart[], title: string, progress?: (done: number, of: number) => void): Promise<Uint8Array> {
  const lib = await import('pdf-lib');
  const out = await lib.PDFDocument.create();
  out.setTitle(title);
  out.setCreator('Volti');
  const sources = new Map<string, Promise<Source>>();
  try {
    for (const [i, part] of parts.entries()) {
      const o = part.original;
      let p = sources.get(o.id);
      if (!p) sources.set(o.id, p = open(lib, o));
      const src = await p;
      const cuts = part.span ? spanCuts(src.state.score.cuts, part.span) : src.state.score.cuts;
      for (const frame of pack(cuts, src.aspects)) await addFrame(lib, out, src, frame);
      progress?.(i + 1, parts.length);
    }
    return await out.save();
  } finally {
    for (const p of sources.values()) void p.then((s) => s.cache.destroy(), () => {});
  }
}
