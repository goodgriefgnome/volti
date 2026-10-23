import { describe, expect, it } from 'vitest';
import type { Original } from '../originals/originals';
import { byFolder } from './folders';

const original = (id: string, location: Original['location'], path: string): Original =>
  ({ id, title: path, folder: '', location, path, getFile: () => Promise.reject(new Error('not here')) });

describe('byFolder', () => {
  const at = (id: string, folder: string): Original => ({ ...original(id, 'folder', id), folder });
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
