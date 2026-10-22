# Volti

*Volti subito*: turn the page, quickly.

A sheet-music reader for performing, built as an installable web app for Android tablets. It reads
PDF scores straight from a folder on the tablet, shows one or two pages per screen, and keeps pen
markings. It works offline once installed.

Live at **https://goodgriefgnome.github.io/volti/**. Open it in Chrome on the tablet, then use
**Add to home screen** (or **Install app**) from the Chrome menu.

## Using it

- **Link scores folder** reads every PDF in that folder and its subfolders. Android does not let
  apps link the Download folder itself or the top of internal storage; use a folder inside them,
  such as `Download/Scores` or `Documents/Scores`. After a restart, the first score you open asks
  for access again with one tap.
- **Add PDFs**, or **Share** a PDF to Volti from Files, Gmail or Drive, keeps a copy inside the app.
- In a score: tap the right side or swipe left for the next page, the left side or swipe right for
  the previous one, and the middle to show the toolbar. Page-turn pedals that send arrow or
  Page Up/Down keys work too.
- **Pen**, **Highlight** and **Erase** write with the stylus. Fingers keep turning pages and resting
  palms are ignored, unless **Finger writes** is on. The stylus eraser end or button erases too.

Markings and the last page you were on are stored in the app, per score. They are not written into
the PDFs.

## Development

```sh
npm install
npm run dev        # local server with reload
npm test           # unit tests
npm run build      # type check and production build into dist/
```

Every push to `main` is tested, built and published to GitHub Pages by
`.github/workflows/deploy.yml`.

| Path | What it does |
| --- | --- |
| `src/lib/library.ts` | Linked folder, imported scores, shared-file inbox |
| `src/viewer/viewer.ts` | The score screen: spreads, toolbar, pen input, undo |
| `src/viewer/turns.ts` | How taps, swipes and keys turn pages |
| `src/viewer/layout.ts` | Fitting pages to the screen; which pages a turn lands on |
| `src/viewer/renderer.ts` | pdf.js rendering, with neighbouring spreads drawn ahead of time |
| `src/ink/` | Stroke model, drawing and storage |
| `src/sw.ts` | Offline copy and the share target |

pdf.js comes from its legacy build, which carries fallbacks for JavaScript features newer than some
Android Chrome versions. Its fonts and image decoders are copied into `public/pdfjs/` before each
build (`scripts/copy-pdfjs.mjs`), so scanned scores also open offline.
