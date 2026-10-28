# Volti

*Volti subito*: turn the page, quickly.

A sheet-music reader for performing, built as an installable web app for Android tablets. It reads
PDF scores straight from a folder on the tablet, shows one or two pages per screen, and keeps pen
markings. It works offline once installed.

Live at **https://goodgriefgnome.github.io/volti/**. Open it in Chrome on the tablet, then use
**Add to home screen** (or **Install app**) from the Chrome menu.

## Using it

- **Link scores folder** reads every PDF and image in that folder and its subfolders. Android does
  not let apps link the Download folder itself or the top of internal storage; use a folder inside
  them, such as `Download/Scores` or `Documents/Scores`. After a restart, the first score you open
  asks for access again with one tap (**Allow access**, beside the name); a setlist whose pages
  are saved plays without it, asking only for a page that isn't. Coming back to Volti after a
  while (say, from the Files app) reads the folder again, so PDFs added meanwhile appear.
- Without a linked folder (before one is linked, or where the browser can't link one), the
  library is a folder of Volti's own, inside the app, read the same way. Linking a folder moves
  its scores into the folder at their paths, overwriting nothing: one the folder has already is
  dropped, and one whose name is taken there opens the screen for incoming files (one left out
  waits in Volti, and the **⋯** menu offers it again). Unlinking leaves the library empty; cuts,
  markings and setlists stay, for when the folder is linked again.
- The **⋯** beside the name has the scores folder's **Check for new scores**, **Change folder…**
  and **Unlink**, **Recently removed…**, and the storage Volti uses on the tablet: metadata (cuts,
  markings, setlists), added scores (those in Volti's own folder), setlist pages (the pages
  setlists play, saved so they show at once), the page cache (other pages saved), the trash (Recently removed) and the offline binary (the app itself,
  kept for working offline).
- The scores at the top of the folder come first, then a list for each subfolder ("Masses /
  Latin"), which its heading opens and closes; Volti remembers which are closed.
- An image (a photo or scan: JPEG, PNG, WebP, or HEIC where the tablet can show it) is a score of
  one page, just like a PDF; a photo shows the way up the camera held it.
- **Add PDFs** (images too), or **Share** a PDF or image to Volti from Files, Gmail or Drive, opens
  a screen with a row for each file: its pages, its name (to change one such as `IMG_2041.jpg`),
  its folder (or one for every file at once), and what happens to it. A file the library already
  has is left out, saying where it is; one whose name is taken there needs another name or
  folder, or to replace that file (which goes to Recently removed). **Add** puts them into the
  scores folder, or Volti's own while none is linked; **Leave out** or **Cancel** drops them.
  Shared files wait until access to the scores folder is allowed.
- **Move to folder…** in a score's **⋯** menu moves its file into a subfolder (one there is, or a
  new one), making the folder if it isn't there yet; **None** moves it to the top. Its cuts,
  markings and setlists stay with it. A folder it leaves empty stays.
- **Remove** in a score's **⋯** menu moves its file into **Recently removed** for a week, then it
  is deleted for good; **Put back** there puts it back where it was (through the same screen,
  when another file is there now). Its cuts, markings and
  excerpts stay, as for any score whose file is missing.
- A PDF protected by a password asks for it the first time it is opened. Volti remembers it on
  this tablet, so it asks only once. An exported PDF of it has no password. Adding one to a setlist
  asks for its password then, if it hasn't been given, so a setlist never asks while it plays.
  One that only stops printing or copying doesn't ask.
- **Rename…** in a score's **⋯** menu renames its PDF. Volti asks to change files in the scores
  folder (not only read them) when it is linked, and with the one tap that allows access again
  after a restart, so renaming and exporting don't ask separately.
- A score belongs to its PDF's contents, not its name: renaming or moving a PDF keeps its cuts,
  markings, excerpts and place in setlists, and a setlist's **Missing** score plays again once its
  PDF is back. A PDF changed by another app is a new score. Volti reads a PDF whole the first time
  it sees it (and after it changes), so linking a big folder takes a moment.
- Each page on the screen takes the shape of the PDF pages it shows. A page of the screen's own
  orientation fills it; one of the other shares it with the next: portrait pages side by side on a
  landscape screen, landscape pages one above the other on a portrait one. Rotating the tablet
  keeps the music at the top of the screen in place.
- A score, excerpt or setlist opens ready to play, with the toolbar hidden. Tap the right side or
  swipe left for the next page, the left side or swipe right for the previous one, and the middle
  to show the toolbar. The back arrow at the top left, there with the toolbar hidden too, goes
  back to the library. Page-turn pedals that send arrow or Page Up/Down keys work too.
- In a score (not a setlist), turning on past its end says which score comes next in the library;
  turning on again opens it. The same back, from a score's start, opens the one before at its end.
- The **⋯** at the right of the reader's toolbar has what the library's **⋯** menu has for what
  is read: for a score, a named excerpt or a setlist, and in a setlist, for the entry being read
  too (Move up, Move down, Remove from setlist). Removing the entry or deleting the named excerpt
  being read goes on to the next one; with none left, back to the library.
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
  Tapping a setlist plays it from its first score, as a performance does; tapping one of its
  scores starts there.
  - **New setlist**, or **Add scores…** in a setlist's **⋯** menu, picks the scores to add; so does
    **Add to setlist…** in the **⋯** menu of a score or a named excerpt. That menu also has **Add to** the setlist a score was last added to (or the first
    setlist, until one has been). The arrow
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
  - Volti keeps the pages setlists play (not archived ones) saved, drawn for this tablet's
    screen in the background, so a setlist opens, and turns between its scores, at once. A page
    read at a new size (the tablet turned, say) is kept at that size too once it has been drawn.

- **Export PDF…** in the **⋯** menu of a score, a named excerpt or a setlist makes a PDF that
  reads as the reader does, one of its pages to a PDF page: its cuts, in order, with their markings, and
  each setlist entry starting on a new page. Markings go in as PDF annotations that look as they
  do in Volti (pen pressure, see-through highlighter and all), so other PDF apps can hide or
  delete them. Name the file; it goes in an **Exports** folder in the
  scores folder (which then shows in the library too), or, with no folder linked, to the share
  sheet. The music is the original's own, password-protected PDFs included; the dialog says
  **Rasterized** for a score whose encryption Volti can't undo (AES-128), whose pages then go in
  as pictures.

Markings, cuts, setlists and the place you were at are stored in the app. They are not written into
the PDFs.

## Development

```sh
npm install
npm run dev        # local server with reload
npm test           # unit tests
npm run build      # type check and production build into dist/
```

The installed app takes a new version only as it starts: it shows a start screen, looks for one
for up to 3 seconds, and if it finds one says "Updating Volti…" and reloads into it. A version
published while the app is open waits for its next start, or for a tap on **Update**, which shows
in the library's banner once it has downloaded (`src/updates.ts`).

Every push to `main` is tested, built and published to GitHub Pages by
`.github/workflows/deploy.yml`.

How the code is put together (the words it uses, which directory holds what and may use what, and
where to start on the usual changes) is in [ARCHITECTURE.md](ARCHITECTURE.md).

pdf.js comes from its legacy build, which carries fallbacks for JavaScript features newer than some
Android Chrome versions. Its fonts and image decoders are copied into `public/pdfjs/` before each
build (`scripts/copy-pdfjs.mjs`), so scanned scores also open offline.
