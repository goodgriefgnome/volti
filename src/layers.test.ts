// The layers of src/, kept: each directory imports only from its own files and from directories in
// lower layers, so code low down never depends on screens or dialogs above it, and from another
// directory only from modules not marked internal with a leading underscore. ARCHITECTURE.md says what each layer is for. A new
// directory goes in LAYERS.

import { describe, expect, it } from 'vitest';

/** Each directory's layer: it may import from directories in lower layers. '.' is src/'s own files. */
const LAYERS: Record<string, number> = {
  storage: 0,
  types: 0,
  ui: 1,
  'page-cache': 1,
  markings: 1,
  fonts: 1,
  originals: 2,
  scores: 2,
  setlists: 3,
  render: 4,
  export: 5,
  dialogs: 6,
  reader: 7,
  library: 8,
  '.': 9,
};

/** The only files that use the kv store (storage/keys.ts names the one for each key). */
const usesStorage = (file: string) => /\/_?store\.ts$/.test(file) || file.startsWith('originals/') || file.startsWith('storage/');

const sources = import.meta.glob<string>(['./**/*.ts', '!./**/*.test.ts', '!./**/*.d.ts'], { query: '?raw', import: 'default', eager: true });
const files = Object.entries(sources).map(([path, text]) => ({ file: path.slice(2), text }));

/** The directory a file is in. */
const dirOf = (file: string) => (file.includes('/') ? file.slice(0, file.indexOf('/')) : file in LAYERS ? file : '.');

/** Where a relative import from `file` leads, from src/. */
function resolve(file: string, spec: string): string {
  const parts = file.split('/').slice(0, -1);
  for (const p of spec.split('/')) {
    if (p === '..') parts.pop();
    else if (p !== '.') parts.push(p);
  }
  return parts.join('/');
}

/** Each relative import: the names it takes, and where from. */
const imports = (text: string) => [...text.matchAll(/^import ([^;]*?) from '(\.[^']*)'/gm)].map((m) => ({ names: m[1], spec: m[2] }));

describe('layers', () => {
  it('lists every directory', () => {
    expect(files.map((f) => dirOf(f.file)).filter((d) => !(d in LAYERS))).toEqual([]);
  });

  it('imports only from lower layers', () => {
    const wrong: string[] = [];
    for (const { file, text } of files) {
      const from = dirOf(file);
      for (const { spec } of imports(text)) {
        const to = dirOf(resolve(file, spec));
        if (to !== from && LAYERS[to] >= LAYERS[from]) wrong.push(`${file} imports ${spec}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('imports a module whose name starts with an underscore only from its own directory', () => {
    const wrong: string[] = [];
    for (const { file, text } of files) {
      const from = dirOf(file);
      for (const { spec } of imports(text)) {
        const target = resolve(file, spec);
        if (dirOf(target) !== from && target.split('/').some((part) => part.startsWith('_'))) wrong.push(`${file} imports ${spec}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('uses storage only from the store modules and originals/', () => {
    const wrong = files.filter(({ file, text }) => !usesStorage(file) && imports(text).some(({ names, spec }) => resolve(file, spec) === 'storage' && /\bkv\b/.test(names)));
    expect(wrong.map((f) => f.file)).toEqual([]);
  });

  it('starts every module with a comment saying what belongs in it', () => {
    expect(files.filter((f) => !f.text.startsWith('//')).map((f) => f.file)).toEqual([]);
  });
});
