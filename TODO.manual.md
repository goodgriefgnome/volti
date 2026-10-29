# Manual checks

Things to try on the tablet, grouped so each group can be done in one go. Some groups need
DevTools (Application → IndexedDB → `volti-scores` → `kv`) to watch the records.

- **Reading, with any score open** (no setup):
  - Turning: the page turns as the finger goes down, at the sides with the toolbar hidden; with it
    showing, only in the shaded band at each side (a cut tab there still takes the press first),
    and a tap elsewhere hides the toolbar. The chevron at the toolbar's right end hides it.
  - The pen: nothing turns while the pen is down or just after it lifts, and turning no longer
    puts the pen away. Watch for a palm landing in a band before the pen touches, and a pinch or
    pan whose first finger lands in a band: they turn the page.
  - Writing with the pen and erasing, zoomed in and out, with the palm resting. Editing cuts by
    long press and by dragging tabs.
  - Drawing: reading, turning quickly, zooming in and out and close-ups look as before, on a PDF
    and on a phone photo. Rotate the tablet: pages show at once, soft, then sharpen. Turn quickly:
    no page from an earlier screen flashes onto a later one.
  - Thumbnails: the excerpt picker on a long score, the cut editor's insert picker and the
    incoming screen's preview each fill at once, then sharpen.
  - A phone photo shows upright, and sharp at every width and in the zoomed close-up.
  - Opening times: how long the first page of a large PDF and of a large photo takes, and turning
    to and zooming in on a big photo.
  - A long setlist doesn't run the tablet out of memory.
  - With a setlist whose pages aren't all saved yet (the library shows it saving), open a PDF
    score: its first page shows as quickly as with nothing saving.
  - In the installed app, with the tablet in landscape, let a setlist of portrait PDF pages finish
    saving, then turn on airplane mode and play it: each page is sharp at once, with no blurred
    stand-in first.
- **Offline pages, score by score, for both orientations:**
  1. With the tablet in landscape, let a setlist finish saving; then in airplane mode, play it
     in landscape and in portrait: every page is sharp at once, with no blurred stand-in first.
  2. Restart Volti with the tablet upright: the setlist stays ready (the landscape pages aren't
     unpinned), and the setlists section's saved size doesn't drop.
  3. With the scores folder locked, a setlist with pages still to save says it needs access;
     with a PDF whose password isn't given, it says that score needs its password.
  4. While a setlist saves, open a score from the library: it shows as quickly as with nothing
     saving.
- **Originals closed when done with, one open file per id:**
  1. Open a long PDF never opened before: it opens noticeably sooner than before, as it is
     read and opened once.
  2. Turn through a long setlist and back, go back to the library and open the same score
     again, choose an excerpt, add scores to a setlist with previews, add a file shared to
     Volti, export a setlist: no "Closed more often than it was got" or "Used after it was
     closed" in the console (`chrome://inspect`).
  3. With a setlist saving in the background, read a score in it and turn pages quickly: no
     "Could not draw this page".
- **Full screen at the tap:**
  1. With the scores folder open, open a PDF score, an image score and a setlist from the library:
     full screen starts at the tap, and the first screen shows once, at full size, with no jump.
  2. Close Volti so the scores folder locks (the library says so), then open a score: access is
     asked for and the score opens (going full screen as late as before, or not at all if Chrome
     refuses it). Open a setlist while locked: it goes full screen at the tap.
  3. A score that fails to open (refuse its password): the library shows again, not in full
     screen, at the place it was scrolled to.
  4. Going back to the library still leaves full screen, at the place it was scrolled to.
- **A PDF that opens without a password is marked checked by any read:** with a setlist holding a
  PDF not opened since PDFs stopped going through pdf-lib, restart Volti and wait for the setlists'
  pages to finish saving; then open that score from the library: it opens without the first-open
  lag.
- **Reader's middle tap and band icons:**
  1. With the toolbar hidden, press near the left and right edges, and just inside 40% from each
     side: the page turns as the finger goes down.
  2. Tap the middle: the toolbar shows. Drag or long-press in the middle: nothing happens.
  3. There is no button at the top right; the back arrow at the top left still goes to the
     library.
  4. With the toolbar showing, each band shows its triangle, centred, over both dark stage and
     white paper. Tapping a band turns the page, and the pen writes in a band as before.
  5. With a pen tool selected and the toolbar hidden, the pen in the middle shows the toolbar
     rather than writing.
- **Reading PDFs without pdf-lib:**
  1. Open a large unencrypted PDF that isn't saved yet: its first page shows noticeably sooner
     than before.
  2. Add an encrypted PDF with a user password: the password is asked for once; a wrong one asks
     again, saying so. Close and open it again, and after a restart: not asked.
  3. Open a PDF that is encrypted with only an owner password (it opens in Chrome without one): no
     password is asked, and it shows.
  4. A setlist with an encrypted PDF never opened: the setlists section says it needs its
     password; opening the score asks for it, and then its pages are saved.
  5. Export a score from each of 2 and 3, and from a PDF whose encryption pdf-decrypt doesn't
     know (if one is at hand): the export works, or for the last says why it is pictures.
- **Passwords and unusual PDFs:**
  - No lock icon anywhere.
  - A password-protected PDF asks for its password the first time it is opened, previewed in the
    incoming screen, or added to a setlist (from a score's ⋯ menu or Add scores; Cancel leaves it
    out), then never again. One that only stops printing doesn't ask.
  - Ones from Acrobat (often AES-128, even when they only stop printing) and ones with a password
    open sharp.
- **Exporting:**
  - With no folder linked, it goes to the share sheet. With a folder linked, it goes into Exports,
    and asks for write access when Export is tapped if it isn't allowed yet.
  - Open an export in another PDF app (Acrobat, Xodo, the browser): the pen (thicker where pressed
    harder) and highlighter (notes under it still black) look as in Volti, and the app lists them
    as annotations it can hide or delete.
  - Plain PDFs, password-protected and Acrobat ones, and photos export at "Original quality". A
    turned JPEG says it was recompressed.
  - A PDF with an encryption pdf-decrypt doesn't know exports with its pages drawn as sharp as in
    the reader, and the dialog says it was rasterized.
- **Starting with no folder linked** (a fresh install, or after unlinking):
  - Add two PDFs with Add PDFs. The incoming screen shows each file's pages (pinch and drag), its
    name and folder (and one folder for all), and New, Already in the library (left out, saying
    where), or a path taken (another name or folder, or Replace).
  - They go at the top of Volti's own folder, with two `original:` records whose `where.kind` is
    `internal`. Opening one gives its record `aspects`. No Added badge anywhere.
  - Move and rename them.
- **Linking a folder** (straight after the group above):
  - Link a folder holding one of the same PDFs, one new one, and one whose name matches a
    different file in Volti's own folder.
  - The scores in Volti's own folder move into it at their paths (in the Files app too). The one
    the folder already has is dropped: its record becomes `folder`, and its file is gone from OPFS
    `library/`. The one whose name is taken opens the incoming screen. Leave it out: the library's
    ⋯ menu offers "Move the score left in Volti…" to open it again.
  - On a big folder, the library shows at once with the scores already known, and new ones appear
    one by one with "Reading new scores: n left…". Each is hashed once: reload, and nothing is
    hashed again.
  - Rename and move a score from the app: its `path` changes, and nothing is hashed again.
  - Duplicates: copy a PDF in the folder under another name. The library shows it once, and the
    record keeps the old path. Delete the original copy and check the folder: the record moves to
    the copy's path.
  - Add a PDF to the folder in the Files app, and switch back to Volti after half a minute or more:
    it appears without asking.
  - Unlink: the library is empty. Relink the same folder: scores, markings and setlists are back,
    and nothing is hashed again. Link a different folder: the old folder's records become `gone`.
- **Removing and putting back:**
  - Remove a score from its ⋯ menu, in the library and in the reader. Its file leaves the folder
    (gone in the Files app too), its record is `removed`, and the file is in OPFS `removed/`.
  - The library's ⋯ menu lists it under Recently removed. Put back puts it where it was, with its
    cuts and markings: the record is `folder` again, and `removed/` is empty.
  - Putting back a file whose place is now taken opens the incoming screen for it.
  - The storage view shows Trash.
  - Purge: set a removed record's `removedAt` to 8 days ago in DevTools and reload. The record is
    `gone`, its bytes are deleted, and it has left the list.
- **Sharing from another app** (Android):
  - Share a PDF while Volti is closed. Its record is `inbox`, with bytes in OPFS `inbox/`. Open
    Volti: the incoming screen shows it. Cancel: it's in Recently removed. Share it again: it's in
    the inbox again, and `removed/` no longer has it.
  - Share a PDF the library has: nothing changes, and no inbox entry appears.
  - With no folder linked, a shared file goes at the top of Volti's own folder. With one linked, it
    goes at the top of the folder (in the Files app too).
- **After a restart, before tapping Allow access** (folder linked):
  - The library lists the folder's scores from their records.
  - Shared files wait, and are added once Allow access is tapped.
  - These each ask for access themselves: opening a score, adding a password-protected one to a
    setlist, opening one for a dialog (Add excerpt), and renaming or moving one. Refusing says so.
    Allowing goes on, and the library reads the folder again.
  - Play a setlist whose pages are saved: it opens without asking. Turn the tablet: its pages show
    soft, from the saved ones. Edit cuts and Export ask for access, and Allow access redraws
    sharp.
  - The storage view shows Setlist pages and Page cache as two parts.
- **A setlist with a score whose file is gone** (delete one score's PDF in the Files app, then
  check the folder): rotate the tablet while playing the setlist. The gone score's pages show
  soft, from the saved ones. "Not saved for this screen" shows only for a page with nothing saved
  at all.
- **On a device that had an earlier version:**
  - After the first start, the old keys and the `volti` database are gone, and scores, ink and
    setlists are all still there.
  - A folder linked before the storage change is still linked (`folder` held a bare handle then).
