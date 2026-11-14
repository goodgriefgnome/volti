// The styles draw their values from base.css's tokens: no colour is written outside them, and
// sizes, radii, gaps and layers come from the scales (docs/css-system-spec.md).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const FILES = ['base', 'ui', 'library', 'dialogs', 'reader', 'face'] as const;

/** A style file's text without comments, and for base.css without its token block. */
function rules(name: (typeof FILES)[number]): string {
  let css = readFileSync(new URL(`./${name}.css`, import.meta.url), 'utf8');
  if (name === 'base') {
    const from = css.indexOf('/* Tokens */');
    const to = css.indexOf('/* End of the tokens */');
    expect(from, 'base.css needs a /* Tokens */ comment').toBeGreaterThanOrEqual(0);
    expect(to, 'base.css needs a /* End of the tokens */ comment').toBeGreaterThan(from);
    css = css.slice(0, from) + css.slice(to);
  }
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('styles', () => {
  it('writes no colour outside the tokens', () => {
    for (const name of FILES) {
      const m = rules(name).match(/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i);
      expect(m, `${name}.css has a colour literal (${m?.[0]}): use a colour token: see STYLES.md`).toBeNull();
    }
  });
});
