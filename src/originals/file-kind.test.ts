import { describe, expect, it } from 'vitest';
import { holds, isEncryptedPdf, isJpeg, isPdf, isPng, jpegOrientation } from './file-kind';

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

describe('isPdf', () => {
  const bytes = (s: string) => new TextEncoder().encode(s);
  it('finds the header at the start, or after some junk within the first 1 KB', () => {
    expect(isPdf(bytes('%PDF-1.7\n'))).toBe(true);
    expect(isPdf(bytes('x'.repeat(1000) + '%PDF-1.4'))).toBe(true);
  });
  it('is not fooled by a header further in, or by an image', () => {
    expect(isPdf(bytes('x'.repeat(2000) + '%PDF-1.4'))).toBe(false);
    expect(isPdf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(false);
    expect(isPdf(bytes('%PDF'))).toBe(false);
  });
});

const text = (s: string) => new TextEncoder().encode(s);

describe('holds', () => {
  it('finds a word anywhere in the bytes', () => {
    expect(holds(text('trailer << /Size 9 /Encrypt 7 0 R >>'), text('/Encrypt'))).toBe(true);
    expect(holds(text('/Encrypt'), text('/Encrypt'))).toBe(true);
  });
  it('misses a word that is only partly there', () => {
    expect(holds(text('trailer << /Size 9 /Encryp'), text('/Encrypt'))).toBe(false);
    expect(holds(text(''), text('/Encrypt'))).toBe(false);
  });
});

describe('isEncryptedPdf', () => {
  it('finds /Encrypt in a trailer at either end, but not in the middle of a big file', () => {
    const middle = 'x'.repeat(200 * 1024);
    expect(isEncryptedPdf(text(`%PDF-1.7 ${middle} trailer << /Encrypt 9 0 R >>`))).toBe(true);
    expect(isEncryptedPdf(text(`%PDF-1.7 trailer << /Encrypt 9 0 R >> ${middle}`))).toBe(true);
    expect(isEncryptedPdf(text(`%PDF-1.7 ${middle}/Encrypt${middle}`))).toBe(false);
    expect(isEncryptedPdf(text('%PDF-1.7 trailer << /Root 1 0 R >>'))).toBe(false);
  });
});
