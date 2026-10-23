import { describe, expect, it } from 'vitest';
import { oneEach, type Original } from './originals';

const original = (id: string, location: Original['location'], path: string): Original =>
  ({ id, title: path, folder: '', location, path, getFile: () => Promise.reject(new Error('not here')) });

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
