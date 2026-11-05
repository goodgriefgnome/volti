# Score roots: plan

How to get to what `score-root-spec.md` describes. Read the spec first; where the two disagree, the
spec wins. Each stage is one commit, or a few, and every commit leaves `npm test` and `npm run
build` passing. Before each push, also try the stage in the running app (`npm run dev`) with the
checks it lists. Commit and push each stage before starting the next.

The tests run in Node, without a DOM. Logic worth testing goes in pure functions, and the tests
call those; the directory handle roots are tested against an in-memory stand-in for the handle API
(stage 3).

Code style: match what is there. Each new module starts with a comment saying what belongs in it.
Comments say what something is or why, in the same tone as the code around them. Line numbers below
are as the files are before stage 1; they drift as the stages go, so find each function by name.

`src/originals/order.test.ts` lists every file of `originals/` in an order where each imports
values only from files above it. Every new file goes into that list, at the place given below.

## Stage 1: the types, and the record rules (pure)

### `originals/_types.ts`

Add, as the spec gives them: `Stamp`, `Found`, `Known`, `Update`, `Updates`, `Moved` and
`ScoreRoot`. `_types.ts` is type-only, so this changes nothing at run time.

### `originals/_record-model.ts`

Change `Where`'s `folder` member to

```ts
  /** In the linked folder at `path`, with its root's stamp (the linked folder's: `size` and `modified`). */
  | ({ kind: 'folder' } & Stamp)
```

(importing `type Stamp` from `./_types`). What is stored doesn't change: a `folder` record's
`size` and `modified` are the linked folder root's stamp. Fix the one place this breaks to compile,
`trusted` in `library-files.ts` (about line 249), with `as number` on `r.where.size` and
`r.where.modified`, and a comment that it goes in stage 6.

Add these, each with a comment, as the code around them is written:

```ts
/** The stamp in a `folder` place: every field but `kind`. */
export function _stampOf(where: Where & { kind: 'folder' }): Stamp;

/** The `folder` place holding `stamp`. */
export function _folderWhere(stamp?: Stamp): Where;

/** Whether two stamps are the same: the same keys, each value `===`; two missing are the same. */
export function _sameStamp(a: Stamp | undefined, b: Stamp | undefined): boolean;

/** What `known` is for the linked folder: each `folder` record's place. */
export function _knownOf(records: ReadonlyMap<string, OriginalRecord>): Map<string, Found>;

/** The library's files: the ids whose records are in the root (`folder` while a folder is linked, `internal` otherwise), at their paths. */
export function _inRoot(records: ReadonlyMap<string, OriginalRecord>, linked: boolean): { id: string; path: string }[];

/** As the spec says: what a change a scan found means for the record of its id. */
export function _applyUpdate(record: OriginalRecord | undefined, found: Found | undefined, linked: boolean):
  { next: OriginalRecord; drop?: { id: string; where: Where; path: string } } | null;
```

`_applyUpdate`, row by row (the scan is only of the linked folder, so `linked` is true in use; it
is a parameter so the ranks stay one rule):

- `found`, no record: `{ path: found.path, where: _folderWhere(found.stamp) }`.
- `found`, a record whose place ranks below `folder` (use `_rank`): `{ ...record, path, where }`,
  and `drop` is the record's old place when it has bytes of its own (`internal`, `inbox`,
  `removed`; the same test as `hasBytes`), with the record's old path.
- `found`, a `folder` record: null when its path is `found.path` and its stamp is `found.stamp`
  (`_sameStamp`), else `{ ...record, path, where }`.
- no `found`, a `folder` record: `{ ...record, where: { kind: 'gone' } }`.
- no `found`, any other record, or none: null.

Leave `_resolveListing` as it is for now: stage 6 removes it.

### Tests, in `_record-model.test.ts`

- `_stampOf` and `_folderWhere` undo each other; `_sameStamp` is true for equal stamps in another
  key order, false for a different value or an extra key, true for two missing.
- `_applyUpdate`: each row above, with aspects and password kept on a moved record; `drop` for an
  `internal`, `inbox` and `removed` record, none for `gone`.
- `_inRoot`: `folder` records while linked, `internal` ones otherwise, nothing else.
- `_knownOf`: only `folder` records, with their stamps.

No change in the app; nothing to check by hand.

## Stage 2: the linked folder's duplicate rules (pure)

A new module, `originals/_folder-scan.ts`, placed in `ORDER` after `_record-store`. It is the
bookkeeping of one scan of the linked folder, with no files and no storage:

```ts
/** A file a scan has an id for: its path, id and stamp. */
export interface _Seen { path: string; id: string; stamp?: Stamp }

/**
 * Where one id is in the folder, from where it was (`before`: known, or said earlier in this scan)
 * and the copies of it seen (in the order they were seen): it stays at its path while a copy is
 * there (taking that copy's stamp); otherwise the copy whose path sorts first (plain string
 * comparison) takes over; an id that was nowhere goes to its first copy seen. Undefined when no
 * copy has been seen.
 */
export function _placeOf(before: Found | undefined, copies: readonly _Seen[]): Found | undefined;

/** One scan's bookkeeping: what has been seen, and what each id was last said to be. */
export class _FolderScan {
  constructor(known: Known);
  /** A file seen with its id (trusted, or hashed); replaces what was seen at its path. Gives the change to say for its id, and for an id that was at that path before, if any. */
  see(file: _Seen): Update[];
  /** Every file is hashed: the ids whose known path wasn't seen and which have no copy, said gone. */
  finish(): Update[];
  /** The copies seen that aren't their id's place: kept by the root for its next scan. */
  hidden(): Map<string, { id: string; stamp?: Stamp }>;
}
```

How `_FolderScan` works:

- It keeps `said: Map<id, Found>`, starting as a copy of `known`, and `seen: Map<path, _Seen>`.
- `see(file)`: put it in `seen` (if another id was seen at that path, that id is affected too).
  For each affected id, work out `_placeOf(said.get(id), copies of it in seen)`. If that is a
  place and differs from `said.get(id)` (path, or stamp by `_sameStamp`), set `said` and give
  `{ id, found }`. If it is undefined, give nothing yet: the id may turn up at another path.
- `finish()`: for each id in `said` with no copy in `seen`, delete it and give `{ id }`. After
  `finish`, `see` gives `{ id }` straight away for an id left with no copy (pass 2).
- `hidden()`: every path in `seen` that isn't its id's place in `said`.

Note what this means for the spec's step 2: a known path seen as it was gives nothing (its place
and stamp are as known); a hidden copy of an id still at its known path gives nothing.

### Tests, in `_folder-scan.test.ts`

Port the duplicate cases of `_resolveListing` from `_record-model.test.ts`, and add:

- A known file seen at its known path with its known stamp: no update.
- The same with a new stamp: `{ id, found }` with the new stamp.
- A new id: said at its path when seen; two copies of a new id: at the first seen, even when the
  second sorts first.
- Sticky: an id stays at its known path when a copy that sorts first is seen.
- A known id whose path isn't seen, with a copy seen: said at the copy at once.
- With two copies and the known path gone: the one sorting first.
- A known id with no copy: nothing until `finish`, then `{ id }`.
- After `finish`, a path seen again with a different id (pass 2): the new id said there, the old id
  said at its other copy, or gone.
- `hidden()`: the copies that aren't places.

No change in the app; nothing to check by hand.

## Stage 3: the directory handle roots

### The stand-in, `originals/_fake-handles.ts`

Placed first in `ORDER` (it imports nothing from `originals/`). Only tests import it. An in-memory
folder tree implementing the parts of `FileSystemDirectoryHandle` and `FileSystemFileHandle` that
the roots use: `kind`, `name`, `entries()`, `keys()`, `getDirectoryHandle(name, { create })`,
`getFileHandle(name, { create })`, `removeEntry(name)`, `isSameEntry(other)`, `getFile()` (a
`File` with a `lastModified` the test sets), `createWritable()` (with `write` and `close`),
`move(dir, name)` / `move(name)` (left out when a test asks, to exercise copying), and
`queryPermission` / `requestPermission` (answering what the test sets). A flag makes names match
ignoring case, as on Android. It also counts `getFile()` calls per path, so a test can check that
a trusted file isn't read.

```ts
/** A folder tree in memory, standing in for a FileSystemDirectoryHandle in tests. */
export function _fakeFolder(files: Record<string, { bytes: string; modified?: number }>, options?: { ignoreCase?: boolean; noMove?: boolean; permission?: PermissionState }): FakeDirectory;
```

Node has `File`, `Blob` and `crypto.subtle`, so hashing works in tests as it does in the app.

### `originals/_directory-handle-roots.ts`

Placed in `ORDER` after `_folder-scan`. It imports `walk`, `hashFile`, `inTurns` from
`_filesystem-utils`, `_FolderScan` from `_folder-scan`, `NoAccess` from `types`, and
`folderOf`/`_nameOf` from `path-utils`.

A base class, not exported, with the file operations, moved from `library-files.ts` as they are:

```ts
abstract class DirectoryHandleRoot implements ScoreRoot {
  constructor(protected dir: FileSystemDirectoryHandle) {}
  abstract access(): Promise<'ready' | 'locked'>;
  abstract needAccess(mode: 'read' | 'readwrite'): Promise<void>;
  abstract getUpdates(known: Known, signal: AbortSignal): AsyncIterable<Updates>;
  /** This root's stamp for a file it has written or moved; none for Volti's own folder. */
  protected abstract stampOf(file: File): Stamp | undefined;
  read(path: string): Promise<File>;              // placeOf + getFileHandle + getFile (from fileAt)
  exists(path: string): Promise<boolean>;         // getFileHandle, true/false
  write(path: string, data: Blob): Promise<{ file: File; stamp?: Stamp }>;  // makeFolder + writeFile, then getFile
  move(from: string, to: string): Promise<Moved>;  // the mechanics of moveInRoot
  remove(path: string): Promise<void>;            // placeOf + removeEntry
  private placeOf(path: string): Promise<[FileSystemDirectoryHandle, string]>;  // from library-files.ts
  protected makeFolder(path: string): Promise<FileSystemDirectoryHandle>;       // _makeFolder, from library-files.ts
}
```

`move` is the part of `LibraryFile.moveInRoot` (`library-files.ts:81-125`) that touches handles,
with the messages taken out:

- `from` and `old` from `placeOf(from)`; `into` is `from`'s folder when `to` is in the same folder
  (by `folderOf`), else `makeFolder(folderOf(to))`.
- `same` (`into === from` or `isSameEntry`), `now` (the path in `from`'s folder's spelling when
  `same`), and when `same` and the name is `old`: give `{ path: now, file, stamp }` with nothing
  moved.
- `caseOnly` as now. Move with `h.move` where there is one; where it fails or is missing: for
  `caseOnly`, give `{ caseOnly: true }`; else copy and delete as now, and when the delete fails,
  give `leftBehind: true`.
- Then get the file at its new place and give `{ path: now, file, stamp: this.stampOf(file) }`.

The taken check (`library-files.ts:98`) is not in `move`: the caller asks `exists` first.

```ts
/** Volti's own folder in OPFS: always ready, no stamps, and nothing changes in it but what Volti does. */
export class InternalDirectoryHandleRoot extends DirectoryHandleRoot {
  async access() { return 'ready' as const; }
  async needAccess() {}
  async *getUpdates(): AsyncIterable<Updates> {}
  protected stampOf() { return undefined; }
}

/** The linked scores folder: access by its permissions, stamps of size and modified time, and scanning. */
export class LinkedDirectoryHandleRoot extends DirectoryHandleRoot {
  /** The copies of ids found at other paths than their places, from the last scan: never hashed again by this root. */
  private hidden = new Map<string, { id: string; stamp?: Stamp }>();
  access(): Promise<'ready' | 'locked'>;   // queryPermission({ mode: 'read' }), as folderState and _canRead do
  needAccess(mode): Promise<void>;         // _needAccess, from device-score-fs.ts
  protected stampOf(file: File): Stamp;    // { size: file.size, modified: file.lastModified }
  getUpdates(known: Known, signal: AbortSignal): AsyncIterable<Updates>;
}
```

`LinkedDirectoryHandleRoot.getUpdates`, an `async function*`:

1. Walk the folder (`walk`, as `_folderFiles` does). Make `trusted: Map<path, { id, stamp? }>` from
   `known` (each id's path) and `this.hidden`. Make a `_FolderScan(known)`.
2. For each walked path in `trusted`: `scan.see({ path, ...trusted })`, collecting the updates.
   Those are the first batch, with `left` the number of the other paths (to hash). Yield it.
3. Hash the other paths with `inTurns(fresh, 8, …, signal)`, as `listing` does now: get the file,
   `hashFile`, `scan.see({ path, id, stamp })`. Updates go into a pending list. The generator
   yields `{ changes: pending, left }` whenever pending isn't empty, and a hashing worker that has
   added to it waits until that batch has been taken before it starts its next file. (A promise
   the generator resolves after each `yield` does this.) So batches are taken as fast as
   `library-files.ts` writes them, and no faster.
4. When hashing is done: `scan.finish()` gives the ids gone; yield them, with `left: 0`.
5. Pass 2, as `checkKnown` does now: for each path trusted in step 2, one at a time, get the file
   (skip it on `NotFoundError`). When its stamp isn't the trusted one, or there was none, hash it
   and `scan.see` it; yield what that gives, if anything.
6. At the end, and only if not aborted, `this.hidden = scan.hidden()`.

After every `await`, if `signal.aborted`, return: an aborted scan says nothing more. A read error
in hashing ends the scan with that error, as now.

### Tests, in `_directory-handle-roots.test.ts`

Against `_fakeFolder`:

- `exists`, `read`; `write` into a new subfolder, and over a file; a write that fails part way
  (make `createWritable().write` throw) leaves no file.
- `move`: within a folder, into another (made), with `noMove` (copied), with the delete failing
  (`leftBehind`), a case-only rename with `ignoreCase` and `noMove` (`caseOnly`), and a rename to
  the same name (nothing moved).
- The linked root's stamps from `write` and `move`; the internal root's none.
- `InternalDirectoryHandleRoot.getUpdates` ends at once with nothing.
- `LinkedDirectoryHandleRoot.getUpdates`, collecting all batches:
  - known paths with the same stamps: not read (the fake's counts), nothing said;
  - new files: hashed, stamped and said; `left` counting down to 0;
  - a known file moved to a new path: said at its new path in the batch it is hashed in;
  - a known file deleted: said gone only in the batch after hashing ends;
  - a duplicate of a known file: not said; on a second scan of the same root, not read;
  - pass 2: a known file with a new stamp and the same bytes said with the new stamp; with new
    bytes, its new id said there and its old id gone;
  - aborting part way: nothing yielded after.

Nothing uses the roots yet; nothing to check by hand.

## Stage 4: the file operations go through the roots

The library's listing still works as now in this stage (it still walks the linked folder's handle);
everything else that touches a root goes through `ScoreRoot`.

### `originals/device-score-fs.ts`

- Keep `dir` (the handle), and add `let root: LinkedDirectoryHandleRoot | undefined`, made from
  `dir` the first time it is wanted and again whenever `linkFolder` picks a folder (a new root,
  with no hidden copies). `unlinkFolder` clears it.
- `export async function _linkedRoot(): Promise<ScoreRoot | undefined>`.
- `folderState` asks `(await _linkedRoot())?.access()` for `ready` or `locked`; `_canRead` and
  `_needAccess` go (their callers use the root's `access` and `needAccess`). `_linked()` stays
  until stage 6, for the listing.
- `unlockFolder`, `linkFolder`, `unlinkFolder`, `canLinkFolder`, `_isLinked`: unchanged apart from
  making and clearing `root`.
- Exports move to `library-files.ts` (below), so the export can be recorded.

### `originals/internal-score-fs.ts`

- `export async function _internalRoot(): Promise<ScoreRoot>`: an `InternalDirectoryHandleRoot`
  over `_opfsRoot()`, made once.
- `_internalFiles` and `_removeInternalFile` stay until stage 6 (the listing uses them);
  `internalBytes` stays.

### `originals/library-files.ts`

- `root()` gives `(await _linkedRoot()) ?? _internalRoot()`. `fileAt`, `placeOf` and `_makeFolder`
  go (they are in the roots now).
- `rootWhere(file)` becomes `rootWhere(stamp?: Stamp)`: `_folderWhere(stamp)` while a folder is
  linked, else `{ kind: 'internal' }`.
- `_placed(id, path, file)` becomes `_placed(id, path, stamp?: Stamp)`.
- `LibraryFile`:
  - `file()`: `const r = await root(); await r.needAccess('read'); return r.read(this.path);`
  - `canReadNow()`: `(await root()).access()` is `ready`.
  - `moveInRoot(to)`: `needAccess('readwrite')`; unless only the case of the path changes
    (`to.toLowerCase() === this.path.toLowerCase()`), `exists(to)` first and the taken message as
    now; then `root.move(this.path, to)`. `caseOnly` gives today's case-only message;
    `leftBehind` gives today's "couldn't delete" messages. Then write the record with
    `_updateRecord(this.id, (r) => ({ ...r, path: moved.path, where: rootWhere(moved.stamp) }))`:
    note `...r` with no `r &&`, so a file with no record yet gets one (the spec's fix).
  - `remove()`: `needAccess('readwrite')`, `read` the file for `_keepRemoved`, then `remove`; the
    undo on failure as now.
- Exports, moved here from `device-score-fs.ts`: `EXPORTS`, `exportExists(name)` (the linked
  root's `needAccess('readwrite')` then `exists('Exports/<name>.pdf')`; it throws as now when no
  folder is linked) and `saveExport(name, data)` (`write`, then `hashFile` of the file written and
  `_placed(id, path, stamp)`, so the export is a score at once). Update the import in
  `dialogs/export-pdf.ts`.
- The listing (`_folderFiles`, `listing`, `checkKnown`, `settle`) still walks `_linked()`'s handle;
  only `rootWhere` changes for it.

### `originals/misc-files.ts`

`MemoryFile.move`: `needAccess('readwrite')`, `exists(to)` for the taken message, then
`const { stamp } = await root.write(to, this.bytes)` and `_placed(this.id, to, stamp)`. Export
`root` from `library-files.ts` as `_root` for this.

### Checks in the app

Link a folder. Rename a score, move it into a new folder and back, remove it and put it back from
Recently removed; add a PDF with Add PDFs; export a setlist into Exports (and once more, choosing
Replace). Each shows as before; the export shows in the library without Check for new scores.
Unlink, and do the same in Volti's own folder.

## Stage 5: files in Volti's folder without a record

In `tidyStorage` (`library-files.ts:359`), after the inbox and Recently removed: walk OPFS
`library/` (`_internalFiles`). For each file at a path no `internal` record has, last modified more
than `ORPHAN_MS` ago: hash it. If its id has a record in a better place than `internal` (`_rank`,
with the folder linked as `_isLinked` says), delete the file; otherwise
`_updateRecord(id, (r) => ({ ...r, path, where: { kind: 'internal' } }))`, unless `r` is in a
better place by then.

Check in the app: with no folder linked, add a PDF; in the browser's devtools, delete its
`original:` key from IndexedDB, set the clock (or `ORPHAN_MS` for the try) so it counts as old, and
reload: it is back in the library.

## Stage 6: the library follows the records

### `originals/_record-store.ts`

```ts
/** Hear each change this page makes to the records, and each load of them. Gives a function that stops hearing. */
export function _onRecords(heard: () => void): () => void;
```

Call the listeners at the end of `_loadRecords`, `_updateRecords` (when anything was written) and
`_noteContents` (when something was written).

### `originals/library-files.ts`

Remove `listing`, `checkKnown`, `settle`, `hidden`, `same` (if unused), `_folderFiles`, `Entry`,
`Known` (the old one), `Progress`, `_listInternal`, the old `libraryFiles`, and the stage 1 casts.
Add:

```ts
/** How many new files the running scan has left to hash: 0 when none is running. */
let left = 0;
/** The running scan, stopped by a new one. */
let scanning: AbortController | undefined;

export async function scanRoot(): Promise<void>;
export function libraryFiles(signal: AbortSignal): AsyncIterable<{ files: SourceFile[]; left: number }>;
```

`scanRoot`:

1. Abort `scanning`; make a new controller.
2. `await _loadRecords()`. If no folder is linked, or its root's `access()` isn't `ready`, return.
3. `known = _knownOf(_records())`; a snapshot `seen = new Map(_records())`.
4. For each batch of `root.getUpdates(known, signal)`: set `left`; then, in one
   `_updateRecords` call, for each update in order, a change that returns the stored record as it
   is when it isn't the same as `seen.get(id)` (another writer won), else `_applyUpdate(stored,
   found, true)?.next ?? stored`, noting each record written into `seen`, and each `drop`. After the
   write, `_dropBytes` each drop (as `settle` does). Then tell the listeners (the write did).
5. At the end (or on an error, which it throws on), `left = 0` and tell the listeners.

A batch with no changes still sets `left` and tells the listeners, so the status line counts down.

`libraryFiles(signal)`: an `async function*` that yields at once, then each time `_onRecords` (or
`scanRoot`'s `left` changing) says so, coalescing what comes while the consumer is busy, until
`signal` aborts. What it yields: `_inRoot(_records(), linked)` made into `SourceFile`s with
`_sourceFileOf`, sorted `byTitle`, and `left`. `linked` is whether a folder is linked
(`_linkedRoot()` is not undefined), asked each time.

### `originals/misc-files.ts`

`leftInApp()`: the `internal` records while a folder is linked, each a held file with its bytes
read from `_internalRoot()` (a file that can't be read is left out, with a warning). Removing one
removes it through the internal root and marks its record `gone` as now. `_listInternal` and
`_internalFiles` (if nothing else uses it; `tidyStorage` does) go.

### `library/library.ts`

- In the constructor, start reading `libraryFiles` with an `AbortController` kept for the
  library's life: each item sets `originals`, `reading = left > 0`, and the status line ("Reading
  new scores: N left…" while `left`, else back to what it said before), and asks for a draw. The
  first item also loads the setlists, as the first `progress` did. Draw at most once a frame
  (`requestAnimationFrame`): the scores section, and the setlists after `loadSetlists` when the set
  of ids changed (pass 2's `changed` did that).
- `readOriginals` becomes: `folder = await folderState()`, `leftIn = (await leftInApp()).length`
  while linked, the banner drawn, then `await scanRoot()` in the same try/catch and message as
  now.
- Everything else stays this stage: `filesChanged`, the refreshes after Volti's own changes (they
  scan, harmlessly).

### Checks in the app

- Link a folder with a few hundred PDFs, some in subfolders: the library fills as before, with
  "Reading new scores: N left…" counting down.
- Reload half way through a first scan: the files read before the reload show at once, and the
  count starts lower.
- Rename a file in the Files app, and come back after 30 seconds: it shows at its new name. Delete
  one: it goes once the scan is done. Copy one to a second name: the library shows it once.
- Lock (reload without allowing access): the files show from the records, as before.
- Unlink: Volti's own folder's files show; link again: the folder's.

## Stage 7: what the user sees changes

As the spec's "What changes for the user".

### Scanning only where the folder may have changed outside Volti

Remove the `refresh()` calls after Volti's own changes: in `_incoming.ts` (lines 194 and 204, the
second keeping `lib.say`), `_removed.ts:62`, the export's `saved` (`library.ts:353`), and in
`moveLeftIn` (both). Keep it on opening, coming back, Check for new scores, linking, unlocking,
unlinking, and `accessAllowed` and `back` when the folder's state changed.

### `filesChanged` goes from the library

- Remove `filesChanged` from `Library` and `LibraryHost`, and the call in `_scores-section.ts`
  (Remove). The scores section's `ScoreFileHost` gives no `changed`.
- In `dialogs/score-files.ts`, `changed` becomes optional (`changed?(change)`), called with `?.`.
  The reader keeps it, for its own open scores (`_toolbar-menus.ts:117`).
- In the reader, remove `fileChanges`, `MenusHost.filesChanged` and its two calls; `openReader`'s
  `onClose` takes no arguments. In `library.ts`'s `back`, drop the `fileChanges` branch: redraw
  with `loadSetlists` as the other branch does now.

### Moving the files left in Volti's folder

`moveLeftIn(asked: boolean)`:

- From the ⋯ menu (`asked`): if the folder is locked, `unlockFolder()` first (from the tap), saying
  `NO_ACCESS` and stopping when refused; then say "Checking the scores folder…" and
  `await this.refresh()`.
- From linking (`link`, after its `await this.refresh()`): as is; that refresh already waited for
  the whole scan.
- Then as now, with `arrivals` over `originals`.
- At the end, when some clash (`taken`): from the ⋯ menu, open the screen for incoming files as
  now; from linking, don't, and say
  "Moved N scores into the scores folder. M have the same name as files there: see the ⋯ menu."
  (with `plural`, and "has" for one; without the first sentence when none moved).
- `leftIn` is counted again at the end (`(await leftInApp()).length`) and the banner drawn.

### Check for new scores

`checkFolder` already awaits `refresh()`, which now waits for the whole scan: nothing to change but
checking that the toast comes at the end.

### Unlocking

`unlock()` doesn't wait for the scan before the shared files: `void this.refresh()`, then
`await this.addShared()`.

### Checks in the app

- With scores in Volti's own folder, one with the same name as a file in the folder: link it. The
  others move; the status line says one clashes; the incoming screen doesn't open. The ⋯ menu's
  "Move 1 score left in Volti…" says it is checking, then opens it.
- Add a PDF, put one back, export: the library shows each without "Reading…".
- Rename and remove a score in the reader, then go back: the library shows the change.
- Check for new scores with a new file in the folder: the toast comes once the scan is done.
- Allow access with a share waiting: the share screen opens without waiting for the scan.

## Stage 8: the docs

- `STORAGE.md`: as the spec's "Docs" says. In "What happens, by operation", the "Listing a readable
  linked folder" row becomes "Scanning the linked folder" (each change written as it is found:
  `_applyUpdate`'s rows), the "Listing Volti's own folder" row goes, and "Writing safely" gains the
  start-up recording of files in `library/`.
- `ARCHITECTURE.md`: the `originals/` row lists the files in `ORDER` with the new ones
  (`_fake-handles` is for tests only), says the roots are in `_directory-handle-roots` and the
  linked folder's duplicate rules in `_folder-scan`; the library's paragraph says it follows
  `libraryFiles` and scans only where the folder may have changed outside Volti.
- Move this plan and the spec out: delete `docs/score-root-spec.md` and
  `docs/score-root-plan.md` in the last commit.

## Manual checks for the whole

On an Android tablet, with a folder linked through the picker:

1. A first link of a folder of a few hundred PDFs: the library fills as they are hashed; leave and
   come back half way: it carries on from where it was.
2. Rename, move, remove and put back a score, from the library and from the reader; add a PDF;
   share one from Files; export a setlist. Each shows at once, with no rescan.
3. In the Files app: add a PDF, rename one, delete one, copy one to a second name. Come back after
   30 seconds: the new one shows, the renamed one at its new name, the deleted one gone once the
   scan ends, the copy not shown twice.
4. Replace a PDF in the Files app with another of the same name: the library shows the new one once
   pass 2 has reached it.
5. Unlink, add a PDF to Volti's own folder, link the folder again: the PDF moves into it, as the
   status line says.
6. Reload with the folder locked: the library shows the folder's scores; a setlist with its pages
   saved plays; Allow access scans.
