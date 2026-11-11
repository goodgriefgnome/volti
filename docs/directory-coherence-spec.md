# Directory coherence: spec

What the tree must look like once each directory holds one idea and its modules are named for it.
Nothing the app does changes: every move here is a file moved or renamed and its importers
followed. `docs/directory-coherence-plan.md` says how to get here in stages; where the two
disagree, this spec wins. `ARCHITECTURE.md` is the lasting description of the tree, so each
change here is also made there.

## Rules that hold throughout

- `src/layers.test.ts` keeps passing, with one row added: `offline: 5`. A subdirectory counts as
  part of its directory (the test keys on the first path segment), so subdirectories of
  `originals/` and `reader/` need no row.
- Every module still starts with a comment saying what belongs in it, and a comment that names a
  file that moved names its new place.
- Prose that names a file that moved (`ARCHITECTURE.md`, `STORAGE.md`, `README.md`, `TODO.md`,
  `TODO.manual.md`, `docs/*-spec.md`, comments in `src/`) names its new place.
- No behaviour changes: `npm test` and `npm run build` pass after every commit, and the manual
  checks at the end of the plan show the app working as before.

## `src/originals/`

Three subdirectories hold the clusters its imports already form; the glue stays at the top.

| Subdirectory | Holds (old name → new path) |
| --- | --- |
| `originals/drive/` | `_drive-config.ts` → `drive/_config.ts`, `_drive-auth.ts` → `drive/_auth.ts`, `_drive-api.ts` → `drive/_api.ts`, `_byte-cache.ts` → `drive/_byte-cache.ts`, `_fake-drive.ts` → `drive/_fake.ts`, `_drive-root.ts` → `drive/_root.ts`, `drive-score-fs.ts` → `drive/score-fs.ts` |
| `originals/handles/` | `_fake-handles.ts` → `handles/_fake.ts`, `_directory-handle-roots.ts` → `handles/_roots.ts`, `device-score-fs.ts` → `handles/device-score-fs.ts`, `internal-score-fs.ts` → `handles/internal-score-fs.ts` |
| `originals/read/` | `_pdf-source.ts` → `read/_pdf.ts`, `_image-source.ts` → `read/_image.ts`, `_sources.ts` → `read/_sources.ts`, `original.ts` → `read/original.ts` |
| `originals/` (stays) | `types.ts`, `_types.ts`, `path-utils.ts`, `_filesystem-utils.ts`, `_record-model.ts`, `_record-store.ts`, `_folder-scan.ts` (both roots use it), `_folder-link.ts`, `trash-fs.ts`, `inbox-fs.ts`, `linked-folder.ts`, `library-files.ts`, `misc-files.ts` |

Each test file moves with its module and keeps its module's new name (`drive/_api.test.ts`).
Outside `originals/`, imports name the new path (`'../originals/drive/score-fs'`,
`'../originals/read/original'`). `originals/order.test.ts` still lists every file of the
directory, now by path relative to `originals/` (`'drive/_api'`), and still checks that each
imports values only from files above it in the list.

The `originals/` row of the layer table in `ARCHITECTURE.md` becomes one short paragraph for the
top level and one for each subdirectory, in the same import order it describes today.

## `src/reader/`

The root holds only what `reader.ts` joins: what is read, turning, input, the spread, the toolbar
and its menus, saving and history, the loupe and close-up, and the face-watch state. The tools'
own interface moves into `reader/tools/`:

| Old | New |
| --- | --- |
| `reader/_glyph-picker.ts` | `reader/tools/_glyph-picker.ts` |
| `reader/_library-editor.ts` | `reader/tools/_symbol-library-editor.ts` |
| `reader/_symbol-panel.ts` | `reader/tools/_symbol-panel.ts` |
| `reader/_symbol-picture.ts` | `reader/tools/_symbol-picture.ts` |
| `reader/_symbols.ts` | `reader/tools/_symbol-library.ts` |
| `reader/_swatches.ts` | `reader/tools/_swatches.ts` |
| `reader/_tool-panels.ts` | `reader/tools/_tool-panels.ts` |

Their tests move with them. `reader/cuts/` is unchanged.

## `src/markings/`

`markings/library.ts` becomes `markings/symbol-library.ts` (with its test), so that "library"
names only the Library screen and the library's files. Its contents and exports are unchanged.
`ARCHITECTURE.md` names the new file where it names the old.

## `src/offline/` (new, layer 5)

Keeping the pages setlists play offline is a job over the page cache, originals, setlists and the
screen geometry, not a part of the Library screen, so it is a directory of its own beside
`export/`:

| Old | New |
| --- | --- |
| `library/_offline-pages.ts` | `offline/pages.ts` |
| `library/_offline-status.ts` | `offline/status.ts` |
| `library/_offline-status.test.ts` | `offline/status.test.ts` |

`offline/pages.ts` exports what `library/library.ts` calls today (`keepSetlistPagesOffline`);
`offline/status.ts` exports `OfflineStatus`, `offlineText` and whatever `pages.ts` takes from it.
The layer table gets a row `5 | offline/` saying what it holds, and the `library/` row no longer
mentions offline pages.

## `src/face/`

The Face gestures dialog joins the directory, so `face/` is the whole feature: the model, its
storage, the camera, the button and the dialog that defines gestures.

| Old | New |
| --- | --- |
| `dialogs/face-gestures.ts` | `face/dialog.ts` |
| `dialogs/_face-recording.ts` | `face/_round.ts` |
| `dialogs/_face-details.ts` | `face/_details.ts` |

The dialog's only importers, `library/_folder-banner.ts` and `reader/reader.ts` (or wherever
`openFaceGestures` is called from), import `'../face/dialog'`. With the dialog inside, the modules
only it used from outside become internal, each with its test: `model.ts` → `_model.ts`,
`recording.ts` → `_recording.ts`, `settling.ts` → `_settling.ts`, `template.ts` → `_template.ts`,
`tones.ts` → `_tones.ts`. `gestures.ts`, `store.ts`, `watcher.ts`, `face-button.ts` and
`button-state.ts` stay public: the reader and the library use them.

`ARCHITECTURE.md`'s rule "a dialog both screens open goes in `dialogs/`" gains one sentence: a
feature directory that is below both screens may hold its own settings dialog (`face/dialog.ts`).
The `face/` and `dialogs/` rows of the layer table say so.

## `src/dialogs/`

No module moves except the face ones above. `open-score.ts`'s header says both screens use it
(the reader's title menu does, to choose an excerpt), and its import of `passwords` is
`'./passwords'`, not `'../dialogs/passwords'`.

## `src/styles/`

One CSS file per directory of `src/` whose modules make the elements it styles, imported by
`main.ts` in this order:

| File | Styles the elements made by |
| --- | --- |
| `base.css` | Tokens, resets, the document and anything two or more directories share |
| `ui.css` | `ui/` (menus and dialogs from `overlay.ts`, toasts, `ask-text`, the drag handle) |
| `library.css` | `library/` |
| `dialogs.css` | `dialogs/` (the add-scores picker, the excerpt picker and thumb strip, score-file and setlist dialogs, export) |
| `reader.css` | `reader/`, including `reader/cuts/` and `reader/tools/` |
| `face.css` | `face/` (the button and, after its move, the dialog) |

`cuts.css`, `overlay.css` and `setlists.css` are gone, their rules moved to the file above by the
directory of the module that makes the element (found by searching `src/` for the class name).
Every rule survives unchanged. Where one selector appears in two of the new files, the rule that
came later in the old import order still comes later in the new one; the plan says how to check.

## `public/`

The two prototype pages and their manifests move under `public/lab/`:
`lab/face-classifier.html`, `lab/face-classifier.webmanifest`, `lab/face-signals.html`,
`lab/face-signals.webmanifest`. Their manifests' icon paths become `../icons/icon-192.png`;
`start_url` and `scope` stay as they are, being relative to the manifest. `src/sw.ts`'s navigation
denylist names `/\/lab\//` in place of the two pages. The headers of `face/_model.ts` and
`face/_template.ts` cite `docs/face-classifier-spec.md` as what they must do and
`public/lab/face-classifier.html` as where they were ported from. `ARCHITECTURE.md` says, in one
line, that `public/lab/` holds prototype pages that are not the app.

## `docs/`

`docs/` holds specs that the code still answers to, and plans only for work not yet done. The
plans whose stages are all committed are gone: `face-gestures-plan.md`,
`face-gestures-levels-plan.md`, `face-gestures-defined-plan.md` and `reader-split-plan.md`, each
checked against the git log and the code first, and each skimmed for a decision its spec does not
record, which moves into the spec before the plan goes. A plan whose stages are not all done
stays, and the plan says which.

Once `ARCHITECTURE.md` says everything this spec says about the tree, this spec and its plan are
gone too, as finished plans are.
