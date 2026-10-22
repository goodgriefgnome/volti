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
- While the toolbar shows, pinch with two fingers to zoom in and drag to move around; **Fit page**
  zooms back out. Turning the page or hiding the toolbar also zooms out.
- **Pen**, **Highlight** and **Erase** work with the stylus or one finger; two fingers still zoom
  and pan. A palm resting on the screen is ignored while the stylus writes. The stylus eraser end
  or button erases too.
- **Edit cuts** lets you change the order the pages are played in, on the pages themselves:
  - Drag the faint tab at the top left or bottom right of a cut to cut music away or bring it
    back. The grey tab at the top right of a page adds white space above the music.
  - Right-click or press and hold on the music for more: cut it in two there, insert pages (for
    a repeat), or remove a cut. A cut with markings on it is archived rather than deleted. Press
    and hold on a tab to restore music you cut or join two cuts.
  - When the page before has room left, a faint shading shows how much of this page would fit
    there. Cut inside the shading to move the top of this page up onto it.

Markings, cuts and the place you were at are stored in the app, per score. They are not written into
the PDFs.

## Development

```sh
npm install
npm run dev        # local server with reload
npm test           # unit tests
npm run build      # type check and production build into dist/
```

Every push to `main` is tested, built and published to GitHub Pages by
`.github/workflows/deploy.yml`. Unit tests sit next to the modules they test, as `*.test.ts`.

| Path | What it does |
| --- | --- |
| `src/storage/` | IndexedDB key-value store, with every key listed in `keys.ts`; preferences |
| `src/sources/` | Where scores come from (linked folder, imported copies, shared-file inbox); opening PDFs with pdf.js |
| `src/pieces/` | Cuts and the played order (`model`), editing it (`edits`), laying it out on frames (`frames`), which cut owns a stroke (`ink`), loading and saving (`store`) |
| `src/ink/` | Stroke model and drawing |
| `src/library/` | The Library screen |
| `src/reader/reader.ts` | The score screen: spreads, toolbar, pen input, undo |
| `src/reader/cuts/` | Editing cuts on the frames: tabs and drags (`editor`), menus, the insert-pages picker, archived cuts |
| `src/reader/frames.ts` | Drawing a frame's music and ink |
| `src/reader/gestures.ts` | How taps, swipes and keys turn pages |
| `src/reader/layout.ts` | Fitting frames to the screen |
| `src/reader/zoom.ts` | Pinch and pan maths; which part of a page is in view |
| `src/ui/` | DOM helpers, menus and dialogs, shared by both screens |
| `src/sw.ts` | Offline copy and the share target |

pdf.js comes from its legacy build, which carries fallbacks for JavaScript features newer than some
Android Chrome versions. Its fonts and image decoders are copied into `public/pdfjs/` before each
build (`scripts/copy-pdfjs.mjs`), so scanned scores also open offline.
