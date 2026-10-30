import { beforeAll, describe, expect, it } from 'vitest';
import { addGlyph } from './glyphs';
import { findSymbol, nextSymbol, scaleOf, symbolFrom, type LibrarySymbol, type SymbolLibrary } from './library';

beforeAll(() => {
  addGlyph('l:1', 'M 0 0 L 1 0 L 1 -1 L 0 -1 Z');
});

const sym = (text: string, scale = 1): LibrarySymbol => ({ font: 'l', text, scale, glyphs: [[1, 0, 0]] });
const lib: SymbolLibrary = { groups: [{ symbols: [sym('a'), sym('b', 2), sym('c')] }, { symbols: [sym('d')] }], adhoc: [sym('e', 0.5), sym('f')] };

describe('symbolFrom', () => {
  it('moves the glyphs so the centre of their ink is the origin', () => {
    const s = symbolFrom('l', 'aa', 1, [{ gid: 1, x: 0, y: 0 }, { gid: 1, x: 2, y: 0 }]);
    // Ink spans 0..3 across and -1..0 up.
    expect(s.glyphs).toEqual([[1, -1.5, 0.5], [1, 0.5, 0.5]]);
  });
  it('leaves glyphs with no ink where they are', () => {
    expect(symbolFrom('l', ' ', 1, [{ gid: 99, x: 0.25, y: 0 }]).glyphs).toEqual([[99, 0.25, 0]]);
  });
});

describe('findSymbol', () => {
  it('finds a symbol by font and characters, in a group or among the ad hoc ones', () => {
    expect(findSymbol(lib, 'l', 'b')).toEqual({ group: 0, index: 1 });
    expect(findSymbol(lib, 'l', 'd')).toEqual({ group: 1, index: 0 });
    expect(findSymbol(lib, 'l', 'f')).toEqual({ group: -1, index: 1 });
    expect(findSymbol(lib, 'x', 'a')).toBeUndefined();
  });
});

describe('nextSymbol', () => {
  it('is the next of its group, wrapping round', () => {
    expect(nextSymbol(lib, 'l', 'a')!.text).toBe('b');
    expect(nextSymbol(lib, 'l', 'c')!.text).toBe('a');
    expect(nextSymbol(lib, 'l', 'd')!.text).toBe('d');
  });
  it('cycles the ad hoc symbols as a group', () => {
    expect(nextSymbol(lib, 'l', 'e')!.text).toBe('f');
    expect(nextSymbol(lib, 'l', 'f')!.text).toBe('e');
  });
  it('is undefined for a symbol not in the library', () => {
    expect(nextSymbol(lib, 'l', 'z')).toBeUndefined();
  });
});

describe('scaleOf', () => {
  it('is its scale in the library, or 1', () => {
    expect(scaleOf(lib, 'l', 'b')).toBe(2);
    expect(scaleOf(lib, 'l', 'e')).toBe(0.5);
    expect(scaleOf(lib, 'l', 'z')).toBe(1);
    expect(scaleOf(undefined, 'l', 'b')).toBe(1);
  });
});
