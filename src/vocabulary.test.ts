// The spellings the vocabulary spec retired, kept: each concept has one spelling, so a retired
// one found in a file of src/ (TypeScript and CSS, tests excluded) is a failure, whether it is an
// identifier, a file name, a CSS class or a word in a comment. `wins` is the spelling that replaces
// it. A name from a browser or library API that must stay is in ALLOWED.

import { describe, expect, it } from 'vitest';

interface Retired {
  /** Tested on the text with identifiers split into words ('words': `spreadEl` is "spread El") or as it is ('raw'). */
  on: 'words' | 'raw';
  goes: RegExp;
  wins: string;
  /** Only the files whose path from src/ matches. */
  in?: RegExp;
}

const RETIRED: Retired[] = [
  { on: 'words', goes: /\bspreads?\b/i, wins: 'screen' },
  { on: 'words', goes: /\b(paint|paints|painted|painting|repaint)\b/i, wins: 'draw' },
  { on: 'raw', goes: /\bRenderedPdf\b/, wins: 'MusicPdf' },
  { on: 'words', goes: /\bdetail\b/i, wins: 'close-up' },
  { on: 'words', goes: /\b(mark colors?|placed mark|mark extent)\b/i, wins: 'marking' },
  { on: 'words', goes: /\b(mark|prior mark|symbol mark|text mark)\b/i, wins: 'marking', in: /^(scores\/placing|reader\/(_input|_loupe|reader|_tools\/))/ },
  { on: 'words', goes: /\bmarks?\b/i, wins: 'tick', in: /^(face\/|styles\/face\.css)/ },
  { on: 'words', goes: /\bshapes\b/i, wins: 'aspects', in: /^(library\/|originals\/read\/original\.ts|scores\/(store|excerpts)\.ts)/ },
  { on: 'raw', goes: /\b(ExcerptHost|addExcerpt|renameExcerpt|changeExcerptCuts|changeExcerpt|deleteExcerpt|removeName|deleteNamed)\b/, wins: 'named excerpt' },
  { on: 'raw', goes: /\b(removeGroup|removeSymbol)\b/, wins: 'deleteGroup, deleteSymbol' },
  { on: 'words', goes: /\bremove[sd]?\b/i, wins: 'delete', in: /^face\/dialog\.ts/ },
  { on: 'words', goes: /\b(trash|untrash)\b/i, wins: 'removed, bin' },
  { on: 'words', goes: /\bmisc\b/i, wins: 'incoming' },
  { on: 'words', goes: /\b(dir|dirs)\b/i, wins: 'folder', in: /^(originals\/(?!read\/)|page-cache\/)/ },
  { on: 'words', goes: /\bpersist(s|ed|ing)?\b/i, wins: 'save' },
  { on: 'words', goes: /\bsheet\b/i, wins: 'blankCanvas' },
  { on: 'raw', goes: /\b(keepOriginalsOffline|keepSetlistPagesOffline|pinOffline|keepOffline)\b/, wins: 'pin' },
  { on: 'words', goes: /\bmodel\b/i, wins: 'fit', in: /^face\/(?!_landmarker|watcher)/ },
  { on: 'raw', goes: /\b(FolderState|folderState|FaceButtonState|buttonState)\b|button-state/, wins: 'status' },
  { on: 'words', goes: /\b(choose|chooses|choosing|chooser|chosen)\b/i, wins: 'pick, picker' },
  { on: 'words', goes: /\bthumbs?\b/i, wins: 'thumbnail' },
  { on: 'raw', goes: /data-state|dataset\.state/, wins: 'data-status' },
  { on: 'raw', goes: /\bscore\(|\bsignal\b/, wins: 'strength', in: /^(face\/|styles\/face\.css)/ },
  { on: 'words', goes: /\bcaps?\b|\bcapped\b/i, wins: 'limit', in: /^(face\/|styles\/face\.css)/ },
];

/** Names that stay: an API's own (the browser's, Drive's, a library's), or another thing with the same word. */
const ALLOWED: { text: string; in?: string }[] = [
  { text: 'Paint' }, // a fill or a stroke, as a path is drawn with (markings/draw.ts, export/_annotations.ts)
  { text: 'trashed' }, // Drive's query parameter
  { text: 'placed-mark-colors' }, // a stored key, which is not renamed (STORAGE.md)
  { text: 'storage?.persist?.()', in: 'main.ts' }, // the browser's own
  { text: 'cut-mark' }, // a cut's mark on a thumbnail
  { text: 'paint', in: 'markings/draw.ts' }, // a variable of type Paint
  { text: 'paint', in: 'export/_annotations.ts' },
  { text: 'e.detail', in: 'reader/_cuts/_editor.ts' }, // the DOM event's
  { text: 'is spread over', in: 'scores/placing.ts' }, // the English verb
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

  for (const r of RETIRED) {
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
