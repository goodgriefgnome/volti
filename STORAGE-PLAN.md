# Plan: moving Volti's storage to the format in STORAGE.md

This is for whoever implements the new storage format. Read `STORAGE.md` first: it is the spec, and
where this plan and the spec disagree, the spec wins. Then read `ARCHITECTURE.md`, which has the
layer rules the tests enforce.

**No migration.** The data in the old keys is dropped, not converted. What users lose:

- passwords (asked again)
- page shapes (worked out again when a score is opened)
- the hash cache (the linked folder is hashed again once)
- the titles of scores whose file is missing (they show as "Missing score")
- Recently removed
- files shared but not yet added
- reading positions

Scores, ink and setlists are kept: their keys don't change.

## How to work

- Do the stages in order. Each stage is one commit, or a few, and **every commit must pass
  `npm test` and `npm run build`**. Where a stage can't be split without breaking the build, make
  it one commit.
- Commit messages say what changed, like the ones in `git log`.
- Every new module starts with a comment saying what belongs in it, like the existing ones. Pure
  modules say **Pure** and get a `*.test.ts` beside them.
- `src/originals/order.test.ts` lists the files of `originals/` in order. A file may import values
  only from files above it. Add new files to `ORDER` where this plan says.
- Only `originals/`, `storage/` and the `store.ts` files may use `kv` (`src/layers.test.ts`).
- After the last stage, try everything under **Manual checks** in the running app (`npm run dev`).
  On a tablet is best; Chrome on a desktop can do most of it.

## Stage 1: two new kv operations

File: `src/storage/kv.ts`.

Add:

```ts
/** Every key starting with `prefix`, with its value, in key order. */
entries: <T>(prefix: string) => Promise<[string, T][]>
/**
 * Read-modify-write several keys in one transaction. Each function is given the value now stored
 * (undefined if none) and returns the new one; returning undefined deletes the key.
 */
updateMany: (changes: [string, (old: unknown) => unknown][]) => Promise<void>
```

- `entries`: use `store.getAll(range)` and `store.getAllKeys(range)` with
  `IDBKeyRange.bound(prefix, prefix + '￿')`, in one `readonly` transaction, and zip the two
  arrays.
- `updateMany`: as `update` does now, but for each pair. `get`, then in its `onsuccess` either
  `put` or `delete`.
- Also make `update` delete the key when `fn` returns `undefined`. Nothing relies on the current
  behaviour of storing `undefined`.

IndexedDB isn't available in the unit tests, so these have no unit test. They are exercised by
the manual checks.

## Stage 2: the record model (pure)

New file `src/originals/_record-model.ts`, **Pure**. In `ORDER`, put it right after `'_types'`.
It may import from `path-utils`.

It holds the types and every rule about places. No storage, no DOM.

```ts
export interface OriginalRecord { path: string; where: Where; aspects?: number[]; password?: string }
export type Where = …            // exactly as STORAGE.md
export type Kind = Where['kind'];

/** How good a place is: higher wins. `folder` counts only while the folder is linked. */
export function _rank(where: Where, linked: boolean): number
//   folder: linked ? 4 : 0; internal: 3; inbox: 2; removed: 1; gone: 0

/** A file found in a listing. size and modified matter only for the linked folder. */
export interface _Found { path: string; id: string; size: number; modified: number }

export interface _Listing {
  /** The new record of each id whose record changes (whole records, to write). */
  changed: Map<string, OriginalRecord>;
  /** Bytes to delete: those of a place given up (the record before), or a found file that loses. */
  drop: { id: string; where: Where; path: string }[];
  /** Copies of an id at other paths than its canonical one: path → found file. */
  duplicates: Map<string, _Found>;
  /** Each id found, at its canonical path, to show in the library. */
  files: { id: string; path: string }[];
}

/**
 * What a listing of `kind`'s files means for the records: STORAGE.md, "One place per original",
 * "Duplicates", and the listing rows of "What happens".
 */
export function _resolveListing(kind: 'folder' | 'internal', records: ReadonlyMap<string, OriginalRecord>, found: readonly _Found[], linked: boolean): _Listing

/** The ids whose removed copy is due to be purged at `now`: removed 7 days ago or more. */
export function _toPurge(records: ReadonlyMap<string, OriginalRecord>, now: number): string[]

/** Where `id`'s bytes are kept in OPFS for a record in `inbox` or `removed`, e.g. "removed/1730000000000-ab12…". */
export function _bytesName(id: string, where: Where): string
```

How `_resolveListing` works, for each id among `found`:

1. **Choose the canonical path.** If the record is of this `kind` and its `path` is among the
   paths found for the id, keep it. Otherwise take the found path that sorts first (`a < b`). Every
   other found path for the id goes into `duplicates`.
2. **No record:** make one at the canonical path. For `folder`, give it the found size and
   modified time; for `internal`, just `{ kind: 'internal' }`.
3. **Record of the same kind:** update `path`, and for `folder` also `size` and `modified`. Put it
   in `changed` only if something actually differs.
4. **Record of another kind:** compare `_rank(new where)` with `_rank(record.where)`.
   - The new place ranks higher: the record moves there (keep `aspects` and `password`), and the
     old place goes into `drop`, with the record's old path. A `gone` or unlinked `folder` record
     has no bytes to drop, so leave those out of `drop`.
   - The new place ranks the same or lower: the found file loses, and all its copies go into
     `drop`. Only an `internal` listing can hit this, when the id is in the linked folder.
5. Ids that win go into `files` at their canonical path.

Then, for each record of this `kind` whose id wasn't found at all, `changed` gets it as
`{ kind: 'gone' }`, with path, aspects and password kept.

Tests (`_record-model.test.ts`), at least:

- a new file makes a record; a file whose record already says so changes nothing
- a renamed file (same id, new path, old path gone) moves the record's path
- two copies with no record: the path that sorts first is canonical, the other is in
  `duplicates`
- two copies where the record's path is the later one: the record's path stays canonical (sticky)
- the canonical copy gone and a duplicate left: the duplicate becomes canonical
- `folder` listing, id recorded `internal`: the record becomes `folder`, and `drop` has the
  internal path
- `folder` listing, id recorded `removed` or `inbox`: moves, with a drop
- `internal` listing while linked, id recorded `folder`: nothing changes, and the internal file is
  in `drop`
- `internal` listing while not linked, id recorded `folder`: the record becomes `internal`, with no
  drop
- a record of this kind not found becomes `gone`; one of another kind isn't touched
- `_toPurge` at exactly 7 days, just under, and only for `removed`

## Stage 3: the record store

New file `src/originals/_record-store.ts`. In `ORDER`, put it right after `'_record-model'`.
It imports `kv` and `keys`.

It is the only code that reads or writes `original:` keys. It keeps a copy of every record in
memory, so the rest of `originals/` can look one up without waiting.

```ts
/** Read every record afresh from IndexedDB into memory. Call before each listing, and when the app opens with ?shared. */
export async function _loadRecords(): Promise<ReadonlyMap<string, OriginalRecord>>
/** A record as last loaded or written by this page. */
export function _record(id: string): OriginalRecord | undefined
export function _records(): ReadonlyMap<string, OriginalRecord>
/**
 * Change one record in a single transaction: `fn` is given the stored record (not the copy in
 * memory) and returns the new one, or undefined to delete it. The copy in memory is updated to
 * what was written.
 */
export async function _updateRecord(id: string, fn: (old: OriginalRecord | undefined) => OriginalRecord | undefined): Promise<void>
/** As _updateRecord, for several ids in one transaction. */
export async function _updateRecords(changes: [string, (old: OriginalRecord | undefined) => OriginalRecord | undefined][]): Promise<void>
/**
 * Note `aspects` or a `password` for `id`: written to its record if it has one, else kept in
 * memory and written when _updateRecord first makes its record.
 */
export async function _noteContents(id: string, contents: { aspects?: number[]; password?: string }): Promise<void>
```

- `_updateRecord` and `_updateRecords` must go through `kv.update` / `kv.updateMany`. Never
  `kv.set` a record from the copy in memory: the service worker may have changed it. STORAGE.md,
  "Writing safely", explains why.
- When `_updateRecord` makes a record that didn't exist, merge in anything `_noteContents` held for
  that id, then forget it.
- The service worker loads this module too. Keep it free of DOM use and of pdf.js.

In `src/storage/keys.ts`, add `original: (id: string) => 'original:' + id`, with its comment
pointing to `originals/_record-store.ts` and STORAGE.md.

## Stage 4: aspects and passwords in the record

- `src/originals/original.ts`:
  - `knownAspects(id)` returns `_record(id)?.aspects`. Keep it `async`, so callers don't change.
  - `storeAspects` calls `_noteContents(id, { aspects })` when they differ.
- `src/originals/_pdf-source.ts`:
  - `savedPassword(id)` reads `_record(id)?.password`.
  - `keep()` calls `_noteContents(id, { password })`.
- Remove `aspects` and `password` from `keys.ts`.

`_record()` only knows records that were loaded. Until stage 6 nothing loads them, so do stages 4
to 6 in one commit if stage 4 alone would break the app. The tests and the build won't catch this.

## Stage 5: the byte stores

**`src/originals/internal-score-fs.ts`**
- Remove `InternalIds`, `_internalIds`, `_IdRecord`, `_keptIds` and its test
  (`internal-score-fs.test.ts`), and every `kv` use.
- Keep `_opfsRoot`, `_internalFiles`, `internalBytes`, and `_removeInternalFile` (without its `kv`
  line).

**`src/originals/inbox-fs.ts`** (rewrite; it must stay free of pdf.js)
```ts
/** OPFS inbox/. */
const inboxDir = …
/**
 * For the service worker: take files shared to Volti. Each is read once and hashed (hashBytes).
 * One whose id has a better place than the inbox (_rank) is dropped. Otherwise its bytes are
 * written to inbox/<id> first, then its record becomes { kind: 'inbox', inboxAt: now } at
 * path _importName(file.name, file.type), keeping aspects and password, and a removed copy's bytes
 * are deleted after. Two files with the same id in one share are one.
 */
export async function putInbox(files: File[]): Promise<void>
/** The bytes of a file in the inbox. */
export async function _inboxFile(id: string): Promise<File>
/** Delete a file's bytes from the inbox, once its record no longer says it is there. */
export async function _dropInboxBytes(id: string): Promise<void>
```
- Use `_updateRecord`. Decide "better place" *inside* its function, from the stored record. Read
  `kv.get(keys.folder)` first to know `linked`.
- The page reads inbox records from the record store (`kind === 'inbox'`, oldest `inboxAt`
  first), so there is no `peekInbox`. Remove `peekInbox` and `dropInbox`.

**`src/originals/trash-fs.ts`**
- The directory stays `removed/`. Files are named by `_bytesName(id, where)`, which is the same
  `<at>-<id>` as now.
- `_keepRemoved(id, path, file)`: write the bytes, then `_updateRecord(id, r => ({ ...r, path,
  where: { kind: 'removed', removedAt: at } }))`. Return nothing. Callers undo a failed removal by
  setting the record back (see stage 6).
- `recentlyRemoved()`: from `_records()`, those in `removed`, latest first, as
  `Removed { id, path, at }`.
- `_removedFile(r)`: the file `removed/<at>-<id>`.
- `_forgetRemovedBytes(id, at)`: delete the bytes only. Whoever changes the record calls this
  after.
- `purgeRemoved(now)`: `await _loadRecords()` first (it runs at start-up, before any listing).
  Then, for each id from `_toPurge`, set the record to `gone` and delete the bytes.
- In `src/originals/types.ts`, `Removed` becomes `{ id: string; path: string; at: number }`, with
  no `key`.

## Stage 6: listing the library, and moving files

**`src/originals/device-score-fs.ts`**
- `folder` now holds `FolderLink` (STORAGE.md). `_linked()` returns the handle only when `linked`
  is true.
- `linkFolder()`: after the picker, read the stored link. If there is one and
  `await old.handle.isSameEntry(dir)` is true, keep the records. Otherwise set every `folder`
  record to `gone` with `_updateRecords`. Then store `{ handle: dir, linked: true }`.
- `unlinkFolder()`: store `{ handle, linked: false }`. Don't touch the records.
- Remove `_ListingEntry`, `_rememberedListing`, `_saveListing`, `_relist`, `Hashed`,
  `_HashCache`, `DeviceIds` and `_deviceIds`.
- Keep exports, access and folder state as they are.

**`src/originals/_types.ts`**: remove `Ids`.

**`src/originals/library-files.ts`**
- Remove `splitIds`, `_idsReady`, `idsOfRoot` and `_rememberId`.
- Add a module-level `duplicates: Map<string, _Found>` for this session's hidden duplicates in the
  linked folder.
- `libraryFiles(state, progress)`:
  1. `await _loadRecords()`.
  2. **Locked:** show the `folder` records (if the folder is linked) as source files, and change
     nothing.
  3. **Otherwise**, walk the root (`_folderFiles()`). For each file, find its id without hashing
     where it's safe:
     - linked folder: a `folder` record at that path with the same size and modified time, or an
       entry in `duplicates` with the same size and modified time
     - Volti's own folder: an `internal` record at that path

     Hash the rest one at a time with `hashFile`, calling `progress` as now.
  4. `_resolveListing(kind, _records(), found, linked)`.
  5. Write `changed` with one `_updateRecords` call. For each id, the function you pass
     recomputes from the stored record. The simplest correct way: if the stored record is still
     the one `_resolveListing` saw (`JSON.stringify` equal), return the new one; otherwise return
     the stored one unchanged, so a share made meanwhile wins and is picked up next listing.
  6. Then delete the bytes in `drop`:
     - `internal`: `_removeInternalFile(path)`
     - `inbox`: `_dropInboxBytes(id)`
     - `removed`: `_forgetRemovedBytes(id, removedAt)`
     - a found internal file that lost: `_removeInternalFile(path)`
  7. Replace `duplicates` with the listing's, for the linked folder.
  8. Return the `files` as source files, sorted by title.
  - Remove the `titles` update at the end.
- `knownTitles()`: build `{ [id]: titleOf(record.path) }` from `_records()`. Keep the name, so
  callers don't change.
- `LibraryFile.moveInRoot`: after the move, `_updateRecord(this.id, r => ({ ...r!, path: now,
  where: … }))`. For `folder`, use the moved file's size and `lastModified`; for `internal`, keep
  `{ kind: 'internal' }`.
- `LibraryFile.remove`:
  1. Note the record as it is.
  2. `_keepRemoved(...)`.
  3. Delete the file in the root.
  4. If that throws, put the old record back with `_updateRecord`, delete the removed bytes, and
     rethrow.
- Add `_placed(id, path, file)`: after a file has been written into the root at `path`, set its
  record to `folder` (with size and modified) or `internal`, depending on whether a folder is
  linked. Return the record before, so the caller can delete the old place's bytes.

**`src/originals/misc-files.ts`**
- `MemoryFile.move`: after `writeFile`, call `_placed(...)`, then delete the old place's bytes
  (inbox, removed, or internal when it was left in Volti's folder), using the record returned.
  Drop `drop` from the constructor where a file's old place is now worked out from its record.
  Keep it for Add PDFs files, which have no record.
- `readIncoming` stays as it is (Add PDFs: nothing stored).
- Add `inboxFiles(): Promise<SourceFile[]>`: the `inbox` records, oldest first, as held files
  (bytes from `_inboxFile`).
  - Removing one (left out, or the dialog cancelled): `_updateRecord` to `removed` with
    `removedAt` now. Then write the bytes to `removed/` and delete them from `inbox/`. Write the
    removed copy *before* changing the record, and delete the inbox copy *after* (STORAGE.md,
    "Writing safely").
- `leftInApp()`: list Volti's own folder with the same steps as `libraryFiles` (with
  `kind: 'internal'`, and `linked` true). Return the winners as held files. Removing one deletes
  its file and sets its record to `gone`.
- `removedSource(r)`: as now, from the new `Removed`. Moving it in clears the trash bytes after
  `_placed`.

**Library screen**
- `src/library/library.ts`:
  - `addShared()`: use `inboxFiles()`. The dialog's `done` no longer drops anything, because
    leaving out and cancelling are handled by the files themselves.
  - `titleOf()`: drop the `this.saved.get(scoreId)?.title` fallback.
- `src/library/_incoming.ts`:
  - When the dialog closes without adding a file, call `remove()` on each file not added and not
    `have`. For Add PDFs files that does nothing; for inbox files it moves them to Recently
    removed.
  - A `have` inbox file: delete its inbox bytes only. The library's record stays as it is.
  - Check that "Leave out" calls `remove()` too.
- `src/library/_removed.ts`: use `Removed` without `key`.

**Service worker** (`src/sw.ts`): no change beyond what `putInbox` now does. Check that
`npm run build` still leaves pdf.js out of the service worker bundle: search the built `sw.js` in
`dist/` for `pdfjs`.

**`keys.ts`**: remove `folderListing`, `hashes`, `internalIds`, `titles`, `removed` and `inbox`.
Update `folder`'s comment.

## Stage 7: scores without id and title

- `src/scores/model.ts`: remove `title` from `Score`. `newScore(id, aspects)` loses its `title`
  argument. Fix every caller: `npm run build` lists them, including `_incoming.ts`,
  `scores/store.ts` and `scores/model.ts:72`.
- `src/scores/store.ts`:
  - On load: `const { id: _, title: __, ...rest } = stored; score = { ...rest, id }`. Old records
    may have both fields.
  - On save, store the score without `id`: add a helper
    `const stored = ({ id: _, ...rest }: Score): StoredScore => rest;` and use it in `scoreEntries`
    and `scoreEntry`.
  - `loadScore(id, aspects)` loses its `title` argument. Fix callers.
- Tests that build scores (`scores/testing.ts` and others) may set `title`: remove it.

## Stage 8: last-read

- New file `src/reader/_last-read.ts`, **Pure**, with a test:
  ```ts
  export type LastRead = …   // exactly as STORAGE.md
  /** What is opened: a score or an excerpt of it (its span's ends), or a setlist (without a tapped entry). */
  export type Opening = { kind: 'score'; id: string; first?: string; last?: string } | { kind: 'setlist'; id: string };
  /** Where to start `opening`: where `last` was, if it names the same thing; else undefined (its beginning). */
  export function resumeAt(last: LastRead | undefined, opening: Opening): { entry?: string; cut: string } | undefined
  ```
  A score matches only with equal `id`, `first` and `last` (compare the strings; a missing end
  matches only a missing end). Test: same score; a different score; the whole score against an
  excerpt of it, both ways (no match); the same excerpt; two excerpts of one score (no match);
  same setlist; a score with a setlist's `last-read` of the same id string (no match); nothing
  stored.
- New file `src/reader/_store.ts`, like `library/_store.ts`: `loadLastRead()` and
  `saveLastRead(l)`. In `keys.ts`, add `lastRead: 'last-read'` and remove `pos`.
- `src/scores/store.ts`: remove `saveScorePosition` and the `pos` read in `loadScore`, which then
  returns only `{ state }`.
- `src/reader/reader.ts`:
  - `openReader`:
    - for `score`, `position = resumeAt(await loadLastRead(), { kind: 'score', id })?.cut`
    - for `excerpt`, the same with `...ends(what.excerpt)` in the opening, and pass the position
      to the `Reader` (today it passes `undefined`).
    - for `setlist` with no `startEntry`, use `resumeAt` to get `entry` and `cut`, find `k` by
      `entryId`, and pass `cut` as the position. If the entry isn't found, use `k = 0` and no
      position.
    - with a `startEntry`, as now: it starts at that entry's start. `saveSpot` then makes
      `last-read` name the setlist at that entry, as for any setlist.
  - `saveSpot(cut)`:
    - for `score`, save `{ kind: 'score', id: this.items[this.k].scoreId, cut }`
    - for `excerpt`, the same plus `...ends(this.reading.what.span)`. Use the span in
      `this.reading.what`, not the one opened: it follows cut edits, and playing part of a score
      (`readSpan`) switches the reader to an excerpt.
    - for `setlist`, save `{ kind: 'setlist', id: <the setlist id>, entry: this.items[this.k].entryId!, cut }`

    The setlist id is in `this.reading.what` when its kind is `'setlist'`.
  - A cut that no longer exists: check that `goTo(k, cut)` falls back to the start. If not, make
    it.

## Stage 9: start-up tidying, and the docs

- New export in `src/originals/library-files.ts`: `tidyStorage()`, called once from `main.ts`
  next to where `purgeRemoved` is called now. It:
  1. Deletes the old database: `indexedDB.deleteDatabase('volti')`. Ignore errors.
  2. Deletes the old keys listed in STORAGE.md with `kv.del`, and every `pos:`, `aspects:` and
     `password:` key (use `kv.entries` to find them). Writing this as a list of old names in one
     place is fine; it can be removed in a later version.
  3. Deletes files in `inbox/` and `removed/` that no record points to and whose `lastModified`
     is more than ten minutes ago.
- `src/storage/keys.ts`: it should list exactly the keys in STORAGE.md's table, each with its
  owner.
- `ARCHITECTURE.md`:
  - In the layer table, update the `originals/` row: the two record files, and what
    `device-score-fs`, `internal-score-fs`, `inbox-fs` and `trash-fs` now do. Update the file count.
  - In the `storage/` row, point to `STORAGE.md`.
  - Under **Something new to store**, add "and to `STORAGE.md`".
- `STORAGE.md`: remove the paragraph at the top saying the code doesn't follow it yet.
- `TODO.md`: take out the item for this work, and put the manual checks below under
  **Manual check**.
- Delete this file.

## Manual checks

Open DevTools → Application → IndexedDB → `volti-scores` → `kv` to watch the records as you go.

1. **Fresh start, no folder linked.** Add two PDFs with Add PDFs. There are two `original:`
   records with `where.kind` `internal`. Open one: its record gains `aspects`.
2. **Password.** Add a password-protected PDF and open it. The record gains `password`. Reload
   and open it again: you aren't asked.
3. **Link a folder** holding one of the same PDFs and one new one. The shared one's record becomes
   `folder`, and its file is gone from OPFS `library/` (DevTools → Application → Storage, or log
   `_internalFiles()`). The new one is hashed once. Reload: nothing is hashed again (no "Reading
   new scores").
4. **Duplicates.** Copy a PDF in the linked folder under another name. The library shows it once.
   The record keeps the old path. Delete the original copy and check the folder again: the record
   moves to the copy's path.
5. **Rename and move** a score from the app: `path` changes, and nothing is hashed again.
6. **Remove** a score: the record is `removed`, and the file is in OPFS `removed/`. Recently
   removed lists it. Put it back: the record is `folder` again, and `removed/` is empty.
7. **Share** a PDF from another app (Android) while the app is closed. Its record is `inbox`, with
   bytes in `inbox/`. Open the app: the incoming dialog shows it. Cancel: it's in Recently removed.
   Share it again: it's in the inbox again, and `removed/` no longer has it.
8. **Share** a PDF the library has: nothing changes, and no inbox entry appears.
9. **Unlink and relink the same folder:** nothing is hashed again. **Link a different folder:**
   the old folder's records become `gone`.
10. **Locked folder:** reload with the folder linked, before allowing access. The library lists
    the folder's scores from their records.
11. **Missing score title:** delete a PDF in the linked folder that is in a setlist, then check
    the folder. Its record is `gone`, and the setlist still shows its title.
12. **Last read.**
    - Open score A and turn a few pages, back to the library, open A again: same place.
    - Open B, then A again: A starts at the beginning.
    - Play a setlist, turn into its second entry, close and reopen the app, play it again: same
      place.
    - Tap one entry of the setlist instead: it starts at that entry. Turn a page, go back, and
      play the setlist: it resumes there.
    - Open an excerpt of A from the library, turn a page, go back, open it again: same place.
      Then open A itself: it starts at the beginning. Then the excerpt again: its beginning too.
13. **Purge.** Set a removed record's `removedAt` to 8 days ago in DevTools and reload: the record
    is `gone`, and its bytes are deleted.
14. **Old data.** On a device that had the previous version, after the first start the old keys
    and the `volti` database are gone, and scores, ink and setlists are all still there.
