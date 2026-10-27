// Source files and originals. A source file is bytes Volti can read as music, known by the hash of
// its contents: a file at its path in the library's root (the linked scores folder, or the app's
// own), which can be moved (renamed, or into another folder) and removed (into Recently removed),
// asking for the access to the scores folder that needs; or a file Volti holds outside the library
// (coming in, left in its own folder while one is linked, or in Recently removed: adding.ts), which
// moving puts into the library. Reading one gives its original: its
// pages to draw, and its music as a PDF for export. A PDF is read with pdf.js (contents.ts), asking
// for its password the first time it needs one; an image is drawn from its decoded bitmap
// (image.ts). There is one source file for each id in the root, so a move shows wherever it is held.

import { imagePdf, pdfOf, savedPassword } from './contents';
import { isPdf, namesEncrypt, PDF_ENDS } from './file-kind';
import { openImage } from './image';
import type { Readable } from './internal-types';
import type { PageCache } from './pages';
import { openPdf } from './pdf';
import type { AskPassword, Original, RenderedPdf } from './types';

/** Whether a PDF is encrypted, reading only its ends (file-kind.ts). */
async function encrypted(file: File): Promise<boolean> {
  const ends = file.size <= 2 * PDF_ENDS ? [file] : [file.slice(0, PDF_ENDS), file.slice(file.size - PDF_ENDS)];
  for (const part of ends) if (namesEncrypt(new Uint8Array(await part.arrayBuffer()))) return true;
  return false;
}

/**
 * Read a source file: an image as it is; a PDF asks for its password now if it has one Volti
 * doesn't know yet (its music, worked out to try it, is kept for its pages), and otherwise reads
 * its music only when its pages or its PDF are wanted.
 */
export async function readAs(f: Readable, ask?: AskPassword): Promise<Original> {
  const file = await f.file();
  if (!isPdf(new Uint8Array(await file.slice(0, 2048).arrayBuffer()))) return new ImageOriginal(f);
  const known = !(await encrypted(file)) || (await savedPassword(f.id)) !== undefined;
  return new PdfOriginal(f, known ? undefined : await pdfOf(f, file, ask));
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
  /** Its music, worked out when it was read, until its pages or its PDF take it. */
  constructor(f: Readable, private held?: RenderedPdf) { super(f); }

  async pdf(): Promise<RenderedPdf> {
    const held = this.held;
    this.held = undefined; // pdf.js takes the bytes it is given
    return held ?? pdfOf(this.f, await this.f.file());
  }

  async pages(): Promise<PageCache> {
    return openPdf((await this.pdf()).bytes);
  }
}

class ImageOriginal extends BaseOriginal {
  async pdf(): Promise<RenderedPdf> { return imagePdf(await this.f.file()); }
  async pages(): Promise<PageCache> { return openImage(await this.f.file()); }
}
