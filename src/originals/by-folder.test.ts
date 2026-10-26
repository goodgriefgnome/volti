import { describe, expect, it } from 'vitest';
import { byFolder } from './by-folder';
import type { Original } from './original';

/** An original `id` in `folder`, only for listing. */
const at = (id: string, folder: string) => ({ id, path: (folder ? folder + '/' : '') + id + '.pdf' }) as Original;

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
