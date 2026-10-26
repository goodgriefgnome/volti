// What a file's bytes say it is, whatever its name: a PDF, or for an image to be put in a PDF as it
// is, a JPEG or a PNG, and which way up a JPEG is meant to be shown. Pure.

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
