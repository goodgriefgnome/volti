// Everything that is only about images: an image is a score of one page, shown upright as its camera
// meant (EXIF orientation), drawn from its decoded bitmap with no PDF in between; for export it is a
// one-page PDF, put in as it is where that loses nothing. Telling a JPEG or a PNG by its first bytes
// and which way up a JPEG is meant to be shown is pure. pdf-lib is only loaded when it is needed.

import type { Content, PageSource, Readable } from './_types';
import { A4_W, encode } from './_pdf-source';
import type { _RenderedPdf } from './types';

export const isJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8;
export const isPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

/**
 * A JPEG's EXIF orientation (1 to 8; 1, the default, is upright as stored). Cameras store photos as
 * the sensor saw them and say here how to turn them; a PDF viewer doesn't, so a JPEG that needs
 * turning has to be drawn upright before it goes in a PDF.
 */
export function jpegOrientation(b: Uint8Array): number {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = 2;
  while (at + 4 <= b.length && b[at] === 0xff) {
    const marker = b[at + 1], size = view.getUint16(at + 2);
    // APP1 holding "Exif\0\0", then a TIFF header and its first directory.
    if (marker === 0xe1 && view.getUint32(at + 4) === 0x45786966) {
      const tiff = at + 10, little = view.getUint16(tiff) === 0x4949;
      const dir = tiff + view.getUint32(tiff + 4, little);
      const count = view.getUint16(dir, little);
      for (let i = 0; i < count; i++) {
        const entry = dir + 2 + i * 12;
        if (view.getUint16(entry, little) === 0x0112) return view.getUint16(entry + 8, little);
      }
      return 1;
    }
    if (marker === 0xda) break; // the image data: no more headers
    at += 2 + size;
  }
  return 1;
}

/** Open an image's one page; throws when the browser can't read it. */
export async function openImage(file: File): Promise<ImageSource> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    .catch((e: unknown) => { throw new Error('Neither a PDF nor an image this browser can read', { cause: e }); });
  return new ImageSource(bitmap);
}

/** Read an image: decoded when its pages are wanted, and made into a one-page PDF only when exporting. */
export const readImage = (f: Readable): Content => ({
  pages: async () => openImage(await f.file()),
  pdf: async () => imagePdf(await f.file()),
});

/**
 * An image as a one-page PDF, upright, for export: a JPEG or PNG put in as it is; a JPEG that has
 * to be turned to be upright, or another kind of image, drawn upright and put in as a JPEG (a
 * photo: `recompressed`, as JPEG loses some of it again) or a PNG (which loses nothing).
 */
export async function imagePdf(file: File): Promise<_RenderedPdf> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    .catch((e: unknown) => { throw new Error('Neither a PDF nor an image this browser can read', { cause: e }); });
  try {
    const lib = await import('pdf-lib');
    const out = await lib.PDFDocument.create();
    const asItIs = (isJpeg(bytes) && jpegOrientation(bytes) === 1) || isPng(bytes);
    const photo = isJpeg(bytes) || file.type === 'image/jpeg';
    const image = isJpeg(bytes) && asItIs ? await out.embedJpg(bytes)
      : isPng(bytes) ? await out.embedPng(bytes)
      : photo ? await out.embedJpg(await encode(drawUpright(bitmap), 'image/jpeg'))
      : await out.embedPng(await encode(drawUpright(bitmap), 'image/png'));
    const height = A4_W * (bitmap.height / bitmap.width);
    out.addPage([A4_W, height]).drawImage(image, { x: 0, y: 0, width: A4_W, height });
    return { bytes: await out.save(), lossyReason: !asItIs && photo ? 'recompressed' : undefined };
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

/** A blank canvas `w` × `h`, white, to draw an image on. */
function sheet(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return [canvas, ctx];
}

/** An image's page, from its bitmap, held while it is open. */
export class ImageSource implements PageSource {
  readonly pages = 1;

  constructor(private bitmap: ImageBitmap) {}

  async aspect() { return this.bitmap.height / this.bitmap.width; }

  /** Draw it `width` device pixels wide, resized by the browser at high quality. */
  async draw(_num: number, width: number): Promise<HTMLCanvasElement> {
    const height = Math.round(width * this.bitmap.height / this.bitmap.width);
    const resized = await createImageBitmap(this.bitmap, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
    const [canvas, ctx] = sheet(width, height);
    ctx.drawImage(resized, 0, 0);
    resized.close();
    return canvas;
  }

  /** Draw it `pageWidth` pixels wide, and cut `region` (in those pixels) out of it. */
  async region(_num: number, pageWidth: number, region: { x: number; y: number; w: number; h: number }): Promise<HTMLCanvasElement> {
    const s = this.bitmap.width / pageWidth;
    const [canvas, ctx] = sheet(region.w, region.h);
    ctx.drawImage(this.bitmap, region.x * s, region.y * s, region.w * s, region.h * s, 0, 0, region.w, region.h);
    return canvas;
  }

  destroy() {
    this.bitmap.close();
  }
}
