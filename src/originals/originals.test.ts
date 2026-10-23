import { describe, expect, it } from 'vitest';
import { hashFile, importName, oneEach, type Original } from './originals';

const original = (id: string, location: Original['location'], path: string): Original =>
  ({ id, title: path, folder: '', location, path, getFile: () => Promise.reject(new Error('not here')) });

describe('hashFile', () => {
  it('is the SHA-256 of the contents, in hex', async () => {
    expect(await hashFile(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('oneEach', () => {
  it('keeps the folder\'s copy of a file that is imported too, and deletes the imported one', () => {
    const f = original('a', 'folder', 'Mass.pdf'), i = original('a', 'imported', 'Mass copy.pdf'), j = original('b', 'imported', 'Song.pdf');
    const r = oneEach([f], [i, j], true);
    expect(r.originals).toEqual([f, j]);
    expect(r.copies).toEqual([i]);
  });

  it('deletes nothing while the folder is only remembered', () => {
    const r = oneEach([original('a', 'folder', 'Mass.pdf')], [original('a', 'imported', 'Mass.pdf')], false);
    expect(r.originals.map((o) => o.location)).toEqual(['folder']);
    expect(r.copies).toEqual([]);
  });

  it('shows the first of two of the same file in the folder, and deletes neither', () => {
    const a = original('a', 'folder', 'Mass.pdf'), b = original('a', 'folder', 'Old/Mass.pdf');
    expect(oneEach([a, b], [], true)).toEqual({ originals: [a], copies: [] });
  });
});

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
