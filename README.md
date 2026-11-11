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
  asks for access again with one tap (**Allow access**, beside the name), and so does opening a
  setlist whose pages aren't all saved. One whose pages are all saved plays without it, asking only
  when turning to a page with nothing saved, or for something on the toolbar that reads the PDFs
  (**Cuts**, or changing an excerpt). When allowing access takes long and the reader doesn't go full
  screen, it does at the next turn. Coming back to Volti after a
  while (say, from the Files app) reads the folder again, so PDFs added meanwhile appear. A PDF
  changed in place is noticed a little after the library shows.
- **Link scores folder** also offers **A folder in Google Drive** (where this build has a Google
  client; browsers that can't pick a folder on the device, such as on an iPad, go straight to it).
  It signs in to Google on Google's own page, then shows Volti's folder chooser, from My Drive down.
  Volti is not verified by Google, so the first sign-in shows "Google hasn't verified this app":
  choose **Advanced**, then continue. Volti asks for the full Drive scope, as it renames, moves,
  removes and writes files there; up to 100 accounts can sign in while it is unverified. Scans only
  list the folder (nothing is downloaded); a score is downloaded the first time it is opened and
  kept on the tablet, so it opens offline after that, and setlists' scores are kept for good.
  Removing a score puts its file in Drive's trash, and nothing is kept on the tablet: **Recently
  removed** takes it out of the trash again (for as long as Drive keeps it there). When Google stops accepting the sign-in
  (access removed, password changed, or long unused), the banner says **Sign in to Google Drive**.
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
  excerpts stay, as for any score whose file is missing. A score removed from a Drive folder is in
  Drive's trash, not kept by Volti: it can be put back only while that folder is linked, and the
  list shows those of other folders apart, under **In another folder's bin**, without **Put back**.
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
- A score, excerpt or setlist opens ready to play, with the toolbar hidden. Press the right side for
  the next page and the left side for the previous one; tap the middle to show the toolbar. While
  the toolbar shows, the shaded bands at the sides turn the page. The back arrow at the top left, there with the toolbar hidden too, goes
  back to the library. Page-turn pedals that send arrow or Page Up/Down keys work too.
- In a score (not a setlist), turning on past its end says which score comes next in the library;
  turning on again opens it. The same back, from a score's start, opens the one before at its end.
- The **⋯** at the right of the reader's toolbar has what the library's **⋯** menu has for what
  is read: for a score, a named excerpt or a setlist. (Adding scores to a setlist and moving,
  changing and removing its entries are in the title menu, below, as are adding, changing and
  deleting a score's named excerpts.)
- The reader is always light, whatever the app's theme (its menus and dialogs too, while it is
  open). Its toolbar is one row: the back arrow, the title with the page info under it, the tools as icons
  (**Pen**, **Highlight**, **Erase**, **Text**, **Symbols**), **Cuts**, **Undo**, **Redo** and **⋯**.
- A long press on **Pen** or **Highlight** opens its colours (**Default** first, with a dashed ring, which
  follows the library's Marking colours); the button shows the colour in a short bar under its icon.
- **Face gestures** turn the page from the front camera, by gestures you define: in **Face gestures…**
  in the library's **⋯** menu, add a gesture (a wink, the mouth pushed to one side), record yourself doing
  it while playing, and set it to **Next**, **Back** or **None**, with its **On** and **Release** levels
  and **Hold**. While the toolbar is hidden, a button at the top right turns watching on and off; a long
  press on it opens the settings. The camera is only on while watching, and nothing leaves the device:
  the model runs in the app.
- Each tool's settings (Pen's and Highlight's colour, Text's font, colour and background, Symbols' colour)
  are kept across restarts. Highlights are drawn at full strength, multiplied, so the notes under
  them stay black.
- The title in the reader's toolbar opens a menu of what can be read next to what is read, the
  current one highlighted: in a setlist, its entries; in a score or a named excerpt, **Whole
  score** and the score's named excerpts. Tapping a row reads it. The menu has more:
  - In a setlist, **+** adds scores at the end; each entry has a grip to drag it to another place,
    a swap icon to change the excerpt it plays (any entry, not only the one read) and a bin to remove
    it, after asking. Removing the entry being read goes on to the next one; with none left, back to
    the library.
  - In a score, **+** adds a named excerpt; each excerpt has a swap icon, to change its name and
    cuts together (every setlist that plays it follows), and a bin to delete it, after asking.
    Deleting the excerpt being read goes on to the next one, or the one before; with none left, back to
    the library.
  - The menu stays open after the buttons, and opens again when a dialog from it closes.
- Showing the toolbar doesn't move the pages: it covers the top of them. Drag (one finger, with no
  tool in use) or pinch (two fingers) to bring the top out from under it, or to zoom in or out;
  the pages can't be moved so that less of them shows, and can't be made smaller than they fit
  below the toolbar. Turning the page shows the new screen whole below the toolbar, centred.
  Hiding the toolbar puts the pages back at full size. With the toolbar hidden, a pinch that
  starts with a finger in the middle of the page shows the toolbar and zooms.
- **Pen**, **Highlight** and **Erase** work with the stylus or one finger; two fingers still zoom
  and drag. A palm resting on the screen is ignored while the stylus writes. The stylus eraser end
  or button erases too.
- **Symbols** in the toolbar shows the last symbol picked (at first, the first of the first group)
  and makes it the tool; tap it again to put the tool away. A long press on it opens the library
  on the left, one box per group and **Recent** (the symbols placed through **+** and not in a
  group) under its heading, then **+** and **Edit library…**. Tapping a symbol makes it the tool and
  closes the panel; dragging one drops it at any place in any group or in Recent (a dashed box
  at the end makes a new group of it; a group emptied goes; Recent keeps 8). Groups are reordered
  in **Edit library…**.
- With **Text** or **Symbols** as the tool, a tap on empty music places a marking (it isn't
  selected). A tap on a placed marking selects it; a tap on the selected one changes a symbol to the
  next in its group (which becomes the tool's symbol) or edits text. With a marking selected, a tap
  anywhere on the music only deselects it. Dragging a placed marking moves it; dragging a corner of
  the selected one resizes it.
- With **Text** or **Symbols** as the tool, pressing on empty music shows what will be placed under
  the finger: the symbol (in its colour and background) or, for Text, the word **Ag** in the text's
  font, size and background, tinted blue. It follows the finger onto any page on the screen;
  letting go places it there (Text opens the typing field there), and letting go anywhere but on a
  page places nothing. A tap places it where tapped.
- While a symbol or text is placed, moved or resized by dragging, a round loupe above the finger
  (beside it, near the toolbar) shows the music and markings around it, magnified so the marking
  is about 48 px tall (never less than on screen), until the finger lifts. Its music is redrawn sharp
  for the magnification a moment after it appears.
- A long press on **Text** opens its **Font**, **Colour**, **Background** and, once a shape is chosen,
  **Background colour**; on **Symbols**, **Colour**, **Background** and **Background colour**.
  **Colour** is **Default** and the three pen colours. A choice changes the selected marking (of
  that tool) and what new ones get (for Symbols' background: the library symbol, which the next
  one placed is a copy of). The **Text** button shows a **T** in its font, colour and background;
  **Symbols** shows its symbol in its colour and background; with a marking selected, each shows
  the selected marking's.  There is no second row.
- **Cuts** shows the tabs and shading with which you change what is played and in what order, on the
  pages themselves (it doesn't move the pages; tap it again to hide them). A
  score's pages are made of cuts: bands of the PDF's pages (its *original pages*), stacked in the
  order they are played.
  - Drag the faint tab at the top left or bottom right of a cut to cut music away or bring it
    back. The grey tab at the top right of a page adds white space above the music.
  - Right-click or press and hold on the music for more: cut it in two there, insert original
    pages (for a repeat), or remove a cut. A cut with markings on it is archived rather than deleted; the **Insert** menu lists it, and has **Delete archived cuts…**. Press
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
    **Preview** there adds other parts of a score; the swap icon beside an entry in the
    reader's title menu, or **Change excerpt…** on an entry in the library, changes the part an entry
    plays. Either way, tap the first and last cut to play. An excerpt is named by the score's
    pages it plays, with a letter for a cut that shares its page: **Page 2b – 4** starts at page 2's
    second cut. Pinch the thumbnails there to
    zoom in, and drag to move along them.
  - **Named excerpts**: **Add excerpt…** in a score's **⋯** menu names part of it ("Kyrie"). The
    arrow beside the score lists them; each one's **⋯** renames it, changes its cuts or deletes it.
    Tapping one reads only its cuts, as a setlist entry playing it does, always from its start;
    there the title menu's swap icon changes its name and cuts and **Add to setlist** adds it.
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

Linking a Google Drive folder needs a Google OAuth client (type Web application) whose ID and secret
are given at build time, never committed: the deployed build takes them from the repository's
Actions secrets `DRIVE_CLIENT_ID` and `DRIVE_CLIENT_SECRET`, and a local build from `.env.local`
(`VITE_DRIVE_CLIENT_ID=…` and `VITE_DRIVE_CLIENT_SECRET=…`; Git ignores it). The client must list
the app's address as a redirect URI: `https://goodgriefgnome.github.io/volti/`, and
`http://localhost:5173/volti/` for signing in locally. A build without them has no Drive.

Every push to `main` is tested, built and published to GitHub Pages by
`.github/workflows/deploy.yml`.

How the code is put together (the words it uses, which directory holds what and may use what, and
where to start on the usual changes) is in [ARCHITECTURE.md](ARCHITECTURE.md).

pdf.js comes from its legacy build, which carries fallbacks for JavaScript features newer than some
Android Chrome versions. Its fonts and image decoders are copied into `public/pdfjs/` before each
build (`scripts/copy-pdfjs.mjs`), so scanned scores also open offline.

## Licence

Volti is free software under the GNU Affero General Public License, version 3 only: see
[LICENSE](LICENSE). The libraries it ships with keep their own licences (MIT, Apache-2.0, 0BSD and
Zlib). The build writes their notices to `licenses.txt` beside the app, which **Licences** in the
library's ⋯ menu opens (`scripts/licenses.ts`); it fails if a library has no licence file and none
is written out for it there.
