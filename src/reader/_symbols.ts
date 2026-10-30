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
    const made = await Promise.all(STARTER.map((g) => Promise.all(g.map((text) => makeSymbol(BRAVURA, text, 1)))));
    const lib: SymbolLibrary = { groups: made.map((symbols) => ({ symbols })), adhoc: [] };
    await saveLibrary(lib);
    return lib;
  })();
  making.catch(() => { making = undefined; });
  return making;
}

/** A library symbol of `text` in `font`: shaped, its glyphs stored (before it is), centred. */
export async function makeSymbol(font: string, text: string, scale: number): Promise<LibrarySymbol> {
  const shaped = await shapeWith(font, text);
  await saveGlyphs(font, shaped.paths);
  return symbolFrom(font, text, scale, shaped.glyphs);
}
