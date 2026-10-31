# Manual checks

Things to try on the tablet, grouped so each group can be done in one go. Some groups need
DevTools (Application → IndexedDB → `volti-scores` → `kv`) to watch the records.

- **A PDF that opens without a password is marked checked by any read:** with a setlist holding a
  PDF not opened since PDFs stopped going through pdf-lib, restart Volti and wait for the setlists'
  pages to finish saving; then open that score from the library: it opens without the first-open
  lag.
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
- **Backgrounds and default colours** (plan 4), on the tablet with a score open:
  1. In the library, Volti menu, **Marking colours…**: set the marking colour to dark red. Open a
     score: every symbol and text without a colour of its own is dark red; ones recoloured with a
     swatch, and pen strokes, are not. **Built-in** sets it back.
  2. With a symbol as the tool and a fingering selected, tap the **Default** swatch: it takes the
     default colour, and the Default swatch is pressed. With Pen as the tool, the Default swatch
     doesn't show.
  3. With a fingering selected, tap the box: a light blue box shows behind it, the staff lines
     darkened through it, not covered; the halo still shows round the glyph. Tap tag right: it
     points right, its point shorter than a 45° one. Tap none: it is gone. Undo steps back through
     each.
  4. Tap Text, choose tag left, and type "a tempo": it is placed with a tag pointing left. Type
     another: it has one too. Choose none: the next has none.
  5. Tap a text's tag just beyond its letters: it selects. The selection's box and corners include
     the tag; resizing scales it.
  6. The eraser takes a marking when it touches only its background.
  7. Cycle a fingering with a box: the next one keeps the box.
  8. In the library editor, give the 1 a box with its own yellow colour: the preview shows it. Place
     a 1: it has the yellow box. Change the library's 1 to no background: the placed one keeps its
     box.
  9. In **Marking colours…**, set the background colour to pink: boxes without their own colour are
     pink, the yellow one isn't.
  10. Export a score with backgrounds and open it in another PDF app: the boxes and tags show as in
      Volti, the music darkened through them, and go with their annotations when hidden or deleted.
- **Thumbnails draw again** (on the tablet):
  - Add excerpt, from the library's menu and from the reader's: the score's frames show at once,
    soft, then sharpen. The same when changing an excerpt's cuts and when choosing which part of a
    score to read.
  - Adding a file: the incoming screen's preview shows its pages.
- **Zooming with the toolbar hidden** (on the tablet, a score open, the toolbar hidden):
  - A pinch whose first finger goes down in the middle of the page shows the toolbar and zooms;
    lifting both fingers leaves it zoomed, and one finger then pans.
  - A pinch whose first finger goes down at a side turns the page, and doesn't zoom or show the
    toolbar.
  - A tap in the middle still shows the toolbar; a tap at a side still turns.
  - With Edit cuts on and the toolbar hidden: the same pinch shows the toolbar and zooms.
