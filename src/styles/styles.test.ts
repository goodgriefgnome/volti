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

/** Each declaration `prop: value` in `css` whose property is one of `props`, as [prop, value]. */
function declarations(css: string, props: readonly string[]): [string, string][] {
  const found: [string, string][] = [];
  for (const m of css.matchAll(/(?:^|[;{\s])([a-z-]+)\s*:\s*([^;}]+)/g)) {
    if (props.includes(m[1])) found.push([m[1], m[2].trim()]);
  }
  return found;
}

/** Every declaration of `props` in the six files, with the file it is in. */
function all(props: readonly string[]): { name: string; prop: string; value: string }[] {
  return FILES.flatMap((name) => declarations(rules(name), props).map(([prop, value]) => ({ name, prop, value })));
}

describe('styles', () => {
  it('writes no colour outside the tokens', () => {
    for (const name of FILES) {
      const m = rules(name).match(/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i);
      expect(m, `${name}.css has a colour literal (${m?.[0]}): use a colour token: see STYLES.md`).toBeNull();
    }
  });

  it('sizes text from the scale', () => {
    for (const { name, prop, value } of all(['font-size', 'font'])) {
      const exempt = `${prop}: ${value}`;
      if (exempt === 'font: italic 600 2.4rem/1 var(--font-brand)' || exempt === 'font-size: 10px') continue;
      const ok = prop === 'font-size' ? value === 'inherit' || /^var\(--text-\w+\)$/.test(value) : !/\d(px|r?em)\b/.test(value.replace(/\/[\d.]+(px|r?em)?/g, ''));
      expect(ok, `${name}.css has ${exempt}: use a text size token: see STYLES.md`).toBe(true);
    }
  });

  it('rounds corners from the scale', () => {
    for (const { name, value } of all(['border-radius'])) {
      expect(value, `${name}.css has border-radius: ${value}: use a radius token: see STYLES.md`).not.toContain('px');
    }
  });

  it('spaces from the scale', () => {
    // The excerpt picker's strip scales with its zoom, so its gap is `calc(var(--u) * 8)`.
    const ok = /^(0|var\(--space-\d\)( var\(--space-\d\))?|calc\(var\(--u\) \* \d+\))$/;
    for (const { name, prop, value } of all(['gap', 'row-gap', 'column-gap'])) {
      expect(ok.test(value), `${name}.css has ${prop}: ${value}: use a space token: see STYLES.md`).toBe(true);
    }
  });

  it('stacks globally only by the layer tokens', () => {
    for (const { name, value } of all(['z-index'])) {
      const ok = /^var\(--z-[\w-]+\)$/.test(value) || /^calc\(var\(--z-[\w-]+\) - \d+\)$/.test(value) || /^\d+$/.test(value) && Number(value) <= 12;
      expect(ok, `${name}.css has z-index: ${value}: use a layer token: see STYLES.md`).toBe(true);
    }
  });
});
