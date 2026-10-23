import { describe, expect, it } from 'vitest';
import { endingOf, freeName, importName, isImageName, isOriginalName, tidyFolder, titleOf } from './names';

describe('importName', () => {
  it('keeps a PDF\'s own name', () => {
    expect(importName('Sonata 3.pdf')).toBe('Sonata 3.pdf');
    expect(importName('Mass.PDF')).toBe('Mass.PDF');
  });

  it('keeps digits a name ends in, adding .pdf to a name without it', () => {
    expect(importName('Come_People_Of_The_Risen_King3420.pdf')).toBe('Come_People_Of_The_Risen_King3420.pdf');
    expect(importName('Come_People_Of_The_Risen_King3420')).toBe('Come_People_Of_The_Risen_King3420.pdf');
  });
});

describe('images', () => {
  it('counts images as originals, by their endings', () => {
    expect(isOriginalName('Ave verum.JPG')).toBe(true);
    expect(isOriginalName('Ave verum.heic')).toBe(true);
    expect(isOriginalName('notes.txt')).toBe(false);
    expect(isImageName('Mass.pdf')).toBe(false);
    expect(isImageName('Page 1.png')).toBe(true);
  });
  it('titles an image without its ending, and keeps the ending when importing and freeing a name', () => {
    expect(titleOf('Ave verum.jpeg')).toBe('Ave verum');
    expect(importName('Ave verum.jpg', 'image/jpeg')).toBe('Ave verum.jpg');
    expect(importName('IMG_0042', 'image/jpeg')).toBe('IMG_0042.jpg');
    expect(importName('scan', 'image/png')).toBe('scan.png');
    expect(freeName('Ave verum.jpg', new Set(['ave verum.jpg']))).toBe('Ave verum (2).jpg');
    expect(endingOf('Ave verum.webp')).toBe('.webp');
  });
});

describe('tidyFolder', () => {
  it('trims the parts of a path and drops empty ones', () => {
    expect(tidyFolder(' Masses / Latin/ ')).toBe('Masses/Latin');
    expect(tidyFolder(' / ')).toBe('');
  });
});
