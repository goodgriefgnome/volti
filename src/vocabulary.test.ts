// The spellings docs/vocabulary-spec.md retired, kept: each concept has one spelling, so a retired
// one found in a file of src/ (TypeScript and CSS, tests excluded) is a failure, whether it is an
// identifier, a file name, a CSS class or a word in a comment. `wins` is the spelling that replaces
// it. A name from a browser or library API that must stay is in ALLOWED.

import { describe, expect, it } from 'vitest';

/** The last stage of the vocabulary plan that is done: the entries of later stages are not yet checked. */
const DONE = 1;

interface Retired {
  /** Tested on the text with identifiers split into words ('words': `spreadEl` is "spread El") or as it is ('raw'). */
  on: 'words' | 'raw';
  goes: RegExp;
  wins: string;
  stage: number;
  /** Only the files whose path from src/ matches. */
  in?: RegExp;
}

const RETIRED: Retired[] = [
  // Stage 2: the reader and drawing.
  { on: 'words', goes: /\bspreads?\b/i, wins: 'screen', stage: 2 },
  { on: 'words', goes: /\b(paint|paints|painted|painting|repaint)\b/i, wins: 'draw', stage: 2 },
  { on: 'raw', goes: /\bRenderedPdf\b/, wins: 'MusicPdf', stage: 2 },
  { on: 'words', goes: /\bdetail\b/i, wins: 'close-up', stage: 2 },
  // Stage 3: markings, aspects, named excerpts, delete and remove.
  { on: 'words', goes: /\b(mark colors?|placed mark|mark extent)\b/i, wins: 'marking', stage: 3 },
  { on: 'words', goes: /\bmarks?\b/i, wins: 'tick', stage: 3, in: /^(face\/|styles\/face\.css)/ },
  { on: 'words', goes: /\bshapes\b/i, wins: 'aspects', stage: 3, in: /^(library\/|originals\/read\/original\.ts|scores\/(store|excerpts)\.ts)/ },
  { on: 'raw', goes: /\b(ExcerptHost|addExcerpt|renameExcerpt|changeExcerptCuts|changeExcerpt|deleteExcerpt|removeName|deleteNamed)\b/, wins: 'named excerpt', stage: 3 },
  { on: 'raw', goes: /\b(removeGroup|removeSymbol)\b/, wins: 'deleteGroup, deleteSymbol', stage: 3 },
  { on: 'words', goes: /\bremove[sd]?\b/i, wins: 'delete', stage: 3, in: /^face\/dialog\.ts/ },
  // Stage 4: originals, face, status.
  { on: 'words', goes: /\b(trash|untrash)\b/i, wins: 'removed, bin', stage: 4 },
  { on: 'words', goes: /\bmisc\b/i, wins: 'incoming', stage: 4 },
  { on: 'words', goes: /\b(dir|dirs)\b/i, wins: 'folder', stage: 4 },
  { on: 'words', goes: /\bpersist(s|ed|ing)?\b/i, wins: 'save', stage: 4 },
  { on: 'words', goes: /\bsheet\b/i, wins: 'blankCanvas', stage: 4 },
  { on: 'raw', goes: /\b(keepOriginalsOffline|keepSetlistPagesOffline|pinOffline|keepOffline)\b/, wins: 'pin', stage: 4 },
  { on: 'words', goes: /\bmodel\b/i, wins: 'fit', stage: 4, in: /^face\/(?!_landmarker)/ },
  { on: 'raw', goes: /\b(FolderState|folderState|FaceButtonState|buttonState)\b|button-state/, wins: 'status', stage: 4 },
  // Stage 5: pickers and thumbnails.
  { on: 'words', goes: /\b(choose|chooses|chooser|chosen)\b/i, wins: 'pick, picker', stage: 5 },
  { on: 'words', goes: /\bthumbs?\b/i, wins: 'thumbnail', stage: 5 },
];

/** Names that stay: an API's own (the browser's, Drive's, a library's), or another thing with the same word. */
const ALLOWED: { text: string; in?: string }[] = [
  { text: 'Paint' }, // a fill or a stroke, as a path is drawn with (markings/draw.ts, export/_annotations.ts)
  { text: 'trashed' }, // Drive's query parameter
  { text: 'cut-mark' }, // a cut's mark on a thumbnail
];

const sources = import.meta.glob<string>(['./**/*.ts', './**/*.css', '!./**/*.test.ts', '!./**/*.d.ts'], { query: '?raw', import: 'default', eager: true });

/** The text with each allowed name taken out. */
function cleaned(file: string, text: string): string {
  let out = text;
  for (const a of ALLOWED) if (!a.in || a.in === file) out = out.split(a.text).join(' ');
  return out;
}

/** The text with each identifier split into its words: `spreadEl`, `_spread`, `.spread-el` are "spread El". */
const words = (text: string) => text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ');

describe('vocabulary', () => {
  it('reads the sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100);
  });

  for (const r of RETIRED.filter((e) => e.stage <= DONE)) {
    it(`no ${r.goes} (${r.wins})`, () => {
      const found: string[] = [];
      for (const [path, text] of Object.entries(sources)) {
        const file = path.slice(2);
        if (r.in && !r.in.test(file)) continue;
        const clean = cleaned(file, text);
        const lines = (r.on === 'words' ? words(clean) : clean).split('\n');
        lines.forEach((l, i) => { if (r.goes.test(l)) found.push(`${file}:${i + 1}: ${l.trim().slice(0, 100)}`); });
      }
      expect(found).toEqual([]);
    });
  }
});
