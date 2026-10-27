# The originals module: plan

How to get `src/originals/` from where it is now to the end state in
`original-module-refactor.md`. Fourteen steps, one commit each. After every step the app builds,
the tests pass and the app behaves as before. Step 12 is the exception: it makes the one change
the end state allows, how ids are kept.

## Feasibility

I checked the end state against the code at `d91f3d2` (`npm test`: 188 passing, `tsc` clean,
`dist/sw.js` with no pdf.js in it).

- **The import order holds.** Each new file's value imports go only to files above it:

  | File | Imports values from |
  | --- | --- |
  | `path-utils` | nothing |
  | `filesystem-utils` | `path-utils` (`isOriginalName`) |
  | `types` | nothing (type only: `PageCache` from `original`) |
  | `internal-types` | nothing (types only) |
  | `pdf-source` | `storage`, `path-utils` (`titleOf`), `types` (`PasswordNotGiven`) |
  | `image-source` | `pdf-source` (`encode`, `A4_W`; see decision 1) |
  | `original` | `pdf-source`, `image-source` |
  | `device-score-fs` | `storage`, `filesystem-utils`, `types` (`NoAccess`) |
  | `internal-score-fs` | `storage`, `filesystem-utils` |
  | `inbox-fs` | `storage` |
  | `trash-fs` | `storage`, `filesystem-utils` (`writeFile`) |
  | `library-files` | `storage`, `path-utils`, `filesystem-utils`, `original`, `device-score-fs`, `internal-score-fs`, `trash-fs` |
  | `misc-files` | `path-utils`, `filesystem-utils`, `original`, `device-score-fs`, `internal-score-fs`, `trash-fs`, `library-files` |

  This also removes today's only import cycle, `folder.ts` ↔ `library-root.ts`.
- **`openPdf` can return a `PageSource`.** `pdf-source` can't import `PageCache`, because it sits
  below it in `original.ts`. Its only caller inside `pdf-source` is `pagesDrawn`, which needs just
  `pages`, `aspect`, `draw(n, DRAWN_W)` and `destroy`. `cache.render(n, W, H, 1)` draws at
  `round(W × 1) = W`, which matches `draw(n, W)`. There is one small difference: drawing through
  a `PageCache` with `when = 'now'` bumped the global "drawing for the screen" counter, which made
  background drawing wait while a PDF that can't be decrypted was turned into pictures. Without
  it, background drawing doesn't wait. Nothing user-visible depends on that.
- **Tests can import the content files.** A test importing pdf.js, `../storage` and
  `contents.ts` together loads and passes under vitest (probed, then removed). `storage/kv.ts`
  opens IndexedDB only when it is first used, so `pdf-source.test.ts` and the internal-record
  test can import their modules.
- **The service worker stays free of pdf.js.** `inbox-fs.ts` imports only `storage/`, and
  `sideEffects` lets the bundler drop the rest of the index. Every step checks this (below).
- **The index exports cover every caller.** Every name another directory imports today is in
  the end state's list. The two differences are `appRootBytes` → `internalBytes` (one caller,
  `library/storage.ts`) and the new `RenderedPdf`, which nothing needs yet. `PageCache` must stay
  a value export, because `reader/open-scores.ts` calls `PageCache.opening`.
- **Every symbol has a home.** See the table under *Where everything goes*.

### Decisions the end state leaves open (my recommendation first)

1. **`encode` and `A4_W` are used by both content files** (`pagesDrawn` and `imagePdf`).
   `image-source` may import them from `pdf-source`, which is above it, so I recommend that. They
   are how Volti makes a PDF page, so they fit there. The alternative is to copy the five-line
   `encode` into both files.
2. **What "`readImage` decodes the image once" means.** A `PageCache.destroy()` closes its
   source's bitmap. Export calls `pages()` and then `pdf()` on the same `Original`, and nothing
   stops a second `pages()`. A bitmap decoded at `read()` and shared would therefore break, and it
   would also hold memory for originals read only to export. I recommend that `readImage` keeps
   the `File`, each `pages()` decodes once (upright, as `openImage` does today), and `pdf()`
   decodes its own copy only when exporting. That is today's behaviour.
3. **Moving to the new id stores without hashing everything again.** Today's `hashes` key holds
   `folder/…` and `app/…` entries. Without a migration, the first listing after the update would
   read every file whole again: the whole linked folder, or the whole library on a tablet that
   can't link one, which keeps everything in OPFS. I recommend a one-time upgrade (step 12):
   - It runs while `internal-ids` is missing. Whether the key exists is the only safe signal,
     because after the upgrade a real folder can be called `app` or `folder`.
   - It writes `internal-ids` first, from the `app/` entries whose size and modified time still
     match the file in OPFS.
   - It then rewrites `hashes` with only the `folder/` entries, prefix stripped.
   - A crash between those two writes costs one full re-hash of the linked folder. It loses no
     data.
4. **What `library-files.ts` asks of the two id stores** (open in the end state). I propose one
   interface:

   ```ts
   interface Ids {
     known(path: string, file: File): string | undefined;
     id(path: string, file: File): Promise<string>;
     remember(path: string, file: File, id: string): Promise<void>;
     moved(from: string, to: string, file: File, id: string): Promise<void>;
     forget(path: string): Promise<void>;
     /** After a full listing: keep what was seen, drop the rest. */
     save(): Promise<void>;
   }
   ```

   - **Device:** `known` checks size and modified time, `forget` does nothing (as today), and
     `save` keeps only the paths seen.
   - **Internal:** `known` ignores the file, and `remember`, `moved` and `forget` write at once.
5. **Order checks.** I recommend adding `src/originals/order.test.ts`, which fails on an import
   that goes down the list, so the order stays true. The regex from `layers.test.ts` works for
   this, since `import type` lines are easy to skip. It is optional.

## Where everything goes

| Now | Goes to |
| --- | --- |
| `names.ts` (all), `arrivals.ts` (all), `by-folder.ts` (all), `byTitle` from `originals.ts` | `path-utils.ts` |
| `walk`, `MAX_DEPTH`, `writeFile` (`folder.ts`); `hashBytes`, `hashFile`, `hex` (`hashes.ts`) | `filesystem-utils.ts` |
| `SourceFile`, `Original` (`original.ts`); `AskPassword`, `PasswordNotGiven`, `LossyReason`, `OriginalPdf` → `RenderedPdf` (`contents.ts`); `FolderState`, `NoAccess` (`library-root.ts`); `PagePictures` (`pages.ts`); `Removed` (`removed.ts`) | `types.ts` |
| `Readable` (`original.ts`); `PageSource` (`pages.ts`); `Content` (new) | `internal-types.ts` |
| `pdf.ts` (all); `isPdf`, `holds`, `PDF_ENDS`, `namesEncrypt`, `isEncryptedPdf` (`file-kind.ts`); `savedPassword`, `Passwords`, `pdfOf`, `pagesDrawn`, `DRAWN_W`, `A4_W`, `encode` (`contents.ts`); `encrypted` (`original.ts`); `readPdf` (new) | `pdf-source.ts` |
| `image.ts` (all); `isJpeg`, `isPng`, `jpegOrientation` (`file-kind.ts`); `imagePdf`, `drawUpright` (`contents.ts`); `readImage` (new) | `image-source.ts` |
| `PageCache`, `When` and the drawing queue (`pages.ts`); `readAs` → `readOriginal`, `BaseOriginal`/`PdfOriginal`/`ImageOriginal` → `FileOriginal` | `original.ts` |
| `dir`, `linked`, `canLinkFolder`, `folderState`, `linkFolder`, `unlockFolder`, `needAccess`, `unlinkFolder`, `ListingEntry`, `rememberedListing`, `saveListing`, `relist` (`library-root.ts`); Exports (`folder.ts`); the device half of `Hasher`/`rememberHash` (`hashes.ts`) | `device-score-fs.ts` |
| `opfsRoot`, `appFiles` → `internalFiles`, `removeAppFile` → `removeInternalFile`, `appRootBytes` → `internalBytes` (`folder.ts`); the internal id record (new) | `internal-score-fs.ts` |
| `inbox.ts` | `inbox-fs.ts` |
| `removed.ts` | `trash-fs.ts` |
| `root`, `fileAt`, `placeOf`, `makeFolder`, `folderFiles`, `RootFile` → `LibraryFile`, `made`, `sourceFileOf` (`library-root.ts`); `libraryFiles`, `knownTitles`, `Progress` (`originals.ts`). `whereIs` is removed (step 12). | `library-files.ts` |
| `adding.ts`: `HeldFile` → `MemoryFile`, `heldFile`, `readIncoming`, `leftInApp`, `removedSource` | `misc-files.ts` |

| Test now | Goes to |
| --- | --- |
| `names.test.ts`, `arrivals.test.ts`, `by-folder.test.ts` | `path-utils.test.ts` |
| `hashes.test.ts` | `filesystem-utils.test.ts` |
| `pdf.test.ts`, and the `isPdf`/`holds`/`isEncryptedPdf` parts of `file-kind.test.ts` | `pdf-source.test.ts` |
| the `jpegOrientation`/`isJpeg`/`isPng` parts of `file-kind.test.ts` | `image-source.test.ts` |
| new: what the internal record keeps and drops at a listing | `internal-score-fs.test.ts` |

## Every step

Before each commit, run these checks:

```sh
npm test && npm run build
grep -c GlobalWorkerOptions dist/sw.js   # must print 0
```

Also confirm that nothing outside `src/originals/` changed, except where the step says so. Use
`git mv` where a file is mostly renamed, so its history follows it. Each new file starts with a
comment saying what belongs in it; `layers.test.ts` checks this. When a step empties an old file,
it deletes it.

### 1. `path-utils.ts`

- `git mv names.ts path-utils.ts`.
- Move in `arrivals.ts`, `by-folder.ts` and `byTitle` (from `originals.ts`).
- Mark the file **Pure** in its header.
- `byFolder`, `subfolders` and `byTitle` keep `import type { SourceFile }`.
- Merge the three tests into `path-utils.test.ts`.
- Point every import in the directory and `index.ts` at the new file. Callers outside go through
  the index and don't change.

### 2. `filesystem-utils.ts`

- Move `walk` and `writeFile` from `folder.ts`, and `hashBytes`, `hashFile` and `hex` from
  `hashes.ts`.
- `hashes.ts` keeps `Hasher` and `rememberHash` for now, importing `hashFile`.
- `git mv hashes.test.ts filesystem-utils.test.ts`.

### 3. `types.ts` and `internal-types.ts`

- Move the public types and both errors into `types.ts`, renaming `OriginalPdf` to `RenderedPdf`
  as they move.
- Move `Readable` and `PageSource` into `internal-types.ts`, and add `Content`
  (`pages(): Promise<PageSource>`, `pdf(): Promise<RenderedPdf>`).
- Re-point the imports. The index re-exports the types from `types.ts` and adds `RenderedPdf`.
- There are no changes to how anything runs.

### 4. `pdf-source.ts`

- `git mv pdf.ts pdf-source.ts`.
- Move in the PDF parts of `file-kind.ts` and `contents.ts`, and `encrypted` from `original.ts`.
- `openPdf` returns the `PdfSource`, not a `PageCache`. `pagesDrawn` uses it directly (see
  *Feasibility*).
- Add `readPdf(file: Readable, ask?): Promise<Content>`, built from today's
  `PdfOriginal`/`readAs` logic:
  - `pdf()` hands over the music held from `read()` once (pdf.js takes the bytes it is given),
    then works it out again each time.
  - `pages()` is `openPdf((await this.pdf()).bytes)`.
- `original.ts` uses `readPdf` for now, and wraps each content's source in
  `new PageCache(Promise.resolve(source))`.
- Tests: `pdf.test.ts` → `pdf-source.test.ts`, with the PDF cases from `file-kind.test.ts`.

### 5. `image-source.ts`

- `git mv image.ts image-source.ts`.
- Move in `imagePdf`, `drawUpright`, and `isJpeg`/`isPng`/`jpegOrientation`.
- `openImage` returns the `ImageSource`.
- Add `readImage(file: Readable): Content` (decision 2). Its `pdf()` calls `imagePdf`.
- `encode` and `A4_W` are imported from `pdf-source` (decision 1).
- Move the image tests to `image-source.test.ts`. `file-kind.ts`, `file-kind.test.ts` and
  `contents.ts` are now empty, so delete them.

### 6. `original.ts`

- Move `PageCache`, `When` and the drawing queue in from `pages.ts`, and delete `pages.ts`.
- Replace `readAs` and the three classes with:
  - `readOriginal(f, ask)`: sniffs the first 2048 bytes with `isPdf`, then calls `readPdf` or
    `readImage`.
  - `FileOriginal(f, content)`:
    - `id`, `path`, `move` and `remove` go to the file. `read()` returns itself.
    - `pdf()` goes to the content.
    - `pages()` is `new PageCache(Promise.resolve(await content.pages()))`. It is awaited first,
      so a `NoAccess` or `PasswordNotGiven` still rejects `pages()` as it does today. Leave
      `PageCache.opening` alone; the end state leaves it open.
- `RootFile.read` and `HeldFile.read` call `readOriginal`.
- The index exports `PageCache` from `original.ts`.

### 7. `device-score-fs.ts`

- Move the linked folder's code out of `library-root.ts`: its handle, linking, access, and the
  remembered listing.
- Move Exports in from `folder.ts`.
- `whereIs`, which needs `linked`, stays in `library-root.ts` for now and imports it.
- Hashing doesn't change in this step.

### 8. `internal-score-fs.ts`

- Move in what is left of `folder.ts`, renaming as listed above, and delete `folder.ts`.
- Outside the directory: `library/storage.ts` imports `internalBytes`, and the index exports it
  instead of `appRootBytes`.

### 9. `inbox-fs.ts` and `trash-fs.ts`

- `git mv inbox.ts inbox-fs.ts` and `git mv removed.ts trash-fs.ts`, then re-point the imports.
- After the build, check `dist/sw.js` especially closely.

### 10. `library-files.ts`

- `git mv library-root.ts library-files.ts` (what is left of it is the root and its files), and
  rename `RootFile` to `LibraryFile`.
- Move in `libraryFiles` and `knownTitles` from `originals.ts`, then delete `originals.ts`.

### 11. `misc-files.ts`

- `git mv adding.ts misc-files.ts`, and rename `HeldFile` to `MemoryFile`.
- Its `move` now uses a `rememberId(path, file, id)` from `library-files.ts` instead of calling
  `rememberHash`/`whereIs` itself. For now, `rememberId` wraps them.

### 12. The id stores (the one change in behaviour)

- **`storage/keys.ts`:** add `internalIds: 'internal-ids'` (the internal record, path → id).
  Reword `hashes`: by path, with no prefix, linked folder only.
- **`device-score-fs.ts`:** the device cache, as `Ids` (decision 4), over `hashes`.
- **`internal-score-fs.ts`:** the internal record, as `Ids`, over `internal-ids`.
  - Its pure part decides what to keep and drop at a listing: given the record and the paths
    found, it returns the record kept and the paths to hash. Export it and test it in
    `internal-score-fs.test.ts`.
  - `removeInternalFile` also forgets the path.
- **`library-files.ts`:**
  - `idsOfRoot()` picks the device cache when a folder is linked, else the internal record.
  - `libraryFiles` uses it. While the folder is locked, it saves neither store, as today's
    `keep: ['folder/', 'app/']` does.
  - `LibraryFile.move` calls `moved`. `LibraryFile.remove` calls `forget`, which does nothing
    for the device.
  - `rememberId` goes to the root's store.
  - The one-time upgrade (decision 3) runs before the first listing in `libraryFiles` and
    `leftInApp`, as a memoized promise.
- **`misc-files.ts`:** `leftInApp` lists Volti's own folder through the internal record. It
  hashes and records files with no record, and drops records for paths that are gone. This also
  stops it hashing the same files on every call; today it never saves.
- **Delete:** `hashes.ts` and `whereIs`.
- **Add to `TODO.md` → Manual check:**
  - After updating, opening the library doesn't read every score again ("Reading new scores"
    doesn't appear), both with a folder linked and without one.
  - Then: add, rename, move, remove, put back, link, and unlink. Each keeps scores, markings and
    setlists.

### 13. `index.ts`

Rewrite `index.ts` to export exactly the list in the end state, grouped as it groups them, with
each name from its new file. Add `order.test.ts` (decision 5).

### 14. Docs

- **`ARCHITECTURE.md`:** in the Words table, point *source file* and *original* at `types.ts`
  and use the end state's definitions. In the Layers table, list the thirteen files in the
  `originals/` row.
- **`storage/keys.ts`:** the comments name the new modules (`device-score-fs.ts`,
  `internal-score-fs.ts`, `library-files.ts`, `trash-fs.ts`, `inbox-fs.ts`, `pdf-source.ts`).
- **`original-module-refactor.md`:** remove it, or mark it done.

## Risks

- **Step 12** is the only one that touches stored data. Test it in the app before pushing:
  - Before updating, link a folder and list it once, then update. The library opens with no
    re-hashing.
  - On a profile with no folder linked, the same.
  - Unlink and link again.
  - Move a score left in Volti's own folder into the linked folder.
- **Steps 4–6** change who builds the `PageCache`. Check in the app:
  - opening a PDF, a password-protected PDF, and a phone photo
  - exporting a PDF whose encryption pdf-decrypt doesn't know (pages drawn)
  - exporting a turned JPEG
- **Everything else** only moves code. `tsc`, the layers test and the new order test catch a
  move that goes wrong.
