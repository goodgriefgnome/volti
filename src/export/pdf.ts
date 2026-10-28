// Exporting scores as PDFs that read as the reader does in 1-page mode: a page for each frame, the
// music cut from the original's pages, and the markings over it as annotations. The music is the
// original as a PDF, as originals/ gives it: as it is in the file (vectors, the scan, or the image)
// where it can be, else pictures of its pages (an encryption pdf-decrypt doesn't know, say).
// pdf-lib is only loaded to export.

import type { PDFDocument, PDFEmbeddedPage, PDFPage } from 'pdf-lib';
import { spanCuts, type Span } from '../excerpts/span';
import { NoAccess, PasswordNotGiven, type AskPassword, type LossyReason, type SourceFile } from '../originals/types';
import { cutTarget, shownOn } from '../render/paint';
import { loadScore } from '../scores/store';
import { pack, type Frame } from '../scores/frames';
import { type Aspects, type State } from '../scores/model';
import { annotate } from './_annotations';
import { placeCut, shownSize, type SourcePage } from './_placement';

/** One part of an export: a score, whole or the excerpt `span` of it. Each starts on a new page. */
export interface ExportPart { original: SourceFile; span?: Span }

type PdfLib = typeof import('pdf-lib');

/** An original open for exporting: its score, its pages' shapes as the reader has them, and its music as a PDF, in pdf-lib. */
interface Source {
  state: State;
  aspects: Aspects;
  doc: PDFDocument;
  /** Each original page's width as shown, in points: an exported page is as wide as its frame's first. */
  widths: number[];
  /** Its pages, each embedded in the export once, by 0-based page. */
  embedded: Map<number, Promise<PDFEmbeddedPage>>;
}

const sourcePage = (page: PDFPage): SourcePage => {
  const box = page.getCropBox();
  return { width: box.width, height: box.height, rotation: page.getRotation().angle };
};

/** Why an original's music is pictures of its pages: an encryption pdf-decrypt doesn't know, or a PDF pdf-lib can't read. */
type DrawnReason = Extract<LossyReason, 'encryption' | 'unreadable'>;

/**
 * The originals whose music would be exported as pictures of their pages, and why. One whose
 * password isn't known yet isn't among them: exporting asks for it.
 */
export async function drawnOriginals(originals: readonly SourceFile[]): Promise<{ original: SourceFile; why: DrawnReason }[]> {
  const out: { original: SourceFile; why: DrawnReason }[] = [];
  // One at a time: a long setlist of scans would otherwise hold every one in memory at once.
  for (const o of new Map(originals.map((o) => [o.id, o])).values()) {
    const why = await o.read().then((r) => r.pdf()).then((pdf) => pdf.lossyReason, (e) => {
      if (e instanceof NoAccess) throw e; // not known, rather than drawn
      if (e instanceof PasswordNotGiven) return undefined;
      return 'unreadable' as const;
    });
    if (why === 'encryption' || why === 'unreadable') out.push({ original: o, why });
  }
  return out;
}

async function open(lib: PdfLib, f: SourceFile, ask?: AskPassword): Promise<Source> {
  // Asks for the password, if it isn't known yet, which decrypting the music then uses.
  const o = await f.read(ask);
  const aspects = await o.aspects();
  const { state } = await loadScore(o.id, aspects);
  const doc = await lib.PDFDocument.load((await o.pdf()).bytes);
  const widths = aspects.map((_, i) => shownSize(sourcePage(doc.getPage(i))).width);
  return { state, aspects, doc, widths, embedded: new Map() };
}

/** The music of a frame: each cut's band of its page, as it is. */
function drawMusic(lib: PdfLib, out: PDFDocument, page: PDFPage, src: Source, frame: Frame, W: number, H: number) {
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

async function addFrame(lib: PdfLib, out: PDFDocument, src: Source, frame: Frame) {
  const W = src.widths[frame.items[0]?.cut.page ?? 0], H = W * frame.aspect;
  const page = out.addPage([W, H]);
  await drawMusic(lib, out, page, src, frame, W, H);
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
}
