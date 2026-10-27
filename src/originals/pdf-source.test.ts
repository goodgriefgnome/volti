import { describe, expect, it } from 'vitest';
import { holds, isEncryptedPdf, isPdf, supersample } from './pdf-source';

describe('supersample', () => {
  it('draws at twice the size on a typical tablet page', () => {
    expect(supersample(1600, 2260)).toBe(2);
  });
  it('backs off on very large pages to save graphics memory', () => {
    expect(supersample(2400, 3400)).toBe(1.5);
    expect(supersample(4000, 5600)).toBe(1);
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
