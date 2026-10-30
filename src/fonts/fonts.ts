// The bundled fonts, and reading them once a run. Fonts are read with fontkit, loaded only when
// something has to be shaped.

import type { Font } from 'fontkit';
import { _shape, type Shaped } from './_shape';

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

/** Shape `text` with a bundled font, loading fontkit and the font the first time. */
export async function shapeWith(font: string, text: string): Promise<Shaped> {
  let loading = fonts.get(font);
  if (!loading) {
    loading = readFont(font);
    fonts.set(font, loading);
    loading.catch(() => fonts.delete(font));
  }
  return _shape(await loading, text);
}
