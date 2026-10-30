// The symbol library as the reader gets it, made from the starter the first time it is needed.

import { BRAVURA, shapeWith } from '../fonts/fonts';
import { symbolFrom, type LibrarySymbol, type SymbolLibrary } from '../markings/library';
import { loadLibrary, saveGlyphs, saveLibrary } from '../markings/store';

/** The starter library: fingerings 1 to 5, and pp to ff, all Bravura at scale 1. */
const STARTER = [['', '', '', '', ''], ['', '', '', '', '', '']];

/** The library, if one has been made. */
export const savedLibrary = (): Promise<SymbolLibrary | undefined> => loadLibrary();

let making: Promise<SymbolLibrary> | undefined;

/** The library, made from the starter (shaping with Bravura, storing its glyphs) when there is none. */
export function symbolLibrary(): Promise<SymbolLibrary> {
  making ??= (async () => {
    const saved = await loadLibrary();
    if (saved) return saved;
    const shaped = await Promise.all(STARTER.flat().map((text) => shapeWith(BRAVURA, text)));
    // The glyphs are stored before the library that uses them.
    await saveGlyphs(BRAVURA, new Map(shaped.flatMap((s) => [...s.paths])));
    const made = new Map(STARTER.flat().map((text, i) => [text, symbolFrom(BRAVURA, text, 1, shaped[i].glyphs)]));
    const lib: SymbolLibrary = { groups: STARTER.map((g) => ({ symbols: g.map((t): LibrarySymbol => made.get(t)!) })), adhoc: [] };
    await saveLibrary(lib);
    return lib;
  })();
  making.catch(() => { making = undefined; });
  return making;
}
