import { describe, expect, it } from 'vitest';
import { endingOf, folderOf, importName, isOriginalName, pathInFolder, pathWithTitle, tidyFolder, tidyPath, titleOf } from './names';

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
  });
  it('titles an image without its ending, and keeps the ending when importing', () => {
    expect(titleOf('Ave verum.jpeg')).toBe('Ave verum');
    expect(importName('Ave verum.jpg', 'image/jpeg')).toBe('Ave verum.jpg');
    expect(importName('IMG_0042', 'image/jpeg')).toBe('IMG_0042.jpg');
    expect(importName('scan', 'image/png')).toBe('scan.png');
    expect(endingOf('Ave verum.webp')).toBe('.webp');
  });
});

describe('tidyFolder', () => {
  it('trims the parts of a path and drops empty ones', () => {
    expect(tidyFolder(' Masses / Latin/ ')).toBe('Masses/Latin');
    expect(tidyFolder(' / ')).toBe('');
  });
});

describe('paths', () => {
  it('gives a title and a folder from a path', () => {
    expect(titleOf('Masses/Latin/Mass in G.pdf')).toBe('Mass in G');
    expect(folderOf('Masses/Latin/Mass in G.pdf')).toBe('Masses/Latin');
    expect(folderOf('Mass in G.pdf')).toBe('');
  });
  it('renames in the same folder, keeping the ending', () => {
    expect(pathWithTitle('Masses/Mass.jpg', ' Mass in G ')).toBe('Masses/Mass in G.jpg');
    expect(pathWithTitle('Mass.pdf', 'Kyrie')).toBe('Kyrie.pdf');
  });
  it('moves into a tidied folder, keeping the name', () => {
    expect(pathInFolder('Masses/Mass.pdf', ' Anthems / Easter/ ')).toBe('Anthems/Easter/Mass.pdf');
    expect(pathInFolder('Masses/Mass.pdf', '')).toBe('Mass.pdf');
  });
  it('tidies a path\'s folders', () => {
    expect(tidyPath(' Masses //Latin /Mass.pdf')).toBe('Masses/Latin/Mass.pdf');
  });
});
