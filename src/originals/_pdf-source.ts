// Everything that is only about PDFs: reading one with pdf.js (opening it, the shapes of its pages,
// drawing them), the password flow, decryption (by our fork of pdf-decrypt), telling a PDF by its
// first bytes and an encrypted one by its ends, and the music as a PDF pdf.js and pdf-lib can both
// read: the PDF as it is, decrypted, or where it can't be had as it is (an encryption pdf-decrypt
// doesn't know, or a PDF pdf-lib can't read), its pages drawn into a PDF of pictures. All use of
// pdf.js is here; the page cache (page-cache/) keeps what is drawn. pdf-lib and pdf-decrypt are
// only loaded when needed.
//
// The password that opened a PDF is remembered on the tablet by its file's id, so it is asked for
// only once, even after a restart, and never forgotten. Asking is the caller's
// (dialogs/passwords.ts); without a way to ask, a PDF whose password isn't remembered doesn't open.

// The legacy build carries fallbacks for JavaScript features newer than some Android Chrome versions.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

import { _contents, _noteContents } from './_record-store';
import type { Crop } from '../page-cache/types';
import type { Content, OpenPages, Readable } from './_types';
import { titleOf } from './path-utils';
import { PasswordNotGiven, type AskPassword, type RenderedPdf, type SourceFile } from './types';

/** How far into a file a PDF's header may start. */
const PDF_HEADER_WITHIN = 1024;
const PDF_HEADER = new TextEncoder().encode('%PDF-');

/** Whether a file's first bytes (at least its first 1 KB, where it is that long) say it is a PDF. */
export function isPdf(b: Uint8Array): boolean {
  outer: for (let i = 0; i + PDF_HEADER.length <= Math.min(b.length, PDF_HEADER_WITHIN + PDF_HEADER.length); i++) {
    for (let j = 0; j < PDF_HEADER.length; j++) if (b[i + j] !== PDF_HEADER[j]) continue outer;
    return true;
  }
  return false;
}

/** Whether `bytes` holds `word`. */
export function holds(bytes: Uint8Array, word: Uint8Array): boolean {
  outer: for (let i = 0; i + word.length <= bytes.length; i++) {
    for (let j = 0; j < word.length; j++) if (bytes[i + j] !== word[j]) continue outer;
    return true;
  }
  return false;
}

/**
 * How much of each end of a PDF to look through for its encryption: its trailer is at the end, or
 * for one laid out for the web (linearized), at the start too.
 */
const PDF_ENDS = 64 * 1024;
const ENCRYPT = new TextEncoder().encode('/Encrypt');

/** Whether some of a PDF's bytes (its ends) name an /Encrypt dictionary, as an encrypted one's trailer does. */
const namesEncrypt = (b: Uint8Array) => holds(b, ENCRYPT);

/** Whether a PDF, all of whose bytes are `b`, is encrypted, by its ends. */
export const isEncryptedPdf = (b: Uint8Array) => namesEncrypt(b.subarray(0, PDF_ENDS)) || namesEncrypt(b.subarray(Math.max(0, b.length - PDF_ENDS)));

/** The password remembered for a file, if it has needed one. */
const savedPassword = (id: string) => _contents(id).password;

/**
 * The passwords to try for an original's PDF, once it has been tried without one: the one
 * remembered for it, then each one `ask` gives. `refused` once there are no more.
 */
class Passwords {
  private tried?: string;
  refused = false;

  private constructor(private o: SourceFile, private saved: string | undefined, private ask?: AskPassword) {}

  static async for(o: SourceFile, ask?: AskPassword) { return new Passwords(o, savedPassword(o.id), ask); }

  /** The next password to try, after one that was `wrong`: null when there is none. */
  async next(wrong: boolean): Promise<string | null> {
    if (this.saved !== undefined && this.tried === undefined) return (this.tried = this.saved);
    const p = this.ask ? await this.ask(titleOf(this.o.path), wrong || this.tried !== undefined) : null;
    if (p === null) this.refused = true;
    else this.tried = p;
    return p;
  }

  /** The PDF opened: remember the password that opened it, if it is a new one. */
  async keep() {
    if (this.tried !== undefined && this.tried !== this.saved) await _noteContents(this.o.id, { password: this.tried });
  }

  /** Why opening stopped: PasswordNotGiven when it was for want of a password. */
  failure(e: unknown) {
    return this.refused ? new PasswordNotGiven(`“${titleOf(this.o.path)}” needs its password`) : e;
  }
}

/** How many pixels wide a page is drawn when its music can't be had as it is. */
const DRAWN_W = 2000;
/** The width, in points, of a page made for an image, or of a drawn page: A4's. */
export const A4_W = 595;

/** Whether a PDF is encrypted, reading only its ends (as isEncryptedPdf does). */
async function encrypted(file: File): Promise<boolean> {
  const ends = file.size <= 2 * PDF_ENDS ? [file] : [file.slice(0, PDF_ENDS), file.slice(file.size - PDF_ENDS)];
  for (const part of ends) if (namesEncrypt(new Uint8Array(await part.arrayBuffer()))) return true;
  return false;
}

/**
 * Read a PDF: one with a password Volti doesn't know yet asks for it now (its music, worked out to
 * try it, is kept for its pages), and otherwise its music is read only when its pages or its PDF
 * are wanted.
 */
export async function readPdf(f: Readable, ask?: AskPassword): Promise<Content> {
  const file = await f.file();
  const known = !(await encrypted(file)) || savedPassword(f.id) !== undefined;
  return new PdfContent(f, known ? undefined : await pdfOf(f, file, ask));
}

class PdfContent implements Content {
  /** Its music, worked out when it was read, until its pages or its PDF take it. */
  constructor(private f: Readable, private held?: RenderedPdf) {}

  async pdf(): Promise<RenderedPdf> {
    const held = this.held;
    this.held = undefined; // pdf.js takes the bytes it is given
    return held ?? pdfOf(this.f, await this.f.file());
  }

  async pages(): Promise<OpenPages> {
    return openPdf((await this.pdf()).bytes);
  }
}

/**
 * The PDF `o`, whose bytes are `file`, as a PDF pdf-lib and pdf.js can read. An encrypted one
 * tries the password remembered for it, then asks `ask` (with none, it gives up:
 * PasswordNotGiven), and remembers the one that opens it.
 */
async function pdfOf(o: SourceFile, file: File, ask?: AskPassword): Promise<RenderedPdf> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const lib = await import('pdf-lib');
  /** The PDF as it is, where pdf-lib can read it. */
  const asItIs = async (): Promise<RenderedPdf> => {
    try {
      await lib.PDFDocument.load(bytes);
    } catch (e) {
      console.warn('Drawing the pages, as pdf-lib can\'t read them:', e);
      return pagesDrawn(o, bytes, ask, 'unreadable');
    }
    return { bytes };
  };
  if (!isEncryptedPdf(bytes)) return asItIs();
  const { decryptPDF } = await import('@pdfsmaller/pdf-decrypt');
  // First without a password, as a PDF that only limits what may be done with it has none.
  const passwords = await Passwords.for(o, ask);
  let password = '';
  for (let wrong = false; ; wrong = true) {
    let decrypted: Uint8Array;
    try {
      decrypted = await decryptPDF(bytes, password);
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      // Its ends named /Encrypt, but not as its encryption.
      if (message.includes('not encrypted')) return asItIs();
      if (message.includes('Incorrect password')) {
        const next = await passwords.next(wrong);
        if (next === null) throw passwords.failure(e);
        password = next;
        continue;
      }
      console.warn('Drawing the pages, as they can\'t be decrypted:', e);
      return pagesDrawn(o, bytes, ask, message.includes('Unsupported encryption') ? 'encryption' : 'unreadable');
    }
    await passwords.keep();
    try {
      await lib.PDFDocument.load(decrypted);
    } catch (e) {
      console.warn('Drawing the pages, as pdf-lib can\'t read them decrypted:', e);
      return pagesDrawn(o, bytes, ask, 'unreadable');
    }
    return { bytes: decrypted };
  }
}

/** A PDF of each page of `bytes` drawn by pdf.js, with the password if it needs one. */
async function pagesDrawn(o: SourceFile, bytes: Uint8Array, ask: AskPassword | undefined, why: 'encryption' | 'unreadable'): Promise<RenderedPdf> {
  const passwords = await Passwords.for(o, ask);
  const source = await openPdf(bytes, (wrong) => passwords.next(wrong)).catch((e: unknown) => { throw passwords.failure(e); });
  try {
    await passwords.keep();
    const lib = await import('pdf-lib');
    const out = await lib.PDFDocument.create();
    for (let num = 1; num <= source.pages; num++) {
      const aspect = await source.aspect(num);
      const canvas = await source.draw(num, DRAWN_W, undefined, new AbortController().signal);
      const image = await out.embedJpg(await encode(canvas, 'image/jpeg'));
      canvas.width = canvas.height = 0; // free its memory now rather than at garbage collection
      out.addPage([A4_W, A4_W * aspect]).drawImage(image, { x: 0, y: 0, width: A4_W, height: A4_W * aspect });
    }
    return { bytes: await out.save(), lossyReason: why };
  } finally {
    source.destroy();
  }
}

export async function encode(canvas: HTMLCanvasElement, type: 'image/jpeg' | 'image/png'): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
  if (!blob) throw new Error('Could not draw a page');
  return new Uint8Array(await blob.arrayBuffer());
}

const assets = import.meta.env.BASE_URL + 'pdfjs/';

/**
 * Open a PDF, which takes `data` (it can't be used again). One protected by a password asks
 * `password` for it, saying whether the last one was wrong; null gives up, and the opening fails.
 */
export async function openPdf(data: Uint8Array, password?: (wrong: boolean) => Promise<string | null>): Promise<PdfSource> {
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
  return new PdfSource(doc);
}

/** Largest canvas drawn while supersampling, in pixels; bigger ones risk running out of graphics memory. */
const MAX_SUPERSAMPLE_PIXELS = 24e6;

/** How much larger than the screen to draw a page before shrinking it: 2 where memory allows. */
export function supersample(width: number, height: number): number {
  const room = Math.sqrt(MAX_SUPERSAMPLE_PIXELS / (width * height));
  return room >= 2 ? 2 : room >= 1.5 ? 1.5 : 1;
}

/** A PDF's pages, drawn by pdf.js. */
export class PdfSource implements OpenPages {
  constructor(private doc: pdfjs.PDFDocumentProxy) {}

  get pages() { return this.doc.numPages; }

  async aspect(num: number) {
    const vp = (await this.doc.getPage(num)).getViewport({ scale: 1 });
    return vp.height / vp.width;
  }

  /** Draw a page `pxWidth` device pixels wide, or `crop` of it (in those pixels). */
  async draw(num: number, pxWidth: number, crop: Crop | undefined, signal: AbortSignal): Promise<HTMLCanvasElement> {
    signal.throwIfAborted();
    const page = await this.doc.getPage(num);
    try {
      signal.throwIfAborted();
      const base = page.getViewport({ scale: 1 });
      const scale = pxWidth / base.width;
      const height = Math.round(base.height * scale);
      // Draw larger, then shrink with high-quality smoothing: this keeps staff lines even
      // and stops scanned pages from looking jagged. Depends on the page only, not the crop.
      const ss = supersample(pxWidth, height);
      const outW = crop?.w ?? pxWidth, outH = crop?.h ?? height;
      const big = document.createElement('canvas');
      const viewport = page.getViewport({ scale: scale * ss });
      big.width = crop ? Math.round(crop.w * ss) : Math.round(viewport.width);
      big.height = crop ? Math.round(crop.h * ss) : Math.round(viewport.height);
      const task = page.render({
        canvas: big,
        viewport,
        background: '#ffffff',
        ...(crop && { transform: [1, 0, 0, 1, -crop.x * ss, -crop.y * ss] }),
      });
      const cancel = () => task.cancel();
      signal.addEventListener('abort', cancel, { once: true });
      try {
        await task.promise;
      } catch (e) {
        big.width = big.height = 0;
        if (signal.aborted) signal.throwIfAborted();
        throw e;
      } finally {
        signal.removeEventListener('abort', cancel);
      }
      signal.throwIfAborted();
      if (ss === 1) return big;
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d', { alpha: false })!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(big, 0, 0, outW, outH);
      big.width = big.height = 0; // free its memory now rather than at garbage collection
      return canvas;
    } finally {
      page.cleanup();
    }
  }

  /** Close the document, freeing it in the worker: its loading task does that. */
  destroy() {
    void this.doc.loadingTask.destroy();
  }
}
