// Pure. Shapes text with a font read by fontkit, and turns glyph outlines into path data.

import type { Font } from 'fontkit';
import type { FontView } from './fonts';

/** Text shaped with a font: its glyphs from the start of the baseline, and their outlines. Em units, y downwards. */
export interface Shaped {
  glyphs: { gid: number; x: number; y: number }[];
  /** Each glyph's outline as SVG path data (absolute M, L, C, Z only), from its origin; '' when it has none. */
  paths: Map<number, string>;
}

const round = (n: number) => Math.round(n * 10000) / 10000;

/** Shape `text` with the font's default features (kerning and ligatures included). */
export function _shape(font: Font, text: string): Shaped {
  const run = font.layout(text);
  const glyphs: Shaped['glyphs'] = [];
  const paths = new Map<number, string>();
  const em = font.unitsPerEm;
  let pen = 0;
  run.glyphs.forEach((g, i) => {
    const pos = run.positions[i];
    glyphs.push({ gid: g.id, x: (pen + pos.xOffset) / em, y: 0 - pos.yOffset / em });
    pen += pos.xAdvance;
    if (!paths.has(g.id)) paths.set(g.id, _pathData(g.path.commands, em));
  });
  return { glyphs, paths };
}

/** fontkit's path commands as path data: divided by unitsPerEm, y turned downwards, quadratic curves made cubic, numbers rounded to 1/10000. */
export function _pathData(commands: { command: string; args: number[] }[], unitsPerEm: number): string {
  const out: string[] = [];
  const x = (n: number) => round(n / unitsPerEm);
  const y = (n: number) => round(-n / unitsPerEm);
  // The current point, in font units, for raising quadratics.
  let cx = 0;
  let cy = 0;
  for (const { command, args: a } of commands) {
    if (command === 'moveTo' || command === 'lineTo') {
      out.push(`${command === 'moveTo' ? 'M' : 'L'} ${x(a[0])} ${y(a[1])}`);
      [cx, cy] = a;
    } else if (command === 'bezierCurveTo') {
      out.push(`C ${x(a[0])} ${y(a[1])} ${x(a[2])} ${y(a[3])} ${x(a[4])} ${y(a[5])}`);
      [cx, cy] = [a[4], a[5]];
    } else if (command === 'quadraticCurveTo') {
      const [qx, qy, ex, ey] = a;
      const c1x = cx + ((qx - cx) * 2) / 3;
      const c1y = cy + ((qy - cy) * 2) / 3;
      const c2x = ex + ((qx - ex) * 2) / 3;
      const c2y = ey + ((qy - ey) * 2) / 3;
      out.push(`C ${x(c1x)} ${y(c1y)} ${x(c2x)} ${y(c2y)} ${x(ex)} ${y(ey)}`);
      [cx, cy] = [ex, ey];
    } else if (command === 'closePath') {
      out.push('Z');
    }
  }
  return out.join(' ');
}

/** A font read for showing its glyphs: the code points that have one, and their outlines. */
export function _viewOf(font: Font): FontView {
  const codePoints = [...font.characterSet].filter((cp) => font.glyphForCodePoint(cp).id !== 0).sort((a, b) => a - b);
  return {
    codePoints,
    pathAt: (cp) => _pathData(font.glyphForCodePoint(cp).path.commands, font.unitsPerEm),
  };
}

/** A font's id: the first 8 hex digits of the SHA-256 of its file. */
export async function fontId(bytes: Uint8Array): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
  return [...hash.slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
