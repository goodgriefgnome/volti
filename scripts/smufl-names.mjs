// Makes src/fonts/smufl-names.json from SMuFL's glyphnames.json: each name and its code point, as a
// number. Run by hand when SMuFL publishes a new one: npm run smufl-names.

import { writeFile } from 'node:fs/promises';

const SOURCE = 'https://raw.githubusercontent.com/w3c/smufl/gh-pages/metadata/glyphnames.json';

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`${SOURCE}: ${res.status}`);
const names = await res.json();
const out = {};
for (const [name, { codepoint }] of Object.entries(names)) {
  // "U+ED14"; alternateCodepoint is left out.
  out[name] = parseInt(codepoint.slice(2), 16);
}
await writeFile(new URL('../src/fonts/smufl-names.json', import.meta.url), JSON.stringify(out));
console.log(`${Object.keys(out).length} names`);
