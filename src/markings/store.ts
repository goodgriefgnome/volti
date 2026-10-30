// Glyph records and the symbol library in the kv store. The only place markings touch storage.

import { keys } from '../storage/keys';
import { kv } from '../storage/kv';
import { addGlyph, glyphKey, glyphOf } from './glyphs';
import type { SymbolLibrary } from './library';

/** Load into the glyph table those of `keys` it hasn't got. */
export async function loadGlyphs(wanted: Iterable<string>): Promise<void> {
  const missing = [...wanted].filter((k) => !glyphOf(k));
  const found = await Promise.all(missing.map((k) => kv.get<string>(keys.glyph(k))));
  missing.forEach((k, i) => {
    const d = found[i];
    if (d !== undefined) addGlyph(k, d);
  });
}

/** Store a font's glyphs, and add them to the table. */
export async function saveGlyphs(font: string, paths: Map<number, string>): Promise<void> {
  await kv.setMany([...paths].map(([gid, d]) => [keys.glyph(glyphKey(font, gid)), d]));
  for (const [gid, d] of paths) addGlyph(glyphKey(font, gid), d);
}

/** The symbol library, with its glyphs loaded into the table; undefined until one is saved. */
export async function loadLibrary(): Promise<SymbolLibrary | undefined> {
  const lib = await kv.get<SymbolLibrary>(keys.symbols);
  if (!lib) return undefined;
  const wanted = [...lib.groups.flatMap((g) => g.symbols), ...lib.adhoc].flatMap((s) => s.glyphs.map(([gid]) => glyphKey(s.font, gid)));
  await loadGlyphs(wanted);
  return lib;
}

export const saveLibrary = (lib: SymbolLibrary) => kv.set(keys.symbols, lib);
