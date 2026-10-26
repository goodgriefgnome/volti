// What an original holds, as a PDF, whatever its file is (told by its contents, not its name): a PDF
// as it is; an encrypted one decrypted, with its password; an image as a one-page PDF; and where the
// music can't be had as it is (an encryption pdf-decrypt doesn't know, or a PDF pdf-lib can't
// read), its pages drawn by pdf.js into a PDF of pictures. pdf-lib and pdf-decrypt are only loaded
// when needed.

import type { PDFDocument } from 'pdf-lib';
import { isJpeg, isPdf, isPng, jpegOrientation } from './file-kind';
import { Passwords, type AskPassword } from './open';
import type { Original } from './original';
import { openPdf } from './pdf';

/** An original as a PDF. */
export interface OriginalPdf {
  /** An unencrypted PDF that pdf-lib can read, new each time: pdf.js takes the bytes it is given. */
  bytes: Uint8Array;
  /** Why its pages had to be drawn, as its music couldn't be had as it is; false when it could. */
  drawn: false | 'encryption' | 'unreadable';
}

/** How many pixels wide a page is drawn when its music can't be had as it is. */
const DRAWN_W = 2000;
/** The width, in points, of a page made for an image, or of a drawn page: A4's. */
const A4_W = 595;

/**
 * Original `o`, whose file is `file`, as a PDF. An encrypted one tries the password remembered
 * for it, then asks `ask` (with none, it gives up: PasswordNotGiven), and remembers the one that
 * opens it. Throws when the file is neither a PDF nor an image the browser can read.
 */
export async function pdfOf(o: Original, file: File, ask?: AskPassword): Promise<OriginalPdf> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isPdf(bytes)) return { bytes: await imagePdf(file, bytes), drawn: false };
  const lib = await import('pdf-lib');
  let doc: PDFDocument;
  try {
    doc = await lib.PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch (e) {
    console.warn('Drawing the pages, as pdf-lib can\'t read them:', e);
    return drawn(o, bytes, ask, 'unreadable');
  }
  if (!doc.isEncrypted) return { bytes, drawn: false };
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
      if (message.includes('Incorrect password')) {
        const next = await passwords.next(wrong);
        if (next === null) throw passwords.failure(e);
        password = next;
        continue;
      }
      console.warn('Drawing the pages, as they can\'t be decrypted:', e);
      return drawn(o, bytes, ask, message.includes('Unsupported encryption') ? 'encryption' : 'unreadable');
    }
    await passwords.keep();
    try {
      await lib.PDFDocument.load(decrypted);
    } catch (e) {
      console.warn('Drawing the pages, as pdf-lib can\'t read them decrypted:', e);
      return drawn(o, bytes, ask, 'unreadable');
    }
    return { bytes: decrypted, drawn: false };
  }
}

/** A PDF of each page of `bytes` drawn by pdf.js, with the password if it needs one. */
async function drawn(o: Original, bytes: Uint8Array, ask: AskPassword | undefined, why: 'encryption' | 'unreadable'): Promise<OriginalPdf> {
  const passwords = await Passwords.for(o, ask);
  const cache = await openPdf(bytes, (wrong) => passwords.next(wrong)).catch((e: unknown) => { throw passwords.failure(e); });
  try {
    await passwords.keep();
    const lib = await import('pdf-lib');
    const out = await lib.PDFDocument.create();
    for (const [i, aspect] of (await cache.allAspects()).entries()) {
      const canvas = await cache.render(i + 1, DRAWN_W, Math.round(DRAWN_W * aspect), 1);
      const image = await out.embedJpg(await encode(canvas, 'image/jpeg'));
      cache.keepOnly([], () => undefined);
      canvas.width = canvas.height = 0; // free its memory now rather than at garbage collection
      out.addPage([A4_W, A4_W * aspect]).drawImage(image, { x: 0, y: 0, width: A4_W, height: A4_W * aspect });
    }
    return { bytes: await out.save(), drawn: why };
  } finally {
    cache.destroy();
  }
}

/**
 * An image as a one-page PDF, upright: a JPEG or PNG put in as it is; a JPEG that has to be turned
 * to be upright, or another kind of image, drawn upright and put in as a JPEG (a photo) or a PNG.
 */
async function imagePdf(file: File, bytes: Uint8Array): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    .catch((e: unknown) => { throw new Error('Neither a PDF nor an image this browser can read', { cause: e }); });
  try {
    const lib = await import('pdf-lib');
    const out = await lib.PDFDocument.create();
    const photo = isJpeg(bytes) || file.type === 'image/jpeg';
    const image = isJpeg(bytes) && jpegOrientation(bytes) === 1 ? await out.embedJpg(bytes)
      : isPng(bytes) ? await out.embedPng(bytes)
      : photo ? await out.embedJpg(await encode(drawUpright(bitmap), 'image/jpeg'))
      : await out.embedPng(await encode(drawUpright(bitmap), 'image/png'));
    const height = A4_W * (bitmap.height / bitmap.width);
    out.addPage([A4_W, height]).drawImage(image, { x: 0, y: 0, width: A4_W, height });
    return await out.save();
  } finally {
    bitmap.close();
  }
}

/** An image drawn upright on white. */
function drawUpright(bitmap: ImageBitmap): HTMLCanvasElement {
  const canvas = Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height });
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  return canvas;
}

async function encode(canvas: HTMLCanvasElement, type: 'image/jpeg' | 'image/png'): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
  if (!blob) throw new Error('Could not draw a page');
  return new Uint8Array(await blob.arrayBuffer());
}
