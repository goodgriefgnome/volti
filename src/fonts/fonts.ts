// The bundled fonts, and reading them once a run. Fonts are read with fontkit, loaded only when
// something has to be shaped.

import type { Font } from 'fontkit';
import { _shape, _viewOf, type Shaped } from './_shape';

/** Bravura's id: the first 8 hex digits of the SHA-256 of public/fonts/Bravura.woff2. */
export const BRAVURA = 'e68df664';

/** Academico's id: the first 8 hex digits of the SHA-256 of public/fonts/Academico.woff2 (version 0.902, made from the OTF of the npm package `@vexflow-fonts/academico`). */
export const ACADEMICO = '551b7cce';

/** The bundled fonts' files, by id. */
const FILES: Record<string, string> = {
  [BRAVURA]: 'fonts/Bravura.woff2',
  [ACADEMICO]: 'fonts/Academico.woff2',
};

/** A font read: fontkit's, and the file's bytes, which a text field's `FontFace` is made from. */
interface Loaded { font: Font; bytes: Uint8Array }

const fonts = new Map<string, Promise<Loaded>>();

async function readFont(id: string): Promise<Loaded> {
  const file = FILES[id];
  if (!file) throw new Error(`Unknown font ${id}`);
  const [fontkit, res] = await Promise.all([import('fontkit'), fetch(import.meta.env.BASE_URL + file)]);
  if (!res.ok) throw new Error(`Font ${id} not found`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const font = fontkit.create(bytes as Buffer);
  if (!('layout' in font)) throw new Error('Font collections are not supported');
  return { font, bytes };
}

function loadFont(id: string): Promise<Loaded> {
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
  return _shape((await loadFont(font)).font, text);
}

/** A font the app can use. Only bundled ones for now; imported ones join later. */
export interface FontChoice {
  id: string;
  name: string;
  /** The font has letters, so text can be typed in it. */
  text: boolean;
}

/** The fonts the editor and the picker offer: Bravura, then Academico, for now. */
export async function fontChoices(): Promise<FontChoice[]> {
  return [
    { id: BRAVURA, name: 'Bravura', text: false },
    { id: ACADEMICO, name: 'Academico', text: true },
  ];
}

/** A font read for showing its glyphs: what the glyph picker needs. */
export interface FontView {
  /** Its code points that have a glyph (not .notdef), ascending. */
  codePoints: number[];
  /** The outline of the glyph at a code point, as path data (as `_pathData` gives). */
  pathAt(cp: number): string;
}

export async function fontView(id: string): Promise<FontView> {
  return _viewOf((await loadFont(id)).font);
}

/** A font's vertical metrics, in em: ascent above the baseline, descent below it (positive), and its capitals' height. */
export interface FontMetrics { ascent: number; descent: number; capHeight: number }

export async function fontMetrics(id: string): Promise<FontMetrics> {
  const { font } = await loadFont(id);
  const em = font.unitsPerEm;
  return { ascent: font.ascent / em, descent: -font.descent / em, capHeight: font.capHeight / em };
}

const families = new Map<string, Promise<string>>();

/**
 * The font as a CSS font family for a text field, made with `FontFace` from the same file and
 * added to `document.fonts` the first time. Its ascent and descent are set to `fontMetrics`' and
 * its line gap to 0 (`ascentOverride`, `descentOverride`, `lineGapOverride`), so a field one line
 * high has its baseline exactly `ascent` below its top, whatever the browser would have taken.
 */
export function cssFamily(id: string): Promise<string> {
  let made = families.get(id);
  if (!made) {
    made = (async () => {
      const [{ bytes }, m] = await Promise.all([loadFont(id), fontMetrics(id)]);
      const family = `volti-${id}`;
      const percent = (v: number) => `${v * 100}%`;
      const descriptors = { ascentOverride: percent(m.ascent), descentOverride: percent(m.descent), lineGapOverride: '0%' };
      const face = new FontFace(family, bytes.slice().buffer, descriptors as FontFaceDescriptors);
      await face.load();
      document.fonts.add(face);
      return family;
    })();
    families.set(id, made);
    made.catch(() => families.delete(id));
  }
  return made;
}
