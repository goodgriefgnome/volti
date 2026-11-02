import { describe, expect, it } from 'vitest';
import type { LibrarySymbol, SymbolLibrary } from '../markings/library';
import { lastSymbol } from './_symbols';

const sym = (text: string): LibrarySymbol => ({ font: 'Bravura', text, scale: 1, glyphs: [] });
const lib = (groups: string[][], adhoc: string[] = []): SymbolLibrary => ({ groups: groups.map((g) => ({ symbols: g.map(sym) })), adhoc: adhoc.map(sym) });

describe('lastSymbol', () => {
  it('is the current symbol of the group', () => {
    expect(lastSymbol(lib([['1', '2'], ['p', 'f']]), 1, [0, 1], 0)).toEqual({ group: 1, index: 1 });
  });
  it('is the ad-hoc group\'s current symbol for -1', () => {
    expect(lastSymbol(lib([['1']], ['x', 'y']), -1, [0], 1)).toEqual({ group: -1, index: 1 });
  });
  it('falls to the first symbol of the first group with symbols when the group is gone', () => {
    expect(lastSymbol(lib([['1', '2'], ['p']]), 5, [0, 0], 0)).toEqual({ group: 0, index: 0 });
  });
  it('skips an empty first group, and falls to the group\'s first symbol when its current is gone', () => {
    expect(lastSymbol(lib([[], ['p', 'f']]), 0, [0, 0], 0)).toEqual({ group: 1, index: 0 });
    expect(lastSymbol(lib([['1', '2']]), 0, [4], 0)).toEqual({ group: 0, index: 0 });
  });
  it('is null for a library with no symbols', () => {
    expect(lastSymbol(lib([[], []]), 0, [], 0)).toBeNull();
  });
});
