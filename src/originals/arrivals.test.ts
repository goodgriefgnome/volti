import { describe, expect, it } from 'vitest';
import { arrivals } from './arrivals';

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
