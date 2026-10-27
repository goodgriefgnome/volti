import { describe, expect, it } from 'vitest';
import { arrivals, byFolder, endingOf, folderOf, importName, isOriginalName, pathInFolder, pathWithTitle, shownFolder, tidyFolder, tidyPath, titleOf, unfoundName } from './path-utils';
import type { SourceFile } from './original';

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

describe('unfoundName', () => {
  it('takes a PDF or image name, and says why Volti wouldn\'t find any other', () => {
    expect(unfoundName('Masses/Mass.pdf')).toBeNull();
    expect(unfoundName('Ave verum.HEIC')).toBeNull();
    expect(unfoundName('Masses/Mass.txt')).toBe('“Mass.txt” doesn’t end in .pdf or an image’s ending, so Volti wouldn’t find it.');
  });
});

describe('shownFolder', () => {
  it('reads a folder as the user would, and the top as the top', () => {
    expect(shownFolder('Masses/Latin')).toBe('Masses / Latin');
    expect(shownFolder('')).toBe('the top of the library');
  });
});


const library = [{ id: 'a', path: 'Mass.pdf' }, { id: 'b', path: 'Masses/Kyrie.pdf' }];

describe('arrivals', () => {
  it('adds a file the library hasn\'t at a free path', () => {
    expect(arrivals([{ id: 'c', path: 'Song.pdf' }], library)).toEqual([{ kind: 'new' }]);
  });
  it('leaves out a file the library has, saying where, whatever it is called', () => {
    expect(arrivals([{ id: 'b', path: 'IMG_2041.pdf' }], library)).toEqual([{ kind: 'have', path: 'Masses/Kyrie.pdf' }]);
  });
  it('finds a path taken by a different file, ignoring case', () => {
    expect(arrivals([{ id: 'c', path: 'masses/KYRIE.pdf' }], library)).toEqual([{ kind: 'taken', by: library[1] }]);
  });
  it('lets the first of two coming in at one path take it', () => {
    expect(arrivals([{ id: 'c', path: 'Song.pdf' }, { id: 'd', path: 'song.pdf' }], library)).toEqual([{ kind: 'new' }, { kind: 'taken' }]);
  });
  it('doesn\'t let a file the library has take a path', () => {
    expect(arrivals([{ id: 'a', path: 'Song.pdf' }, { id: 'd', path: 'Song.pdf' }], library)).toEqual([{ kind: 'have', path: 'Mass.pdf' }, { kind: 'new' }]);
  });
});


/** An original `id` in `folder`, only for listing. */
const at = (id: string, folder: string) => ({ id, path: (folder ? folder + '/' : '') + id + '.pdf' }) as SourceFile;

describe('byFolder', () => {
  it('lists the top of the folder first, then each subfolder by path, keeping the order within', () => {
    const lists = byFolder([at('a', 'Masses'), at('b', ''), at('c', 'Exports'), at('d', 'Masses/Latin'), at('e', 'Masses'), at('f', '')]);
    expect(lists.map((l) => [l.folder, l.originals.map((o) => o.id).join('')])).toEqual([
      ['', 'bf'], ['Exports', 'c'], ['Masses', 'ae'], ['Masses/Latin', 'd'],
    ]);
  });
  it('has the top list even when it is empty', () => {
    expect(byFolder([at('a', 'Masses')]).map((l) => l.folder)).toEqual(['', 'Masses']);
  });
});
