import { describe, expect, it } from 'vitest';
import { isJpeg, isPng, jpegOrientation } from './image-source';

/** A JPEG's start with an EXIF block saying `orientation`, in the given byte order. */
function jpegWith(orientation: number, little: boolean): Uint8Array {
  const tiff = new DataView(new ArrayBuffer(8 + 2 + 12 + 4));
  tiff.setUint16(0, little ? 0x4949 : 0x4d4d);
  tiff.setUint16(2, 42, little);
  tiff.setUint32(4, 8, little);
  tiff.setUint16(8, 1, little); // one entry
  tiff.setUint16(10, 0x0112, little); // Orientation
  tiff.setUint16(12, 3, little); // SHORT
  tiff.setUint32(14, 1, little);
  tiff.setUint16(18, orientation, little);
  const exif = [...new TextEncoder().encode('Exif'), 0, 0, ...new Uint8Array(tiff.buffer)];
  const size = exif.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, size >> 8, size & 255, ...exif, 0xff, 0xda, 0, 2]);
}

describe('jpegOrientation', () => {
  it('reads the orientation, in either byte order', () => {
    expect(jpegOrientation(jpegWith(6, false))).toBe(6);
    expect(jpegOrientation(jpegWith(3, true))).toBe(3);
  });
  it('is upright without EXIF', () => {
    expect(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0, 2, 0xff, 0xda, 0, 2]))).toBe(1);
  });
  it('tells JPEG from PNG', () => {
    expect(isJpeg(jpegWith(1, false))).toBe(true);
    expect(isPng(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10]))).toBe(true);
    expect(isPng(jpegWith(1, false))).toBe(false);
  });
});
