// Reading an image file as an original of one page: decoding it once, and drawing it scaled for the
// screen or cut for a close-up. The page cache (pages.ts) keeps what is drawn.

import { PageCache, type PageSource } from './pages';

/** Open an image as a one-page original. */
export async function openImage(file: File): Promise<PageCache> {
  // Turned as the camera held it, where the image says so.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  return new PageCache(Promise.resolve(new ImageSource(bitmap)));
}

const canvasOf = (width: number, height: number) => Object.assign(document.createElement('canvas'), { width, height });

/** An image's one page. */
class ImageSource implements PageSource {
  readonly pages = 1;

  constructor(private bitmap: ImageBitmap) {}

  async aspect() { return this.bitmap.height / this.bitmap.width; }

  async draw(_num: number, width: number) {
    const { bitmap } = this;
    const canvas = canvasOf(width, Math.round((width * bitmap.height) / bitmap.width));
    const ctx = canvas.getContext('2d', { alpha: false })!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  async region(_num: number, pageWidth: number, region: { x: number; y: number; w: number; h: number }) {
    const { bitmap } = this;
    const scale = pageWidth / bitmap.width;
    const canvas = canvasOf(region.w, region.h);
    const ctx = canvas.getContext('2d', { alpha: false })!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, region.w, region.h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, region.x / scale, region.y / scale, region.w / scale, region.h / scale, 0, 0, region.w, region.h);
    return canvas;
  }

  destroy() {
    this.bitmap.close();
  }
}
