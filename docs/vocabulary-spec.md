# One spelling per concept: spec

What the code's vocabulary must be once each concept has one spelling, in identifiers, file
names, CSS classes, comments, the docs and the words on screen alike. The Words table in
`ARCHITECTURE.md` is the lasting list of terms; everything here ends up there or in the rules
under it. `docs/vocabulary-plan.md` says how to get here in stages; where the two disagree, this
spec wins. Nothing the app does changes, except two button labels and one dialog title below.

## Rules

- A concept has one spelling. An identifier, a file name, a CSS class, a comment, a doc and a
  label on screen all use it. An abbreviation is a second spelling (`thumb` for thumbnail), so
  there are none.
- Prose and labels are British (colour, licence); identifiers and CSS are American (`color`),
  because CSS is. That is one word in two dialects, not two words, and `ARCHITECTURE.md` says so
  in one line.
- A browser or library API keeps its own names (`getDirectory`, `FileSystemDirectoryHandle`,
  `pointerType === 'touch'`, Drive's `trashed` query parameter, pdf-lib's calls). Volti's own
  names for the same things follow this spec.
- Tools are named in prose by their names in the code: the hand, the pen, the highlighter, the
  eraser, text, symbols. Their button labels (Hand, Pen, Highlight, Erase, Text, Symbols) stay,
  since `ToolName` is a key in stored tool settings and is not renamed.
- **Delete** destroys a thing for good (a setlist, a named excerpt, a symbol or its group, a
  gesture and its trials). **Remove** takes a thing out of a list or into Recently removed, where
  it still exists (an entry from a setlist, a cut from the played order, a score's file from the
  library). Labels and identifiers both follow this.
- **Status** is an enumeration saying how a thing is now (`FolderStatus`: ready, locked, …;
  `CameraStatus`; `OfflineStatus`; `FaceButtonStatus`). **State** is the data a thing holds
  (`State`, a score and its ink; `DetectorState`).
- `src/vocabulary.test.ts` lists each spelling this spec retires, with the one that replaces it,
  and fails on any file in `src/` (TypeScript and CSS, tests excluded) that still uses it as a
  whole word. API names that must stay are allowed by exact token.

## The spellings

Each row: the concept, the spelling that wins, the spellings that go, and where they are now.

| Concept | Wins | Goes | Where now |
| --- | --- | --- | --- |
| The frames shown at once | **screen** | spread | `reader/reader.ts` (`spreadEl`, comments), `reader/_spread.ts`, `reader/_tools/_selection.ts`, `render/zoom.ts:15`, CSS `.spread`, `TODO.md`, `TODO.manual.md`, `docs/reader-split-*.md`, `docs/face-classifier-spec.md` |
| The module that defines `FrameSlot` and places and draws slots | `reader/_slots.ts` | `_spread.ts` | |
| Drawing anything onto a canvas or a PDF | **draw** | paint, render | `render/paint.ts` → `render/draw.ts`; `paintSlot`, `paintSlotInk` → `drawSlot`, `drawSlotInk`; every `paint`, `paintInk`, `paintState`, `repaint` identifier in `reader/` → the `draw` form; `RenderedPdf` → `MusicPdf` (the Words table already calls it "its music as a PDF") |
| A fill or a stroke, as a path is drawn with | `Paint` (`markings/draw.ts`) | | Stays: a graphics term for a different thing. One Words row says so. |
| One thing drawn or placed on the music | **marking** | mark | `PlacedMark` → `PlacedMarking`; `MarkColors`, `markColors`, `setMarkColors`, `loadMarkColors`, `saveMarkColors` → `MarkingColors`, `markingColors`, …; `markExtent` → `markingExtent`; `library/_mark-colors.ts` → `_marking-colors.ts`, `openMarkColors` → `openMarkingColors`; CSS `.mark-colors-row` → `.marking-colors-row` |
| The notch on a level slider in the face dialog | **tick** | mark | `face/dialog.ts:168-185` (`mark`, `releaseMark`, `placeMarks`), CSS `.mark`, `.mark.release` in `face.css` → `.tick`, `.tick.release`. `.cut-mark` in `_cuts/_menus.ts` is a cut's mark on a thumbnail and stays. |
| Each original page's height / width | **aspects** | shapes | `library/_host.ts:27`, `library/library.ts:53` and uses; `originals/read/original.ts:101`; prose "page shapes" in `originals/types.ts:35`, `originals/read/_pdf.ts:1`, `scores/store.ts:20`, `scores/excerpts.ts:37`, `library/_host.ts:25`, `original.ts:32`. "Each original page's shape" stays only as the gloss in the Words table. |
| Volti's own store of removed files | **removed** | trash | `originals/trash-fs.ts` → `removed-fs.ts`; prose "trash" meaning it anywhere |
| A root's own bin for removed files | **bin** | trash | `originals/drive/_api.ts` `trash()` → `bin()`, `untrash` → `unbin`, and the comments; `drive/_root.ts:182`; `drive/_fake.ts`; prose "Drive's trash" → "Drive's bin", except where it quotes Google's own label |
| Choosing one of several in a dialog | **pick**, **picker** | choose, chooser | `library/_drive-folders.ts` ("folder chooser", `chooseDriveFolder` → `pickDriveFolder`, title "Choose the scores folder" → "Pick the scores folder"); `library/library.ts:227-234`; `_setlists-section.ts` `chooseExcerpt` → `pickExcerpt`; `dialogs/setlists.ts` `chooseSetlist` → `pickSetlist`; `originals/drive/score-fs.ts:2`, `drive/_api.ts:12`; `README.md:26`. Other "choose"/"chosen" in comments that mean this act become pick/picked; "choice" for a setting (`ColorChoice`) stays. |
| Keeping pages or files for good for setlists | **pin** | keep … offline | `originals/drive/score-fs.ts` `keepOriginalsOffline` → `pinOriginals`; `offline/pages.ts` `keepSetlistPagesOffline` → `pinSetlistPages`; `page-cache/cache.ts` `pinOffline` → `pinPages`; `library/library.ts:339` private `keepOffline` → `pin`. `saveOffline` and `savePageOffline` (drawing and saving one page) stay. |
| What a gesture's trials give | **fit** | model | `face/_model.ts` → `face/_fit.ts`, `build` → `buildFit`, its header "A gesture's fit: …"; `STORAGE.md:305`. "Model" then means only MediaPipe's model (`_landmarker.ts`). |
| The sharp drawing over the frames while zoomed in | **close-up** | detail | `reader/_detail.ts` → `_close-up.ts`, class `Detail` → `CloseUp`, `reader.ts` field `detail` → `closeUp`, `FrameSlot.detail` → `closeUp` (`_slots.ts`, `_loupe.ts:157`, `_tools/_pen.ts:20`), CSS `.detail` → `.close-up`; `docs/reader-split-spec.md:45`. The face dialog's Details disclosure and the storage estimate's `details` are other things and stay. |
| Files coming into the library | **incoming** | misc | `originals/misc-files.ts` → `incoming-files.ts`; the comments naming it (`inbox-fs.ts:2`, `trash-fs.ts:3`) |
| An excerpt with a name, kept on the score | **named excerpt** | name, names, excerpt (when it means this) | `scores/excerpts.ts:191` `removeName` → `deleteNamedExcerpt`, line 196 "a score's names"; `dialogs/excerpts.ts` → `dialogs/named-excerpts.ts` with `ExcerptHost` → `NamedExcerptHost`, `addExcerpt`, `renameExcerpt`, `changeExcerptCuts`, `changeExcerpt`, `deleteExcerpt` → `addNamedExcerpt`, `renameNamedExcerpt`, `changeNamedExcerptCuts`, `changeNamedExcerpt`, `deleteNamedExcerpt`; `reader/_title-menu.ts:284` `deleteNamed` → a local name without "named" alone (`askToDeleteNamedExcerpt`) |
| Destroying a symbol or a group | **delete** | remove | `markings/symbol-library.ts:84` `removeGroup` → `deleteGroup`, line 118 `removeSymbol` → `deleteSymbol`; the editor's local `deleteGroup` (`_symbol-library-editor.ts:96`) → `askToDeleteGroup` |
| Destroying a gesture | **Delete** | Remove | `face/dialog.ts:117` and 157: the button and the confirmation ("Delete “…”?", "Its trials are deleted with it.", button "Delete") |
| The tool the stack has on top | **active** | on top, in use | `ARCHITECTURE.md` ("The toolbar lights the tool on top", "only the tool in use shows it", "the active tool's chrome") |
| A folder, as Volti holds one | **folder** | dir, directory | `originals/drive/_byte-cache.ts:28` `dir` → `folder`; `handles/_roots.ts:19` `dir` → `folder`; `inbox-fs.ts:11` `dir()` → `folder()`; `library-files.ts:271`; `trash-fs.ts` `_removedDir` → `_removedFolder`. The browser's `getDirectory` and `FileSystemDirectoryHandle` stay. |
| A small picture of a frame or page | **thumbnail** | thumb, thumbs | `dialogs/thumb-strip.ts` → `thumbnail-strip.ts`, `ThumbStrip` → `ThumbnailStrip`; `reader/_cuts/_thumbs.ts` → `_thumbnails.ts`; `thumbCanvas` → `thumbnailCanvas`; every `thumb` variable; CSS `.thumbs` → `.thumbnails`, `.thumb-frame` → `.thumbnail-frame`, `.thumb` → `.thumbnail`, `.thumb-space` → `.thumbnail-space`, in `base.css`, `dialogs.css`, `library.css`, `reader.css`, `ui.css` |
| Keeping anything on the tablet | **save** | persist, write (except `writeFile`) | `page-cache/_disk.ts:60` `persist` → `saveIndex`; `reader/_saver.ts` header "Saving the reader's changes…" |
| A blank canvas of a size | **blankCanvas** | sheet | `originals/read/_image.ts:91` |
| How a thing is now | **status** | state | `originals/types.ts` `FolderState` → `FolderStatus`, `folderState` → `folderStatus` everywhere; `face/button-state.ts` → `button-status.ts`, `FaceButtonState` → `FaceButtonStatus`, `buttonState` → `buttonStatus` |

## The Words table and the rules in `ARCHITECTURE.md`

Rows added: **close-up**, **thumbnail**, **pin** (pages setlists play, kept saved for good),
**status** and **state** (the rule above), **Paint** (a fill or a stroke), and a line under
**frame** saying a camera frame (`FaceFrame`) is another thing and is always qualified. Rows
changed: **screen** gains "the reader's element for it is `screenEl`", **slot** names
`reader/_slots.ts`. The rules under the table gain the dialect line, the delete/remove rule and the
tool-naming rule. Every sentence of `ARCHITECTURE.md`, `STORAGE.md`, `README.md`, `TODO.md`,
`TODO.manual.md` and `docs/*.md` uses the winning spellings.
