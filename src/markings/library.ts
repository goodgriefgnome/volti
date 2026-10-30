// Pure. The symbol library's types and what is worked out from it: making a symbol from shaped
// glyphs, finding a symbol, and the next one in its group.

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
