import { describe, expect, it } from 'vitest';
import { oneEach, type Place } from './originals';

const place = (id: string, added: boolean, path: string): Place => ({ id, added, path });

describe('oneEach', () => {
  it('keeps the folder\'s copy of a file that is added too, and deletes the added one', () => {
    const f = place('a', false, 'Mass.pdf'), i = place('a', true, 'Mass copy.pdf'), j = place('b', true, 'Song.pdf');
    const r = oneEach([f], [i, j], true);
    expect(r.originals).toEqual([f, j]);
    expect(r.copies).toEqual([i]);
  });

  it('deletes nothing while the folder is only remembered', () => {
    const r = oneEach([place('a', false, 'Mass.pdf')], [place('a', true, 'Mass.pdf')], false);
    expect(r.originals.map((o) => o.added)).toEqual([false]);
    expect(r.copies).toEqual([]);
  });

  it('shows the first of two of the same file in the folder, and deletes neither', () => {
    const a = place('a', false, 'Mass.pdf'), b = place('a', false, 'Old/Mass.pdf');
    expect(oneEach([a, b], [], true)).toEqual({ originals: [a], copies: [] });
  });
});
