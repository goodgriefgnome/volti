import { describe, expect, it } from 'vitest';
import type { LibrarySymbol, SymbolLibrary } from '../../markings/symbol-library';
import { lastSymbol, reorderedCurrents } from './_symbol-library';

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

describe('reorderedCurrents', () => {
  it('moves the moved group\'s current symbol with it', () => {
    expect(reorderedCurrents([4, 1, 2], 1, 0, 2).currents).toEqual([1, 2, 4]);
    expect(reorderedCurrents([4, 1, 2], 1, 2, 0).currents).toEqual([2, 4, 1]);
  });
  it('follows the tool\'s group when it was the moved one', () => {
    expect(reorderedCurrents([0, 0, 0], 0, 0, 2).group).toBe(2);
    expect(reorderedCurrents([0, 0, 0], 2, 2, 0).group).toBe(0);
  });
  it('follows the tool\'s group when it was between the two', () => {
    expect(reorderedCurrents([0, 0, 0], 1, 0, 2).group).toBe(0);
    expect(reorderedCurrents([0, 0, 0], 1, 2, 0).group).toBe(2);
  });
  it('leaves a group outside the move, and the ad-hoc group, where they are', () => {
    expect(reorderedCurrents([0, 0, 0, 0], 3, 0, 2).group).toBe(3);
    expect(reorderedCurrents([0, 0, 0, 0], 0, 1, 2).group).toBe(0);
    expect(reorderedCurrents([0, 0, 0], -1, 0, 2).group).toBe(-1);
  });
});
