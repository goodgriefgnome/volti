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

- **Setlists**, above the scores in the library, play several pieces as one continuous score:
  turning past the end of a piece goes into the next, and each piece starts on a fresh screen.
  - Tick scores and use **Add to setlist**, or **Add to setlist** in a score's toolbar. The arrow
    beside a setlist shows its pieces, to reorder or remove; its **⋯** button has the rest.
  - A setlist can play part of a piece: **Excerpt** in its toolbar (or **Choose the excerpt to
    play…** in the library) picks the first and last cut to play.
  - Cuts and markings always belong to the piece: changing them in a setlist changes the piece,
    and every setlist's excerpts follow the change.
  - **Archive** hides a setlist behind **Show archived**; only archived setlists can be deleted.

Markings, cuts, setlists and the place you were at are stored in the app. They are not written into
the PDFs.

## Development

```sh
npm install
npm run dev        # local server with reload
npm test           # unit tests
npm run build      # type check and production build into dist/
```

Every push to `main` is tested, built and published to GitHub Pages by
`.github/workflows/deploy.yml`. Unit tests sit next to the modules they test, as `*.test.ts`. Each module starts with a comment saying what kind of code belongs in it; give a new
module one too.

| Path | What it does |
| --- | --- |
| `src/storage/` | IndexedDB key-value store, with every key listed in `keys.ts`; preferences |
| `src/sources/` | Where scores come from (linked folder, imported copies, shared-file inbox); opening PDFs with pdf.js |
| `src/pieces/` | Cuts and the played order (`model`), editing it (`edits`), laying it out on frames (`frames`), which cut owns a marking (`ownership`), loading and saving (`store`) |
| `src/setlists/` | Setlists, the excerpt of each piece they play, and keeping excerpts in step with cut edits |
| `src/markings/` | What can be drawn or placed on the music: each kind's data, geometry and drawing (`stroke` for pen and highlighter) |
| `src/library/` | The Library screen: setlists and scores |
| `src/reader/reader.ts` | The score screen, for a piece or a setlist: turning pages and pieces, applying edits, opening and closing |
| `src/reader/docs.ts` | The pieces being read, each PDF open only while near the one being read |
| `src/reader/saver.ts` | Saving pieces and setlists together |
| `src/reader/input.ts` | Pointers and keys: palm rejection, pinch and pan, handing a pointer to the selected tool, taps and swipes |
| `src/reader/tools/` | The toolbar's tools that act on the frames: pen and highlighter, eraser; `index.ts` lists them |
| `src/reader/toolbar.ts` | The toolbar |
| `src/reader/spread.ts` | Placing frames on the screen and drawing them |
| `src/reader/detail.ts` | The sharp close-up drawn while zoomed in |
| `src/reader/history.ts` | Undo and redo |
| `src/reader/setlist.ts` | How the reader shows where it is in a setlist: title, piece card, the box after a piece |
| `src/reader/excerpt-picker.ts` | Choosing the excerpt of a piece a setlist plays |
| `src/reader/cuts/` | Editing cuts on the frames: tabs and drags (`editor`), menus, the insert-pages picker, archived cuts |
| `src/reader/frames.ts` | Drawing a frame's music and ink |
| `src/reader/gestures.ts` | How taps, swipes and keys turn pages |
| `src/reader/layout.ts` | Fitting frames to the screen |
| `src/reader/zoom.ts` | Pinch and pan maths; which part of a page is in view |
| `src/ui/` | Shared by both screens: DOM helpers (`dom`), menus and dialogs, one at a time (`overlay`), messages (`toast`), and the setlist name and add-to menus (`setlists`) |
| `src/styles/` | Styles, one file per part of the app, imported in order by `main.ts` |
| `src/sw.ts` | Offline copy and the share target |

A piece's **ink** is all its markings, kept per cut; a **marking** is one thing drawn or placed on
the music, so far only pen and highlighter strokes. A new kind of marking (a post-it, text) goes in
`src/markings/`, as described at the top of `markings/model.ts`, with a tool to make it in
`src/reader/tools/`.

pdf.js comes from its legacy build, which carries fallbacks for JavaScript features newer than some
Android Chrome versions. Its fonts and image decoders are copied into `public/pdfjs/` before each
build (`scripts/copy-pdfjs.mjs`), so scanned scores also open offline.
