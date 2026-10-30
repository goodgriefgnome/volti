// Pure. The symbol library's types and what is worked out from it: making a symbol from shaped
// glyphs, finding a symbol, the next one in its group, and changing the library.

import { glyphKey, glyphOf } from './glyphs';

export interface SymbolLibrary {
  /** The user's groups, in their order on the toolbar. */
  groups: SymbolGroup[];
  /** Symbols placed ad hoc, newest first, at most 8. Cycles as a group. */
  adhoc: LibrarySymbol[];
}

/** Known by its place in the order. A type of its own, so it can have a name later. */
export interface SymbolGroup { symbols: LibrarySymbol[] }

/** Known by its font and characters, which are unique in the library (groups and adhoc together). */
export interface LibrarySymbol {
  font: string;
  /** Its characters, Private Use Area included. */
  text: string;
  scale: number;
  /** As shaped when it was defined, so placing it needs no font. */
  glyphs: [gid: number, x: number, y: number][];
}

/** A symbol from shaped text: its glyphs moved so the centre of their ink is the origin. The glyphs must be in the glyph table. */
export function symbolFrom(font: string, text: string, scale: number, glyphs: { gid: number; x: number; y: number }[]): LibrarySymbol {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const g of glyphs) {
    const b = glyphOf(glyphKey(font, g.gid))?.bounds;
    if (!b) continue;
    x0 = Math.min(x0, b[0] + g.x); x1 = Math.max(x1, b[2] + g.x);
    y0 = Math.min(y0, b[1] + g.y); y1 = Math.max(y1, b[3] + g.y);
  }
  const cx = x0 === Infinity ? 0 : (x0 + x1) / 2, cy = x0 === Infinity ? 0 : (y0 + y1) / 2;
  const r = (v: number) => Math.round(v * 10000) / 10000;
  return { font, text, scale, glyphs: glyphs.map((g) => [g.gid, r(g.x - cx), r(g.y - cy)]) };
}

/** Where the symbol with this font and text is: its group (-1 for adhoc) and place. */
export function findSymbol(lib: SymbolLibrary, font: string, text: string): { group: number; index: number } | undefined {
  const is = (s: LibrarySymbol) => s.font === font && s.text === text;
  for (let group = 0; group < lib.groups.length; group++) {
    const index = lib.groups[group].symbols.findIndex(is);
    if (index >= 0) return { group, index };
  }
  const index = lib.adhoc.findIndex(is);
  return index >= 0 ? { group: -1, index } : undefined;
}

/** The symbol after it in its group, wrapping round; undefined when it isn't in the library. */
export function nextSymbol(lib: SymbolLibrary, font: string, text: string): LibrarySymbol | undefined {
  const at = findSymbol(lib, font, text);
  if (!at) return undefined;
  const list = at.group < 0 ? lib.adhoc : lib.groups[at.group].symbols;
  return list[(at.index + 1) % list.length];
}

/** Its scale in the library; 1 when it isn't there. */
export function scaleOf(lib: SymbolLibrary | undefined, font: string, text: string): number {
  if (!lib) return 1;
  const at = findSymbol(lib, font, text);
  if (!at) return 1;
  return (at.group < 0 ? lib.adhoc : lib.groups[at.group].symbols)[at.index].scale;
}

const same = (a: { font: string; text: string }) => (s: LibrarySymbol) => s.font === a.font && s.text === a.text;

/** The most ad-hoc symbols kept. */
const ADHOC = 8;

/** A group's symbols; adhoc for -1; [] for no such group. */
export function symbolsOf(lib: SymbolLibrary, group: number): readonly LibrarySymbol[] {
  return group < 0 ? lib.adhoc : lib.groups[group]?.symbols ?? [];
}

/** A copy of the library without the symbol with this font and text, wherever it is. */
function without(lib: SymbolLibrary, font: string, text: string): SymbolLibrary {
  const not = (s: LibrarySymbol) => !same({ font, text })(s);
  return { groups: lib.groups.map((g) => ({ ...g, symbols: g.symbols.filter(not) })), adhoc: lib.adhoc.filter(not) };
}

/** A new empty group, at the end. */
export function addGroup(lib: SymbolLibrary): SymbolLibrary {
  return { ...lib, groups: [...lib.groups, { symbols: [] }] };
}

/** Without a group, and its symbols. */
export function removeGroup(lib: SymbolLibrary, group: number): SymbolLibrary {
  return { ...lib, groups: lib.groups.filter((_, i) => i !== group) };
}

/** The group ends up at `to`, as `moveEntry` (setlists/) has it. */
export function moveGroup(lib: SymbolLibrary, from: number, to: number): SymbolLibrary {
  const groups = [...lib.groups];
  const [g] = groups.splice(from, 1);
  groups.splice(to, 0, g);
  return { ...lib, groups };
}

/**
 * Put `sym` in a group (not adhoc) at `index` (the end when missing). A symbol with its font and
 * text that is somewhere else in the library is taken out of there first, so it is in one place.
 */
export function putSymbol(lib: SymbolLibrary, sym: LibrarySymbol, group: number, index?: number): SymbolLibrary {
  if (!lib.groups[group]) return lib;
  const out = without(lib, sym.font, sym.text);
  const symbols = [...out.groups[group].symbols];
  symbols.splice(index === undefined ? symbols.length : Math.max(0, Math.min(index, symbols.length)), 0, sym);
  return { ...out, groups: out.groups.map((g, i) => (i === group ? { ...g, symbols } : g)) };
}

/** Replace the symbol with font and text `was` by `sym` where it is; another with sym's font and text is taken out. */
export function replaceSymbol(lib: SymbolLibrary, was: { font: string; text: string }, sym: LibrarySymbol): SymbolLibrary {
  const at = findSymbol(lib, was.font, was.text);
  if (!at) return lib;
  const isWas = same(was), isSym = same(sym);
  // Replace the one, and drop any other like `sym`, in the same pass so the place is kept.
  const swap = (list: LibrarySymbol[]) => list.flatMap((s) => (isWas(s) ? [sym] : isSym(s) ? [] : [s]));
  return { groups: lib.groups.map((g) => ({ ...g, symbols: swap(g.symbols) })), adhoc: swap(lib.adhoc) };
}

export function removeSymbol(lib: SymbolLibrary, font: string, text: string): SymbolLibrary {
  return without(lib, font, text);
}

/**
 * An ad-hoc symbol placed through +: at the front of adhoc, at most 8 kept (the oldest goes). One
 * already in a group stays there and the library is unchanged; one already in adhoc moves to the front.
 */
export function addAdhoc(lib: SymbolLibrary, sym: LibrarySymbol): SymbolLibrary {
  const at = findSymbol(lib, sym.font, sym.text);
  if (at && at.group >= 0) return lib;
  const rest = lib.adhoc.filter((s) => !same(sym)(s));
  return { ...lib, adhoc: [sym, ...rest].slice(0, ADHOC) };
}
