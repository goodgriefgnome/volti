// An image as a one-page PDF, for export, upright; pdf-lib is only loaded when it is needed. The
// image is drawn by the browser, never read as a PDF.

import { isJpeg, isPng, jpegOrientation } from './file-kind';
import { A4_W, encode } from './pdf-source';
import type { RenderedPdf } from './types';

/**
 * An image as a one-page PDF, upright, for export: a JPEG or PNG put in as it is; a JPEG that has
 * to be turned to be upright, or another kind of image, drawn upright and put in as a JPEG (a
 * photo: `recompressed`, as JPEG loses some of it again) or a PNG (which loses nothing).
 */
export async function imagePdf(file: File): Promise<RenderedPdf> {
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
