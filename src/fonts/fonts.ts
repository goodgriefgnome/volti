// The bundled fonts, and reading them once a run. Fonts are read with fontkit, loaded only when
// something has to be shaped.

import type { Font } from 'fontkit';
import { _shape, _viewOf, type Shaped } from './_shape';

/** Bravura's id: the first 8 hex digits of the SHA-256 of public/fonts/Bravura.woff2. */
export const BRAVURA = 'e68df664';

/** The bundled fonts' files, by id. */
const FILES: Record<string, string> = { [BRAVURA]: 'fonts/Bravura.woff2' };

const fonts = new Map<string, Promise<Font>>();

async function readFont(id: string): Promise<Font> {
  const file = FILES[id];
  if (!file) throw new Error(`Unknown font ${id}`);
  const [fontkit, res] = await Promise.all([import('fontkit'), fetch(import.meta.env.BASE_URL + file)]);
  if (!res.ok) throw new Error(`Font ${id} not found`);
  const font = fontkit.create(new Uint8Array(await res.arrayBuffer()) as Buffer);
  if (!('layout' in font)) throw new Error('Font collections are not supported');
  return font;
}

function loadFont(id: string): Promise<Font> {
  let loading = fonts.get(id);
  if (!loading) {
    loading = readFont(id);
    fonts.set(id, loading);
    loading.catch(() => fonts.delete(id));
  }
  return loading;
}

/** Shape `text` with a bundled font, loading fontkit and the font the first time. */
export async function shapeWith(font: string, text: string): Promise<Shaped> {
  return _shape(await loadFont(font), text);
}

/** A font the app can use. Only bundled ones for now; imported ones join later. */
export interface FontChoice { id: string; name: string }

/** The fonts the editor and the picker offer: [{ id: BRAVURA, name: 'Bravura' }] for now. */
export async function fontChoices(): Promise<FontChoice[]> {
  return [{ id: BRAVURA, name: 'Bravura' }];
}

/** A font read for showing its glyphs: what the glyph picker needs. */
export interface FontView {
  /** Its code points that have a glyph (not .notdef), ascending. */
  codePoints: number[];
  /** The outline of the glyph at a code point, as path data (as `_pathData` gives). */
  pathAt(cp: number): string;
}

export async function fontView(id: string): Promise<FontView> {
  return _viewOf(await loadFont(id));
}
