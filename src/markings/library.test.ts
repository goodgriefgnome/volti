import { beforeAll, describe, expect, it } from 'vitest';
import { addGlyph } from './glyphs';
import { addAdhoc, addGroup, findSymbol, moveGroup, nextSymbol, putSymbol, removeGroup, removeSymbol, replaceSymbol, scaleOf, symbolFrom, symbolsOf, type LibrarySymbol, type SymbolLibrary } from './library';

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

const texts = (l: SymbolLibrary) => [l.groups.map((g) => g.symbols.map((s) => s.text).join('')), l.adhoc.map((s) => s.text).join('')];
const copy = JSON.stringify(lib);

describe('changing the library', () => {
  it('symbolsOf gives a group, adhoc for -1, and nothing for no group', () => {
    expect(symbolsOf(lib, 1).map((s) => s.text)).toEqual(['d']);
    expect(symbolsOf(lib, -1).map((s) => s.text)).toEqual(['e', 'f']);
    expect(symbolsOf(lib, 5)).toEqual([]);
  });
  it('adds an empty group at the end', () => {
    expect(texts(addGroup(lib))).toEqual([['abc', 'd', ''], 'ef']);
  });
  it('removes a group with its symbols, the last one too', () => {
    expect(texts(removeGroup(lib, 0))).toEqual([['d'], 'ef']);
    expect(texts(removeGroup(removeGroup(lib, 1), 0))).toEqual([[], 'ef']);
  });
  it('moves a group so it ends at the new place', () => {
    expect(texts(moveGroup(lib, 0, 1))).toEqual([['d', 'abc'], 'ef']);
    expect(texts(moveGroup(addGroup(lib), 2, 0))[0]).toEqual(['', 'abc', 'd']);
  });
  it('puts a symbol in a group at an index, or at the end', () => {
    expect(texts(putSymbol(lib, sym('x'), 1))[0]).toEqual(['abc', 'dx']);
    expect(texts(putSymbol(lib, sym('x'), 0, 1))[0]).toEqual(['axbc', 'd']);
    expect(texts(putSymbol(lib, sym('x'), 0, 99))[0]).toEqual(['abcx', 'd']);
  });
  it('takes a symbol out of adhoc when it is put in a group', () => {
    expect(texts(putSymbol(lib, sym('f'), 1))).toEqual([['abc', 'df'], 'e']);
  });
  it('reorders a symbol put in its own group, and moves it from another', () => {
    expect(texts(putSymbol(lib, sym('a'), 0, 2))[0]).toEqual(['bca', 'd']);
    expect(texts(putSymbol(lib, sym('c'), 0, 0))[0]).toEqual(['cab', 'd']);
    expect(texts(putSymbol(lib, sym('b'), 1, 0))[0]).toEqual(['ac', 'bd']);
  });
  it('replaces a symbol where it is', () => {
    const out = replaceSymbol(lib, { font: 'l', text: 'b' }, sym('x', 3));
    expect(texts(out)).toEqual([['axc', 'd'], 'ef']);
    expect(out.groups[0].symbols[1].scale).toBe(3);
    expect(replaceSymbol(lib, { font: 'l', text: 'zz' }, sym('x'))).toBe(lib);
  });
  it('takes another symbol like the replacement out', () => {
    expect(texts(replaceSymbol(lib, { font: 'l', text: 'b' }, sym('d')))).toEqual([['adc', ''], 'ef']);
    expect(texts(replaceSymbol(lib, { font: 'l', text: 'c' }, sym('a')))).toEqual([['ba', 'd'], 'ef']);
    expect(texts(replaceSymbol(lib, { font: 'l', text: 'c' }, sym('f')))).toEqual([['abf', 'd'], 'e']);
  });
  it('removes a symbol wherever it is', () => {
    expect(texts(removeSymbol(lib, 'l', 'b'))).toEqual([['ac', 'd'], 'ef']);
    expect(texts(removeSymbol(lib, 'l', 'e'))).toEqual([['abc', 'd'], 'f']);
  });
  it('puts an ad-hoc symbol at the front, keeping at most 8', () => {
    let out = lib;
    for (const t of 'ghijklm') out = addAdhoc(out, sym(t));
    expect(out.adhoc.map((s) => s.text).join('')).toBe('mlkjihge');
  });
  it('moves a repeated ad-hoc symbol to the front, and leaves the library alone for one in a group', () => {
    expect(texts(addAdhoc(lib, sym('f')))[1]).toBe('fe');
    expect(addAdhoc(lib, sym('a'))).toBe(lib);
  });
  it('leaves its argument as it was', () => {
    putSymbol(lib, sym('a'), 1, 0); removeGroup(lib, 0); moveGroup(lib, 0, 1); addGroup(lib);
    replaceSymbol(lib, { font: 'l', text: 'b' }, sym('d')); removeSymbol(lib, 'l', 'a'); addAdhoc(lib, sym('z'));
    expect(JSON.stringify(lib)).toBe(copy);
  });
});
