// Exporting scores as PDFs that read as the reader does in 1-page mode: a page for each frame, the
// music cut from the original's pages, and the markings over it as annotations. The music stays as it is in the
// original (vectors, or the scan) where pdf-lib can read the original, decrypting an encrypted
// one first, and is drawn by pdf.js where it can't (an encryption pdf-decrypt doesn't know, say).
// pdf-lib and pdf-decrypt are only loaded to export.

import type { PDFDocument, PDFEmbeddedPage, PDFPage } from 'pdf-lib';
import { spanCuts, type Span } from '../excerpts/span';
import { openOriginal, savedPassword, type AskPassword } from '../originals/open';
import type { Original } from '../originals/originals';
import type { PageCache } from '../originals/pdf';
import { cutTarget, drawFrame, shownOn } from '../render/paint';
import { pack, type Frame } from '../scores/frames';
import type { Aspects, State } from '../scores/model';
import { loadScore } from '../scores/store';
import { annotate } from './annotations';
import { placeCut, shownSize, type SourcePage } from './placement';

/** One part of an export: a score, whole or the excerpt `span` of it. Each starts on a new page. */
export interface ExportPart { original: Original; span?: Span }

type PdfLib = typeof import('pdf-lib');

/** How many pixels wide music pdf-lib can't read is drawn for a page. */
const RASTER_W = 2000;
/** The page width, in points, when pdf-lib can't read the original: A4. */
const A4_W = 595;

/** An original open for exporting: its score, pdf.js's copy and pdf-lib's (null when it can't read it). */
interface Source {
  state: State;
  aspects: Aspects;
  cache: PageCache;
  doc: PDFDocument | null;
  /** Each original page's width as shown, in points: an exported page is as wide as its frame's first. */
  widths: number[];
  /** Its pages, each embedded in the export once, by 0-based page. */
  embedded: Map<number, Promise<PDFEmbeddedPage>>;
}

const sourcePage = (page: PDFPage): SourcePage => {
  const box = page.getCropBox();
  return { width: box.width, height: box.height, rotation: page.getRotation().angle };
};

/** Why pdf-lib can't have an original's music: its password isn't known yet, or it can't read it at all. */
type Unread = 'password' | 'encryption' | 'unreadable';

/**
 * pdf-lib's copy of an original, decrypted with its remembered password (or none, for a PDF that
 * only limits what may be done with it) where it is encrypted; or why there can't be one.
 */
async function musicOf(lib: PdfLib, o: Original): Promise<PDFDocument | Unread> {
  const bytes = new Uint8Array(await (await o.getFile()).arrayBuffer());
  try {
    const doc = await lib.PDFDocument.load(bytes, { ignoreEncryption: true });
    if (!doc.isEncrypted) return doc;
  } catch (e) {
    console.warn('Exporting by drawing the pages:', e);
    return 'unreadable';
  }
  const { decryptPDF } = await import('@pdfsmaller/pdf-decrypt');
  const password = (await savedPassword(o.id)) ?? '';
  try {
    return await lib.PDFDocument.load(await decryptPDF(bytes, password));
  } catch (e) {
    console.warn('Exporting by drawing the pages:', e);
    const message = e instanceof Error ? e.message : '';
    return message.includes('Incorrect password') ? 'password' : message.includes('Unsupported encryption') ? 'encryption' : 'unreadable';
  }
}

/**
 * The originals whose music would be exported as pictures of their pages, and why. One whose
 * password isn't known yet isn't among them: exporting asks for it.
 */
export async function drawnOriginals(originals: readonly Original[]): Promise<{ original: Original; why: 'encryption' | 'unreadable' }[]> {
  const lib = await import('pdf-lib');
  const out: { original: Original; why: 'encryption' | 'unreadable' }[] = [];
  // One at a time: a long setlist of scans would otherwise hold every one in memory at once.
  for (const o of new Map(originals.map((o) => [o.id, o])).values()) {
    const music = await musicOf(lib, o).catch(() => 'unreadable' as const);
    if (music === 'encryption' || music === 'unreadable') out.push({ original: o, why: music });
  }
  return out;
}

async function open(lib: PdfLib, o: Original, ask?: AskPassword): Promise<Source> {
  // Asks for the password, if it isn't known yet, which decrypting the music then uses.
  const cache = await openOriginal(o, ask);
  try {
    const aspects = await cache.allAspects();
    const { state } = await loadScore(o.id, o.title, aspects);
    const music = await musicOf(lib, o);
    const doc = typeof music === 'string' ? null : music;
    const widths = aspects.map((_, i) => (doc && i < doc.getPageCount() ? shownSize(sourcePage(doc.getPage(i))).width : A4_W));
    return { state, aspects, cache, doc, widths, embedded: new Map() };
  } catch (e) {
    cache.destroy();
    throw e;
  }
}

async function jpeg(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
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
  const canvas = Object.assign(document.createElement('canvas'), { width: RASTER_W, height: Math.round(RASTER_W * frame.aspect) });
  drawFrame(canvas.getContext('2d')!, frame, RASTER_W, (n) => pages.get(n), src.aspects);
  src.cache.keepOnly([], () => undefined);
  return canvas;
}

async function addFrame(lib: PdfLib, out: PDFDocument, src: Source, frame: Frame) {
  const W = src.widths[frame.items[0]?.cut.page ?? 0], H = W * frame.aspect;
  const page = out.addPage([W, H]);
  if (src.doc) await drawMusic(lib, out, page, src as Source & { doc: PDFDocument }, frame, W, H);
  else page.drawImage(await out.embedJpg(await jpeg(await drawnMusic(src, frame))), { x: 0, y: 0, width: W, height: H });
  // Each marking as an annotation, placed as the reader places it.
  for (const p of frame.items) {
    shownOn(p, src.state.ink, src.aspects).forEach((m, i) => annotate(lib, out, page, m, (draw) => cutTarget(draw, p, W, src.aspects), `${p.cut.id}-${i}`));
  }
}

/**
 * A PDF of the parts, one after another, each starting on a new page. `ask` asks for the password
 * of an original that needs one not known yet; `progress` hears how many parts are done.
 */
export async function exportPdf(parts: readonly ExportPart[], title: string, ask?: AskPassword, progress?: (done: number, of: number) => void): Promise<Uint8Array> {
  const lib = await import('pdf-lib');
  const out = await lib.PDFDocument.create();
  out.setTitle(title);
  out.setCreator('Volti');
  const sources = new Map<string, Promise<Source>>();
  try {
    for (const [i, part] of parts.entries()) {
      const o = part.original;
      let p = sources.get(o.id);
      if (!p) sources.set(o.id, p = open(lib, o, ask));
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
