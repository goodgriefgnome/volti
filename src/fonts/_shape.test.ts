import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as fontkit from 'fontkit';
import { _pathData, _shape, _viewOf, fontId } from './_shape';
import { ACADEMICO, ACADEMICO_ITALIC, BRAVURA } from './fonts';

const bytes = new Uint8Array(readFileSync('public/fonts/Bravura.woff2'));
const font = fontkit.create(bytes as Buffer) as fontkit.Font;

/** Every number in path data, in pairs. */
const points = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe('Bravura', () => {
  it('has the id the app expects', async () => {
    expect(await fontId(bytes)).toBe(BRAVURA);
  });

  it('shapes fingering 4 above the baseline', () => {
    const { glyphs, paths } = _shape(font, '');
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]).toMatchObject({ x: 0, y: 0 });
    const d = paths.get(glyphs[0].gid)!;
    expect(d).toMatch(/M/);
    const n = points(d);
    for (let i = 0; i < n.length; i += 2) {
      expect(n[i]).toBeGreaterThanOrEqual(0);
      expect(n[i]).toBeLessThanOrEqual(1);
      expect(n[i + 1]).toBeLessThanOrEqual(0);
      expect(n[i + 1]).toBeGreaterThanOrEqual(-1);
    }
  });

  it('shapes mf wider than fingering 4', () => {
    const wide = (t: string) => {
      const n = points(_shape(font, t).paths.values().next().value!).filter((_, i) => i % 2 === 0);
      return Math.max(...n) - Math.min(...n);
    };
    expect(wide('')).toBeGreaterThan(wide(''));
  });

  it('shapes three glyphs left to right', () => {
    const { glyphs } = _shape(font, '');
    expect(glyphs).toHaveLength(3);
    expect(glyphs[0].x).toBeLessThan(glyphs[1].x);
    expect(glyphs[1].x).toBeLessThan(glyphs[2].x);
  });

  it('gives .notdef for a code point it has not got', () => {
    expect(_shape(font, '\u{10FFFD}').glyphs.map((g) => g.gid)).toEqual([0]);
  });
});

describe('_pathData', () => {
  it('makes a quadratic curve cubic, with control points at 2/3', () => {
    const d = _pathData(
      [
        { command: 'moveTo', args: [0, 0] },
        { command: 'quadraticCurveTo', args: [300, 600, 900, 0] },
        { command: 'closePath', args: [] },
      ],
      1000,
    );
    expect(d).toBe('M 0 0 C 0.2 -0.4 0.5 -0.4 0.9 0 Z');
  });
});

describe('_viewOf', () => {
  const view = _viewOf(font);
  it('lists the code points that have a glyph, ascending', () => {
    expect(view.codePoints).toContain(0xed14);
    expect(view.codePoints).not.toContain(0x41);
    expect(view.codePoints).toEqual([...view.codePoints].sort((a, b) => a - b));
  });
  it('gives the outline that shaping the character gives', () => {
    const { glyphs, paths } = _shape(font, '\uED14');
    expect(view.pathAt(0xed14)).toBe(paths.get(glyphs[0].gid));
  });
});

describe('Academico', () => {
  const abytes = new Uint8Array(readFileSync('public/fonts/Academico.woff2'));
  const academico = fontkit.create(abytes as Buffer) as fontkit.Font;

  it('has the id the app expects', async () => {
    expect(await fontId(abytes)).toBe(ACADEMICO);
  });

  it('shapes "Ped." as four glyphs left to right, each with an outline', () => {
    const { glyphs, paths } = _shape(academico, 'Ped.');
    expect(glyphs).toHaveLength(4);
    for (let i = 1; i < 4; i++) expect(glyphs[i].x).toBeGreaterThan(glyphs[i - 1].x);
    for (const g of glyphs) expect(paths.get(g.gid)).toMatch(/M/);
  });

  it('kerns "AV"', () => {
    const { glyphs } = _shape(academico, 'AV');
    const advance = academico.getGlyph(glyphs[0].gid).advanceWidth / academico.unitsPerEm;
    expect(glyphs[1].x).toBeLessThan(advance);
  });
});

describe('Academico Italic', () => {
  const ibytes = new Uint8Array(readFileSync('public/fonts/Academico-Italic.woff2'));
  const italic = fontkit.create(ibytes as Buffer) as fontkit.Font;
  const regular = fontkit.create(new Uint8Array(readFileSync('public/fonts/Academico.woff2')) as Buffer) as fontkit.Font;

  it('has the id the app expects', async () => {
    expect(await fontId(ibytes)).toBe(ACADEMICO_ITALIC);
  });

  it('shapes "Ped." as four glyphs left to right', () => {
    const { glyphs } = _shape(italic, 'Ped.');
    expect(glyphs).toHaveLength(4);
    for (let i = 1; i < 4; i++) expect(glyphs[i].x).toBeGreaterThan(glyphs[i - 1].x);
  });

  it('kerns "AC"', () => {
    const { glyphs } = _shape(italic, 'AC');
    const advance = italic.getGlyph(glyphs[0].gid).advanceWidth / italic.unitsPerEm;
    expect(glyphs[1].x).toBeLessThan(advance);
  });

  it('has the Regular\'s vertical metrics, so a field\'s baseline is where it was', () => {
    expect(italic.ascent).toBe(regular.ascent);
    expect(italic.descent).toBe(regular.descent);
    expect(italic.capHeight).toBe(regular.capHeight);
    expect(italic.unitsPerEm).toBe(regular.unitsPerEm);
  });
});
