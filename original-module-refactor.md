# The originals module: end state

This describes how `src/originals/` should look when the refactor is done. It says nothing about how
to get there. Names of files and internal types are easy to change later; the split of
responsibilities is what matters.

Behaviour stays the same, with one exception: the internal score filesystem keeps its own exact
record of each file's id (see *Ids and the hash cache*).

## Words

- **source file** (`SourceFile`): bytes Volti can read as music, known by the SHA-256 of its
  contents (its id), at a path. A file in the library, or one Volti holds outside it.
- **original** (`Original`, which extends `SourceFile`): a source file Volti has read. It has its
  pages to draw and its music as a PDF for export.
- **score filesystem**: where the library's files live. Today there are two, and only one is the
  library at a time: the **device** one (the linked scores folder, File System Access) and the
  **internal** one (Volti's own `library` folder in OPFS, used while no folder is linked). A Google
  Drive one would be a third. **The library's root** is the one in use.
- **inbox** (files shared to Volti, waiting to be added) and **trash** (Recently removed) are two
  more filesystems, not score filesystems.

## Files

Thirteen files, plus `index.ts`. Each is listed with what it holds. A file imports only from files
above it in this list (type-only imports, which are erased, don't count).

| File | Holds |
| --- | --- |
| `path-utils.ts` | Pure, no DOM, no storage. Titles and folders from paths (`titleOf`, `folderOf`, `nameOf`), the paths a rename or move gives (`pathWithTitle`, `pathInFolder`, `tidyPath`, `tidyFolder`), what a name can't be (`fileNameProblem`, `unfoundName`, `isOriginalName`, `endingOf`), the name a file coming in is kept under (`importName`), a folder as the user reads it (`shownFolder`), the library grouped by folder (`byFolder`, `subfolders`), sorting by title (`byTitle`), and what happens to a file arriving at a path (`arrivals`, `Arrival`). |
| `filesystem-utils.ts` | General helpers with no knowledge of any one filesystem (it uses the names in `path-utils.ts` to tell which files are scores): `walk` (the PDFs and images in a folder, a few levels deep), `writeFile` (a file that fails part way is deleted), `hashBytes` and `hashFile`. |
| `types.ts` | The public types. `SourceFile`, `Original`, `OriginalPdf` and `LossyReason`, `FolderState`, `AskPassword`, `PagePictures`, `Removed`, and the errors `NoAccess` and `PasswordNotGiven`. |
| `internal-types.ts` | Types used by several files in the directory but not outside it. `Readable` (a `SourceFile` that can give its bytes: `file(): Promise<File>`), `PageSource`, and `Content`. |
| `pdf-source.ts` | Everything that is only about PDFs. `PdfSource`, `openPdf` (pdf.js), `readPdf`, the password flow, decryption (pdf-decrypt), the check for an encrypted PDF, drawing the pages of a PDF that can't be had as it is, `isPdf`, `isEncryptedPdf`, `supersample`. |
| `image-source.ts` | Everything that is only about images. `ImageSource`, `openImage` (decoded upright), `readImage`, `imagePdf` (an image as a one-page PDF, for export), `isJpeg`, `isPng`, `jpegOrientation`. |
| `original.ts` | The generic `Original` (a class, `FileOriginal`, not exported), the dispatcher `readOriginal(file, ask)` (a PDF by its first bytes, else an image), and `PageCache` with `When`. |
| `device-score-fs.ts` | The linked folder: its handle (`linked()`), `canLinkFolder`, `folderState`, `linkFolder`, `unlockFolder`, `unlinkFolder`, `needAccess`; the listing remembered while access is locked (`rememberedListing`, `saveListing`, `relist`); the hash cache (below); and Exports (`EXPORTS`, `exportExists`, `saveExport`). |
| `internal-score-fs.ts` | Volti's own `library` folder in OPFS (`opfsRoot`, which is that folder, not OPFS's root); its record of ids (below); the files left in it when a folder is linked (`internalFiles`, `removeInternalFile`); its size (`internalBytes`). |
| `inbox-fs.ts` | `putInbox`, `peekInbox`, `dropInbox`, over the kv store. It imports only `storage/`, so the service worker (`sw.ts`) can import `putInbox` without pdf.js. |
| `trash-fs.ts` | Recently removed: the `removed` folder in OPFS and the `removed` records. `keepRemoved(id, path, file)`, `forgetRemoved`, `recentlyRemoved`, `removedFile`, `purgeRemoved`, `removedBytes`. |
| `library-files.ts` | `SourceFile` implementations over the library's root. `LibraryFile` (was `RootFile`), `root()` (the linked folder, else Volti's own), paths in the root (`fileAt`, `placeOf`, `makeFolder`, `folderFiles`), `sourceFileOf(id, path)`, `libraryFiles(state, progress)` (the listing), `knownTitles`. |
| `misc-files.ts` | `SourceFile` implementations for files Volti holds outside the library. `MemoryFile` (was `HeldFile`) with `readIncoming`, `leftInApp`, `removedSource`. A grab bag, small enough not to matter. |

`index.ts` re-exports what other directories use (below).

## Reading a file

`SourceFile.read(ask?)` is the one place a password is asked for.

```ts
interface SourceFile {
  readonly id: string;     // the SHA-256 of its contents
  readonly path: string;   // in the library's root, or where it would go
  move(path: string): Promise<string | null>;   // says why when it can't
  remove(): Promise<void>;
  read(ask?: AskPassword): Promise<Original>;   // throws PasswordNotGiven, NoAccess
}
interface Original extends SourceFile {
  pages(): Promise<PageCache>;
  pdf(): Promise<OriginalPdf>;   // its music as a PDF, for export
}
```

The content-specific parts know nothing of where a file lives. Each takes a `Readable` and gives a
`Content`:

```ts
interface Content {
  pages(): Promise<PageSource>;
  pdf(): Promise<OriginalPdf>;
}
```

- `readPdf(file, ask)`: an unencrypted PDF, or an encrypted one whose password is remembered, is
  not read until its pages or its PDF are wanted. An encrypted PDF whose password is not known asks
  now, and keeps the music it worked out for its pages. Passwords are remembered by the file's id
  and never forgotten.
- `readImage(file)`: decodes the image once, upright. `pdf()` makes the one-page PDF only when
  exporting.
- `openPdf` and `openImage` give `PageSource`s, not `PageCache`s. A `PageSource` (`pages`,
  `aspect`, `draw`, `region`, `destroy`) draws; `PageCache` is the higher level that keeps drawn
  pages, draws a couple at a time with the screen first, and uses saved pictures.
- `readOriginal(file, ask)` in `original.ts` picks the `Content` and wraps it with the file in a
  `FileOriginal`, which passes `id`, `path`, `move` and `remove` to the file, `pdf()` to the
  content, and wraps the content's source in a `PageCache` for `pages()`.

Neither content file imports anything that knows about files in the library, so nothing in the
chain imports back.

## Source files

- **`LibraryFile`** is a file at a path in the library's root. `move` renames or moves it, making
  folders, copying then deleting where the folder can't move a file. `remove` hands its bytes to
  the trash (`keepRemoved`), deletes it, and forgets it again if deleting fails. Both ask for the
  access they need (`needAccess`) and throw `NoAccess` when they can't get it. There is one
  `LibraryFile` for each id, so a move shows wherever it is held (`sourceFileOf`).
- **`MemoryFile`** is a file Volti holds outside the library, as a `File` value: one coming in
  (picked, or shared through the inbox), one left in Volti's own folder while a folder is linked,
  or one in the trash. Its `move(path)` puts it into the library: it writes the bytes at the path
  in the root, makes the folders, says why when a file is there already, remembers its id, then
  drops it from where it was held. After that it is the library's file at that path and passes
  everything on to it. `remove()` drops it from where it was held.
- `libraryFiles(state, progress)` lists the root: new or changed files are hashed one at a time,
  two of the same file show the first, titles are recorded for scores whose files are missing, and
  while the linked folder is locked its listing is the remembered one.

## Ids and the hash cache

A file's id is the hash of its contents. How sure Volti can be of the id for a path depends on who
can change files there.

- **Device** (`device-score-fs.ts`): other apps can change the folder at any time. The cache keeps
  each file's id with the size and modified time it was worked out for, by path, and a file is read
  whole again only when either changes. Keys are paths, with no prefix. Unlinking clears the
  remembered listing but not the cache.
- **Internal** (`internal-score-fs.ts`): only Volti changes it. It keeps an exact record of path to
  id, with no size or time. Whoever writes, moves or removes a file there updates it. At each listing,
  a file with no record is hashed and recorded, and records for paths no longer there are dropped.
- `library-files.ts` uses whichever belongs to the root in use. The `folder/` and `app/` prefixes,
  and `whereIs`, go.
- The raw hashing (`hashBytes`, `hashFile`) is in `filesystem-utils.ts`; both use it.

## What other directories import

Through `index.ts` only. Everything else is private to the directory.

- **Types and errors:** `SourceFile`, `Original`, `OriginalPdf`, `FolderState`, `AskPassword`,
  `PagePictures`, `Removed`, `NoAccess`, `PasswordNotGiven`, `PageCache`.
- **The device folder:** `canLinkFolder`, `folderState`, `linkFolder`, `unlockFolder`,
  `unlinkFolder`, `EXPORTS`, `exportExists`, `saveExport`.
- **The library:** `libraryFiles`, `knownTitles`, `internalBytes` (was `appRootBytes`).
- **Files coming in:** `readIncoming`, `leftInApp`, `removedSource`, `peekInbox`, `dropInbox`,
  `putInbox`.
- **Trash:** `recentlyRemoved`, `purgeRemoved`, `removedBytes`.
- **Paths:** the pure functions in `path-utils.ts` that screens use: `titleOf`, `folderOf`,
  `pathWithTitle`, `pathInFolder`, `fileNameProblem`, `byFolder`, `subfolders`, `byTitle`,
  `arrivals`, `Arrival`.

## Storage

Keys, as `storage/keys.ts` names them, and the module that reads and writes each:

| Key | Holds | Module |
| --- | --- | --- |
| `folder` | the linked folder's handle | `device-score-fs.ts` |
| `folder-files` | the linked folder's listing as last read | `device-score-fs.ts` |
| `hashes` | the device hash cache, by path | `device-score-fs.ts` |
| `internal-ids` (new) | the internal folder's exact path to id record | `internal-score-fs.ts` |
| `titles` | each file's title as last seen, by id | `library-files.ts` |
| `removed` | the trash's records | `trash-fs.ts` |
| `inbox` | files shared in, waiting | `inbox-fs.ts` |
| `password:<id>` | the password that opened an encrypted PDF | `pdf-source.ts` |

## Tests

Pure and unit-tested, next to their files: `path-utils.test.ts` (names, folders, arrivals),
`pdf-source.test.ts` (`supersample`, `isPdf`, `isEncryptedPdf`), `image-source.test.ts` (`isJpeg`,
`isPng`, `jpegOrientation`), `filesystem-utils.test.ts` (`hashFile`), and the parts of the internal
id record that are pure (what to keep and drop at a listing).

## Docs

`ARCHITECTURE.md` gets the words *source file* and *original* as above, and the `originals/` row
of the layer table lists these files. The comments in `storage/keys.ts` name the new modules.

## Left open

- Whether `Original.pages()` can return a `PageCache` straight away, one that waits on its source
  when first asked. `PageCache.opening` (for the reader's saved-pictures-first case) would then not
  be needed.
- The exact shape of what `library-files.ts` asks of the two id stores (known, remember, forget,
  moved).
- Internal names (`Content`, `FileOriginal`, `internalFiles`) are placeholders.
- Exports belongs to the device filesystem. A Google Drive library would have its own, so it may
  later become something each score filesystem has or doesn't.
- How big `pdf-source.ts` turns out to be; judge when it is written.
