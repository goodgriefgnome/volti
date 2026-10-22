// Copies the pdf.js data files (fonts, decoders, character maps) into public/
// so they are served next to the app and included in the offline copy.
import { cpSync, rmSync } from 'node:fs';

const src = 'node_modules/pdfjs-dist';
const dest = 'public/pdfjs';
rmSync(dest, { recursive: true, force: true });
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  cpSync(`${src}/${dir}`, `${dest}/${dir}`, {
    recursive: true,
    // quickjs runs PDF form scripts, which a score reader never needs
    filter: (path) => !path.includes('quickjs'),
  });
}
