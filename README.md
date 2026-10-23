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
  A copy of a PDF that is also in the scores folder is deleted; the score stays.
- **Rename…** in a score's **⋯** menu renames its PDF. The first time, Volti asks for permission to
  change files in the scores folder.
- A score belongs to its PDF's contents, not its name: renaming or moving a PDF keeps its cuts,
  markings, excerpts and place in setlists, and a setlist's **Missing** score plays again once its
  PDF is back. A PDF changed by another app is a new score. Volti reads a PDF whole the first time
  it sees it (and after it changes), so linking a big folder takes a moment.
- In a score: tap the right side or swipe left for the next page, the left side or swipe right for
  the previous one, and the middle to show the toolbar. Page-turn pedals that send arrow or
  Page Up/Down keys work too.
- While the toolbar shows, pinch with two fingers to zoom in and drag to move around; **Fit page**
  zooms back out. Turning the page or hiding the toolbar also zooms out.
- **Pen**, **Highlight** and **Erase** work with the stylus or one finger; two fingers still zoom
  and pan. A palm resting on the screen is ignored while the stylus writes. The stylus eraser end
  or button erases too.
- **Edit cuts** lets you change what is played and in what order, on the pages themselves. A
  score's pages are made of cuts: bands of the PDF's pages (its *original pages*), stacked in the
  order they are played.
  - Drag the faint tab at the top left or bottom right of a cut to cut music away or bring it
    back. The grey tab at the top right of a page adds white space above the music.
  - Right-click or press and hold on the music for more: cut it in two there, insert original
    pages (for a repeat), or remove a cut. A cut with markings on it is archived rather than deleted. Press
    and hold on a tab to restore music you cut or join two cuts.
  - When the page before has room left, a faint shading shows how much of this page would fit
    there. Cut inside the shading to move the top of this page up onto it.

- **Setlists**, above the scores in the library, play several scores as one continuous score:
  turning past the end of a score goes into the next, and each score starts on a fresh screen.
  - **New setlist**, or **Add scores…** in a setlist's **⋯** menu, picks the scores to add; so does
    **Add to setlist** in a score's toolbar. The arrow
    beside a setlist shows its scores, to reorder or remove; its **⋯** button has the rest.
  - A setlist can play part of a score, and can come back to the same score (the Kyrie, another
    piece, then the Gloria). **Add scores** lists each score's named excerpts under it, to add them as they are, and
    **Preview** there adds other parts of a score; **Excerpt** in the
    reader's toolbar, or **Change excerpt…** on an entry in the library, changes the part an entry
    plays. Either way, tap the first and last cut to play. An excerpt is named by the score's
    pages it plays, with a letter for a cut that shares its page: **Page 2b – 4** starts at page 2's
    second cut. Pinch the thumbnails there to
    zoom in, and drag to move along them.
  - **Named excerpts**: **Add excerpt…** in a score's **⋯** menu names part of it ("Kyrie"). The
    arrow beside the score lists them; each one's **⋯** renames it, changes its cuts or deletes it.
    Tapping one reads only its cuts, as a setlist entry playing it does, always from its start;
    there **Excerpt** changes its cuts and **Add to setlist** adds it.
  - **Excerpts** in a score's toolbar lists its named excerpts too: tap one to go to it, or add,
    rename, change or delete them there.
    A setlist entry that plays the same cuts plays the named excerpt and shows its name, so
    changing its cuts changes every setlist that plays it. Deleting one only takes the name away.
    Searching the library finds excerpts by name too, shown with their score's name.
  - Cuts and markings always belong to the score: changing them in a setlist changes the score,
    and every setlist's excerpts follow the change.
  - **Archive** hides a setlist behind **Show archived**; only archived setlists can be deleted.

- **Export PDF…** in the **⋯** menu of a score, a named excerpt or a setlist makes a PDF that
  reads as the reader does with 1 page on the screen: its cuts, in order, with their markings, and
  each setlist entry starting on a new page. Name the file; it goes in an **Exports** folder in the
  scores folder (which then shows in the library too), or, with no folder linked, to the share
  sheet.

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

A **score** is what is shown of its **original** (a PDF), as cuts in played order; a score's id is
its original's id, the SHA-256 of the PDF. A **setlist** is a list of excerpts of scores: each the whole score, or a span of
its cuts kept only in that setlist.

| Path | What it does |
| --- | --- |
| `src/storage/` | IndexedDB key-value store, with every key listed in `keys.ts`; preferences |
| `src/originals/` | Scores' originals: the PDFs in the linked folder or imported, the shared-file inbox, and reading PDFs with pdf.js |
| `src/scores/` | A score: its cuts in played order (`model`), editing it (`edits`), laying it out on frames (`frames`), which cut owns a marking (`ownership`), loading and saving (`store`) |
| `src/setlists/` | Setlists, the excerpt of each score they play, and keeping excerpts in step with cut edits |
| `src/markings/` | What can be drawn or placed on the music: each kind's data, geometry and drawing (`stroke` for pen and highlighter) |
| `src/library/` | The Library screen: setlists and scores |
| `src/export/` | Exporting scores as PDFs (pdf-lib, loaded only to export): pages laid out as the reader's frames, and where each cut goes on them (`placement`) |
| `src/reader/reader.ts` | The score screen, for a score or a setlist: turning pages and scores, applying edits, opening and closing |
| `src/reader/open-scores.ts` | The scores being read, each original open only while near the one being read |
| `src/reader/saver.ts` | Saving scores and setlists together |
| `src/reader/input.ts` | Pointers and keys: palm rejection, pinch and pan, handing a pointer to the selected tool, taps and swipes |
| `src/reader/tools/` | The toolbar's tools that act on the frames: pen and highlighter, eraser; `index.ts` lists them |
| `src/reader/toolbar.ts` | The toolbar |
| `src/reader/spread.ts` | Placing frames on the screen and drawing them |
| `src/reader/detail.ts` | The sharp close-up drawn while zoomed in |
| `src/reader/history.ts` | Undo and redo |
| `src/reader/setlist.ts` | How the reader shows where it is in a setlist: title, score card, the box after a score |
| `src/reader/cuts/` | Editing cuts on the frames: tabs and drags (`editor`), menus, the insert-pages picker, archived cuts |
| `src/reader/frames.ts` | Drawing a frame's music and ink |
| `src/reader/gestures.ts` | How taps, swipes and keys turn pages |
| `src/reader/layout.ts` | Fitting frames to the screen |
| `src/reader/zoom.ts` | Pinch and pan maths; which part of a page is in view |
| `src/ui/` | Shared by both screens: DOM helpers (`dom`), menus and dialogs, one at a time (`overlay`), messages (`toast`), the setlist name and add-to menus (`setlists`), choosing an excerpt (`excerpt-picker`), and the named excerpt dialogs (`excerpts`) |
| `src/styles/` | Styles, one file per part of the app, imported in order by `main.ts` |
| `src/sw.ts` | Offline copy and the share target |

A score's **ink** is all its markings, kept per cut; a **marking** is one thing drawn or placed on
the music, so far only pen and highlighter strokes. A new kind of marking (a post-it, text) goes in
`src/markings/`, as described at the top of `markings/model.ts`, with a tool to make it in
`src/reader/tools/`.

pdf.js comes from its legacy build, which carries fallbacks for JavaScript features newer than some
Android Chrome versions. Its fonts and image decoders are copied into `public/pdfjs/` before each
build (`scripts/copy-pdfjs.mjs`), so scanned scores also open offline.
