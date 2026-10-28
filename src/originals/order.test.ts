// The order of the files in originals/, kept: each imports values only from files above it in this
// list (type-only imports are erased, so they don't count). That keeps the content files free of
// anything that knows about files in the library, and inbox-fs.ts free of pdf.js, so the service
// worker can import it.

import { describe, expect, it } from 'vitest';

/** The files of originals/, each importing only from those before it. */
const ORDER = [
  'path-utils', '_filesystem-utils', 'types', '_types', '_record-model', '_record-store', '_pdf-source', '_image-source', '_sources', 'original',
  'device-score-fs', 'internal-score-fs', 'inbox-fs', 'trash-fs', 'library-files', 'misc-files',
];

const sources = import.meta.glob<string>(['./*.ts', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true });

/** The files a file imports values from: not `import type`, nor an import of only `type` names. */
function valueImports(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/^import (?!type )([^;]*?) from '\.\/([^']*)'/gm)) {
    const names = /\{([^}]*)\}/.exec(m[1])?.[1];
    const onlyTypes = !!names && !m[1].replace(/\{[^}]*\}/, '').replace(/[,\s]/g, '') && names.split(',').every((n) => !n.trim() || n.trim().startsWith('type '));
    if (!onlyTypes) out.push(m[2]);
  }
  return out;
}

describe('originals/ order', () => {
  it('lists every file', () => {
    expect(Object.keys(sources).map((p) => p.slice(2, -3)).sort()).toEqual([...ORDER].sort());
  });

  it('imports values only from files above', () => {
    const wrong: string[] = [];
    for (const [path, text] of Object.entries(sources)) {
      const file = path.slice(2, -3);
      for (const from of valueImports(text)) if (ORDER.indexOf(from) >= ORDER.indexOf(file)) wrong.push(`${file} imports ${from}`);
    }
    expect(wrong).toEqual([]);
  });
});
