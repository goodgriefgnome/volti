// The build step that writes licenses.txt next to the app: the licence of every library whose code
// ends up in it. The minifier drops the notices from the code itself, and most licences (MIT,
// Apache-2.0) ask for them to go wherever the code goes.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

/** The libraries found so far, by their directory in node_modules. Shared by the app's build and the service worker's. */
const found = new Set<string>();

const header = `Volti is free software under the GNU Affero General Public License, version 3 only. Its source:
https://github.com/goodgriefgnome/volti

Volti includes the libraries below, under their own licences. The fonts and pdf.js's data files
carry theirs next to them: fonts/*-OFL.txt and pdfjs/*/LICENSE*.`;

/** The package directory a module comes from: the last node_modules/<name> (or node_modules/@scope/<name>) in its id. */
function packageDir(id: string): string | undefined {
  const m = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(id.replace(/\\/g, '/').replace(/^\0/, ''));
  return m?.[1];
}

/** The MIT licence's text, for a copyright holder. */
const mit = (holder: string) => `MIT License. Copyright (c) ${holder}.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

/**
 * Notices for libraries that ship no licence file, written from their package.json, readme and
 * source headers. Checked by hand: look again when one of these is updated.
 */
const noFile: Record<string, string> = {
  fontkit: mit('Devon Govett'),
  dfa: mit('Devon Govett'),
  // fontkit uses its decoder (dec/), which is Google's.
  brotli: `${mit('Devon Govett')}

Its decoder (dec/) is Copyright 2013 Google Inc., licensed under the Apache License, Version 2.0:
the full text is under pdfjs-dist in this file.`,
};

/** A package's SPDX licence, in brackets: `(MIT)`, `(MIT AND Zlib)`. */
const licence = (spdx?: string) => !spdx ? '' : spdx.startsWith('(') ? spdx : `(${spdx})`;

/** The text of a package's licence: its licence file, else its entry in `noFile`. */
function licenceText(dir: string, name: string): string | undefined {
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)/i.test(f));
  return file ? readFileSync(join(dir, file), 'utf8').trim() : noFile[name];
}

/**
 * Collects the libraries in the bundle and writes licenses.txt. Give each build its own `licenses()`
 * (the service worker's is built apart, by vite-plugin-pwa); each writes every library found so far,
 * so the file written last lists them all.
 */
export function licenses(): Plugin {
  return {
    name: 'volti-licenses',
    apply: 'build',
    generateBundle(_, bundle) {
      for (const out of Object.values(bundle)) {
        if (out.type !== 'chunk') continue;
        for (const id of out.moduleIds) {
          const dir = packageDir(id);
          if (dir) found.add(dir);
        }
      }
    },
    writeBundle(options) {
      const entries = [...found]
        .map((dir) => ({ dir, pkg: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name: string; version: string; license?: string } }))
        // The same version nested in two places is listed once.
        .filter((e, i, all) => all.findIndex((o) => o.pkg.name === e.pkg.name && o.pkg.version === e.pkg.version) === i)
        .sort((a, b) => a.pkg.name.localeCompare(b.pkg.name));
      const rule = '-'.repeat(80);
      const missing: string[] = [];
      const parts = entries.map(({ dir, pkg }) => {
        const text = licenceText(dir, pkg.name);
        if (!text) missing.push(pkg.name);
        return `${rule}\n${pkg.name} ${pkg.version} ${licence(pkg.license)}\n${rule}\n\n${text}`;
      });
      // Fail the build rather than let the list be quietly short.
      if (missing.length) throw new Error(`licenses: no licence file, and none in noFile, for ${missing.join(', ')}`);
      writeFileSync(join(options.dir!, 'licenses.txt'), `${header}\n\n${parts.join('\n\n')}\n`);
    },
  };
}
