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
- **Symbol markings** (placing symbols from the starter library), on the tablet with a score open
  and the toolbar showing:
  1. Tap **Symbols**: a second row shows two groups, 1 and *pp*. The toolbar's height grows with
     it and the page-turn bands start below it.
  2. Tap the 1 button: it is pressed. Tap the music: a 1 appears where you tapped, with its box
     and handles. Tap the 1 button again: it shows 2. Tap the music elsewhere: a 2 appears, and
     the 1 loses its box.
  3. Tap the 2 on the music: it turns into 3, then 4, 5, 1. Undo steps back through each.
  4. Long-press the *pp* button: all six dynamics show; choose *mf* and place it. It is bigger
     than the fingerings in proportion to Bravura's own sizes (both at scale 1).
  5. Resize a fingering by a corner, then place another: it comes at the new size. Resize from
     each corner: the opposite one stays put.
  6. Drag a symbol into another cut and to another system; cut edits (split, merge, archive) keep
     it with its music.
  7. Choose the red swatch with a symbol selected: it turns red, and the tool is still the symbol.
  8. Zoom in: symbols are sharp in the close-up, and their halo shows where they cross staff
     lines.
  9. Use the pen: in the side bands it turns the page while a symbol is the tool; with Pen it
     writes as before.
  10. Erase a symbol with the eraser; delete one with its button.
  11. Export the score as a PDF and open it in another PDF app: each symbol is a Stamp annotation,
      looks as it did in Volti, and can be hidden or deleted.
  12. Airplane mode, the app reopened: the Symbols row still works, and placing still works (the
      font and fontkit came from the offline copy).
  13. Hide the groups with **Symbols** while a symbol is the tool: the row still shows (the
      spec's second row), and placing still works.
  14. Plan 2, the library editor and glyph picker: the row now shows the two groups, then **+** and
      **Edit library…**, and no ad-hoc group yet.
  15. Tap **+**: the picker opens on Bravura with every glyph. Scroll to the end: glyphs draw as
      they come into view, without stalling.
  16. Search "fermata": only fermatas show. Tap one: it appears in the characters and the preview,
      and its name shows under the grid. Tap **Place**, then the music: the fermata is placed, and
      the ad-hoc group shows it after the groups.
  17. Place nine different ad-hoc symbols through **+**: the ad-hoc group's long press shows the
      newest eight.
  18. Long-press the ad-hoc group, tap **To group**, choose the fingerings: the symbol moves to the
      end of the fingerings, and is gone from the ad-hoc group.
  19. Through **+**, pick fingering 3 (already in a group): the tool becomes the fingerings' 3, and
      the ad-hoc group doesn't change.
  20. **Edit library…**: the groups show. Add a group, add a symbol to it with **Pick glyphs…**:
      "fingering4", "fingeringSubstitutionDash", "fingering5", then **Use** and **OK**: it is in the
      new group, and the toolbar shows it.
  21. Change that symbol's scale to 0.7: the preview shrinks beside fingering 1; placed ones don't
      change, newly placed ones are smaller.
  22. Move the dynamics group up (the ⋯ button of its row); delete a symbol; delete a group with
      symbols (it asks first). Placed symbols stay, and the deleted ones no longer cycle.
  23. Export a score with fingerings and open it in another PDF app: the stamps' comments read
      "fingering4" and so on, not boxes.
  24. Airplane mode, the app reopened: the picker's search still works (the names came from the
      offline copy), and the editor still makes symbols.
- **Text markings** (plan 3), on the tablet with a score open:
  1. Tap **Text**, then the music: a caret blinks where you tapped, and the keyboard opens without
     the music moving or shrinking. Type "rit.": it shows in Academico, at the size it will be.
  2. Press Enter: "rit." stays exactly where it was typed (no jump), with its halo, selected.
  3. Tap a staff low on the page, so the field is where the keyboard will be: the music moves up so
     the field shows above the keyboard, and back down after Enter.
  4. Tap the text once more: the field opens on it. Add " poco a poco", press Enter: it grows to
     the right from where it started. Undo: back to "rit.".
  5. Edit it, delete everything, press Enter: it is gone. Undo brings it back.
  6. Start typing, press Escape (or the keyboard's back): nothing is placed, and the reader doesn't
     close. Start typing and tap elsewhere on the music: the text is placed, and no second field
     opens.
  7. Resize a text by a corner, then place a new text: it comes at the new size; a new fingering
     comes at the size it did before.
  8. In a score with no symbols, resize a text, then place a fingering: the fingering follows the
     text (same size relation as before the resize).
  9. With Text as the tool, tap a fingering twice: it cycles. With a symbol as the tool, tap a text
     twice: it opens for editing.
  10. Recolour a text with a swatch; drag it into the next system; delete it with its button.
  11. Zoom in, then type: the field and the text are at the zoomed size, and sharp.
  12. Export the score and open it in another PDF app: each text is a FreeText annotation showing
      as in Volti, whose comment is the text.
  13. In the library editor, make a symbol in Academico ("Ped.", scale 0.6): it places like any
      symbol.
  14. "AV" typed in the field and placed: the kerning looks the same before and after Enter.
