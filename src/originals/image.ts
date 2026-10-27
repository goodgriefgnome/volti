// An image's page, drawn from its decoded bitmap: an image is a score of one page, shown upright as
// its camera meant (EXIF orientation), with no PDF in between.

import type { PageSource } from './internal-types';
import { PageCache } from './pages';

/** Open an image's one page; throws when the browser can't read it. */
export async function openImage(file: File): Promise<PageCache> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    .catch((e: unknown) => { throw new Error('Neither a PDF nor an image this browser can read', { cause: e }); });
  return new PageCache(Promise.resolve(new ImageSource(bitmap)));
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
class ImageSource implements PageSource {
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
