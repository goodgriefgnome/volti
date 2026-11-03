// The symbol library as the reader gets it, made from the starter the first time it is needed.

import { BRAVURA, shapeWith } from '../fonts/fonts';
import { symbolFrom, symbolsOf, type LibrarySymbol, type SymbolLibrary } from '../markings/library';
import { loadLibrary, saveGlyphs, saveLibrary } from '../markings/store';

/** The starter library: fingerings 1 to 5, and pp to ff, all Bravura at scale 1. */
const STARTER = [['', '', '', '', ''], ['', '', '', '', '', '']];

/**
 * The symbol the Symbols button shows and picks: the current symbol of `group` (-1 for the
 * ad-hoc group); when that group is gone or empty, the first symbol of the first group with
 * symbols; null when the library has none.
 */
export function lastSymbol(lib: SymbolLibrary, group: number, currents: readonly number[], adhocCurrent: number): { group: number; index: number } | null {
  const own = symbolsOf(lib, group);
  if (own.length) {
    const at = group < 0 ? adhocCurrent : currents[group] ?? 0;
    return { group, index: at < own.length ? at : 0 };
  }
  const first = [...lib.groups.keys(), -1].find((g) => symbolsOf(lib, g).length);
  return first === undefined ? null : { group: first, index: 0 };
}

/**
 * The groups' current symbols (by group index) and the tool's group once group `from` has moved to
 * `to` (as `moveGroup` does): each group keeps its own current symbol, and the tool keeps its group.
 * `group` is -1 for the ad-hoc group, which doesn't move.
 */
export function reorderedCurrents(currents: readonly number[], group: number, from: number, to: number): { currents: number[]; group: number } {
  const moved = [...currents];
  if (from < moved.length) moved.splice(to, 0, ...moved.splice(from, 1));
  const follow = (i: number) => (i === from ? to : from < i && i <= to ? i - 1 : to <= i && i < from ? i + 1 : i);
  return { currents: moved, group: group < 0 ? group : follow(group) };
}

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
