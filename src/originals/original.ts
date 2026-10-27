// Source files and originals. A source file is bytes Volti can read as music, known by the hash of
// its contents: a file at its path in the library's root (the linked scores folder, or the app's
// own), which can be moved (renamed, or into another folder) and removed (into Recently removed),
// asking for the access to the scores folder that needs; or a file Volti holds outside the library
// (coming in, left in its own folder while one is linked, or in Recently removed: adding.ts), which
// moving puts into the library. Reading one gives its original: its
// pages to draw, and its music as a PDF for export. A PDF is read with pdf.js (contents.ts), asking
// for its password the first time it needs one; an image is drawn from its decoded bitmap
// (image.ts). There is one source file for each id in the root, so a move shows wherever it is held.

import { imagePdf } from './contents';
import { openImage } from './image';
import type { Content, Readable } from './internal-types';
import { PageCache } from './pages';
import { isPdf, readPdf } from './pdf-source';
import type { AskPassword, Original, RenderedPdf } from './types';

/**
 * Read a source file: an image as it is; a PDF asks for its password now if it has one Volti
 * doesn't know yet, and otherwise reads its music only when its pages or its PDF are wanted
 * (pdf-source.ts).
 */
export async function readAs(f: Readable, ask?: AskPassword): Promise<Original> {
  const file = await f.file();
  if (!isPdf(new Uint8Array(await file.slice(0, 2048).arrayBuffer()))) return new ImageOriginal(f);
  return new PdfOriginal(f, await readPdf(f, ask));
}

/** An original: its file's id, path, moving and removing, and itself as what reading it gives. */
abstract class BaseOriginal implements Original {
  constructor(protected f: Readable) {}
  get id() { return this.f.id; }
  get path() { return this.f.path; }
  move(path: string) { return this.f.move(path); }
  remove() { return this.f.remove(); }
  async read() { return this; }
  abstract pages(): Promise<PageCache>;
  abstract pdf(): Promise<RenderedPdf>;
}

class PdfOriginal extends BaseOriginal {
  constructor(f: Readable, private content: Content) { super(f); }
  pdf() { return this.content.pdf(); }
  async pages(): Promise<PageCache> { return new PageCache(Promise.resolve(await this.content.pages())); }
}

class ImageOriginal extends BaseOriginal {
  async pdf(): Promise<RenderedPdf> { return imagePdf(await this.f.file()); }
  async pages(): Promise<PageCache> { return openImage(await this.f.file()); }
}
