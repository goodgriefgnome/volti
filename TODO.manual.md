# Manual checks

Things to try on the tablet, grouped so each group can be done in one go. Some groups need
DevTools (Application → IndexedDB → `volti-scores` → `kv`) to watch the records.

- **The loupe stays smooth** (dragging a marking):
  - Drag a small fingering on a zoomed-out spread, and on a page with many pen strokes: the
    ghost, the marking and the loupe follow smoothly.
  - Zoom in far (about 7× or more on a 2-pixel-ratio screen, 4.5× on a 3) and drag: the loupe's
    music is sharp where the drag starts, and past about 64 px of dragging turns softer rather
    than slowing the drag. At lower zoom it still turns sharp wherever it goes.
  - Lift: the marking is placed where the last move was.
- **A long press makes the tool the tool:**
  - With no tool, long-press Pen, Highlight, Text, then Symbols in turn: each becomes the tool
    (lit; for Symbols, the last symbol picked) and its panel opens.
  - Long-press the button of the tool already in use: its panel opens, and it stays the tool (it
    is not put away).
  - Select a symbol under Symbols, long-press Text: it is the tool, the symbol is deselected, and
    the panel shows the settings for new text. Choosing a setting in a panel doesn't change the
    tool.
- **Reordering groups in the Symbols panel** (a grip at each group's left edge, not on Recent):
  - Drag a group by its grip up or down: a line shows where it would go; let go: it is there.
    A press on a symbol still picks or drags the symbol, not the group.
  - With Symbols as the tool, move the tool's group, and groups around it: the tool's symbol stays
    lit and the button shows the same symbol. Pick a non-first symbol in a group, move that group:
    the long press on the Symbols button, and the next tap on it, still give that symbol.
  - Edit library… shows the new order.
- **The Symbols panel stays open on a pick:**
  - Tap a symbol in the panel: it is the tool and is lit, and the panel stays open; tap another:
    that one is lit instead. The settings beside the library follow the symbol picked.
  - Tap outside the panel: it closes. **+** and **Edit library…** still close it.
- **Selecting with no tool** (toolbar showing, no tool lit):
  - Tap a placed symbol or text: it is selected. Tap it again: a symbol goes to the next in its
    group, text opens for editing. Tap another marking: that one is selected.
  - Drag a marking, or the selected one's corner: it moves or resizes, with the loupe.
  - With one selected, tap empty music: only deselected, the toolbar stays. Tap again: the toolbar
    hides.
  - Press on empty music and drag: the spread pans, and the selection stays.
  - Choose a tool (and back to none): the selection ends. Pen, Highlight and Erase still draw or
    erase on a tap.
- **Selecting another marking** (with Text or Symbols as the tool):
  - Select a symbol, then tap another marking: that one is selected, not deselected.
  - With one selected, tap empty music: only deselected, nothing placed.
  - Tap the selected one: a symbol goes to the next in its group, text opens for editing.
- **The loupe** (marking tools, stage 8):
  - Placing, moving and resizing a symbol: a round loupe above the finger, the symbol about 48 px
    tall in it, centred on the symbol; near the toolbar it moves beside the finger.
  - Zoomed far in, the loupe shows the symbol at its size on screen, not smaller.
  - (Stage 9) The music in the loupe is sharp after a moment, and stays so as the finger moves
    on, also across to the facing page; the ink in it (the symbol being dragged) is sharp at once.
- **Placing by dragging** (marking tools, stage 7):
  - Press on empty music with Symbols: the symbol shows under the finger; drag it onto the facing
    page and let go: placed there. Drag it off the pages (onto the grey stage) and let go: nothing.
  - With Text: "Ag" follows the finger in a bluish tint; let go: the typing field opens there,
    empty.
  - With a marking selected, press and drag on empty music: it is deselected and the ghost follows.
- **Selecting** (marking tools, stage 6):
  - Place a symbol: it isn't selected. Tap it: selected. Tap it again: the next in its group, and
    the next placed is that one too.
  - With a symbol selected, tap empty music: it is deselected and nothing is placed. Tap another
    marking: only deselected.
- **The Symbols panel** (marking tools, stage 5):
  - Long-press Symbols: the groups in boxes, Recent under its heading, only the tool's symbol lit.
    Tap one: it is the tool (see the next group).
  - Drag a symbol within its group: it goes where dropped. Drag one to another group, to Recent,
    and to the dashed box (only there while dragging): a new last group.
  - Drag the last symbol out of a group: the group is gone. Drag a ninth into Recent: the oldest
    goes.
  - Drag the tool's symbol elsewhere: it is still the tool.
  - Add groups in Edit library until the panel is taller than the screen: the library side
    scrolls, the settings stay.
  - There is no second row for any tool.
- **Text and Symbols settings** (marking tools, stage 4):
  - Long-press Text: Font, Colour, Background. Pick a box: Background colour appears. The T on the
    button shows the font, colour and box.
  - Select a text marking: the T shows its look; change its colour in the panel: the marking
    changes, and new text gets that colour too.
  - Select a symbol and give it a box in the Symbols panel: the next time that symbol is placed it
    has the box; another symbol doesn't.
  - The second row shows only with Symbols as the tool, and has no Font, Colour or Background.
- **Pen and Highlight colours** (marking tools, stage 3):
  - Long-press Pen: its swatches, Default first with a dashed ring. Pick red: the bar under Pen is
    red, and Pen draws red. Tap Pen: it's picked or put away as before.
  - The same for Highlight, with Default, yellow, green and pink.
  - Long-press a group button in the second row (still there): its symbols menu opens as before.
- **Tool settings kept** (marking tools, stage 2):
  - Choose red for Pen, close the reader and Volti, open them again: Pen is still red.
  - A new highlight is light blue (Default) and the notes under it stay black. An old yellow
    highlight is now strong yellow.
  - Change the Marking colour in the library: Pen on Default draws in the new colour; old strokes
    keep theirs.
- **The light reader** (marking tools, stage 1):
  - With the app in dark mode, open a score: the reader is light, and so are ⋯ and the title
    menu. Close it: the library is dark again.
  - The toolbar is off-white; a pressed tool is white with a thin ring.
  - The title and the page info are on two lines, starting at the same edge.
  - At about 600 px wide (a small tablet in portrait, or a narrow browser window), the tools are
    on a centred second row and Cuts is only its icon. At 700 px and wider, one row.
  - The side bands, their triangles, the hidden-toolbar back arrow and the cut tabs are all
    visible on the light stage.
- **A PDF that opens without a password is marked checked by any read:** with a setlist holding a
  PDF not opened since PDFs stopped going through pdf-lib, restart Volti and wait for the setlists'
  pages to finish saving; then open that score from the library: it opens without the first-open
  lag.
- **Reading PDFs without pdf-lib:** open a large unencrypted PDF that isn't saved yet: its first
  page shows noticeably sooner than before.
- **Protected PDFs** (with a password, or encrypted without one):
  - No lock icon anywhere.
  - A PDF with a user password asks for it the first time it is opened, previewed in the incoming
    screen, or added to a setlist (from a score's ⋯ menu or Add scores; Cancel leaves it out); a
    wrong one asks again, saying so. Close and open it again, and after a restart: not asked.
  - One encrypted with only an owner password (it opens in Chrome without one; it may only stop
    printing): no password is asked, and it shows.
  - Ones from Acrobat (often AES-128, even when they only stop printing) and ones with a password
    open sharp.
  - A setlist with an encrypted PDF never opened: the setlists section says it needs its password;
    opening the score asks for it, and then its pages are saved.
  - Exporting: password-protected and Acrobat ones export at "Original quality". One whose
    encryption pdf-decrypt doesn't know (if one is at hand) exports with its pages drawn as sharp
    as in the reader, and the dialog says it was rasterized.
- **Exporting:**
  - With no folder linked, it goes to the share sheet. With a folder linked, it goes into Exports,
    and asks for write access when Export is tapped if it isn't allowed yet.
  - Open an export in another PDF app (Acrobat, Xodo, the browser): the pen (thicker where pressed
    harder) and highlighter (notes under it still black) look as in Volti, and the app lists them
    as annotations it can hide or delete.
  - Plain PDFs and photos export at "Original quality" (protected ones: see Protected PDFs). A
    turned JPEG says it was recompressed.
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
- **Scanning the linked folder by names first** (folder linked):
  - Restart, allow access, and open a score at once: it opens in about the time it takes once the
    library has settled, not several seconds more.
  - Add three PDFs to the folder in the Files app, and come back to Volti: "Reading new scores"
    counts them down, and they appear.
  - Rename a PDF in the Files app, and come back: it shows under its new name, with its cuts and
    markings.
  - Delete a PDF in the Files app, and come back: it is gone from the library (its setlist entries
    say so).
  - Replace a PDF in the Files app with a different file of the same name, and come back: a moment
    after the library shows, the score changes to the new file's (its old cuts and markings aren't
    on it).
  - Unlink, then link the same folder: everything is back, and nothing is hashed again.
- **The toolbar redesign: the pages under the toolbar:**
  - Open a score; tap the middle: the toolbar shows and the pages don't move.
  - With no tool, drag down: the top of the page comes out from under the toolbar and stops when
    its top meets the toolbar. Drag up: it goes back, and stops at the screen's bottom edge.
  - Pinch out: the pages shrink until they fit below the toolbar, and no further. Pinch in, then
    drag: nothing moves past the screen's edges.
  - Turn the page with a side band: the next page shows whole below the toolbar, centred. Turn
    back: the same.
  - Tap the middle with no tool: the toolbar hides and the page is at full size again.
  - In a setlist, turn past the end of a score: the next score's first page shows whole below the
    toolbar.
  - Rotate the tablet with the toolbar showing: the page shows whole below it.
  - There is no **Fit page** and no hide button.
- **The toolbar redesign: Cuts:**
  - Tap **Cuts**: the tabs show and the pages don't move. Drag down to reach the top tabs; drag one:
    the cut changes. Tap a tab: nothing happens. Press and hold the music with no tool: the cut menu.
  - With Pen on and the cuts showing: drawing works; a press on a tab drags the tab.
  - Remove a cut with markings, then press and hold: **Insert** lists it, and has **Delete archived
    cuts…**. There is no **Archived** on the toolbar.
- **The toolbar redesign: the title menu, for getting around:**
  - In a setlist, tap the title: its entries, the current one highlighted. Tap another: it opens.
  - In a score: **Whole score** highlighted, then its excerpts. Tap one: it reads that excerpt; tap
    the title again: that excerpt is highlighted; **Whole score** goes back to the whole score.
  - There is no **Scores** button.
- **The toolbar redesign: the title menu's controls:**
  - Drag an entry by its grip: it moves; the menu stays open with the new order.
  - Swap on another entry: the excerpt picker for it; choose cuts; the menu comes back with its
    excerpt's name.
  - Bin on the current entry: asked first; **Remove** goes on to the next entry, and the menu
    comes back with that entry highlighted; **Undo** in the toast puts it back.
  - **+**: Add scores; the added ones are at the end, and the menu comes back.
  - Swap on an excerpt: the picker with its name; change the name and the cuts: both change, and a
    setlist that played it plays the new cuts.
  - Bin on the excerpt being read: asked first; then the next excerpt is read.
  - **+** in a score: Add excerpt.
  - The ⋯ menu has no Add scores, Move up, Move down, Remove from setlist, Rename (of an excerpt)
    or Delete (of an excerpt). There is no **Excerpt** or **Excerpts** button.
- **The toolbar redesign: Symbols as a tool:**
  - Open a score: the Symbols button shows the first symbol of the first group. Tap it: it is the
    tool, its group pressed in the second row. Tap it again: the tool is put away and the second
    row goes.
  - Pick *pp* in its group, put the tool away, tap Text, then Symbols: *pp* is the tool again, and
    the button showed *pp* meanwhile.
  - Delete *pp* in **Edit library…**: the button shows its group's first symbol.
  - Close the reader and open it again: the button shows the first symbol of the first group.
- **The toolbar redesign: colours:**
  - Pen: three colours in the top row. Highlight and Erase: none.
  - Text or Symbols with nothing selected: Colour and Background are greyed out. Select a marking:
    they change it; **Default** gives it the default colour.
- **The toolbar redesign: the look:** the toolbar matches the mocks in landscape (one row: back,
  title with its chevron, page info, then the tools as icons between thin rules, **Cuts** with its
  label, Undo and Redo, and ⋯); in portrait the title shortens before anything wraps. The second
  row, for Text and Symbols, is a little lighter, with a hairline above.
