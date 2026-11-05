# Score roots: spec

What `originals/` is once the library's root is reached through one interface, `ScoreRoot`: what
a root offers, how a scan of one keeps the records up to date, and how the library's list of files
follows the records. This prepares for a root other than a folder handle (Google Drive, through its
API), which is not part of this work.

## Why

`library-files.ts`, `misc-files.ts` and the exports in `device-score-fs.ts` work on
`FileSystemDirectoryHandle`s directly: walking, getting files, moving, writing. And the way a
linked folder's files are known by id (trusted by path, then checked by size and date) is mixed
into the listing that every root goes through. A root that knows its files' ids, as Drive does
(`sha256Checksum`, the same SHA-256 Volti uses), would have to pretend to be a folder of handles.

After this work:

- Everything `originals/` does to a root goes through `ScoreRoot`.
- Working out ids by path, size and date, and the duplicates a folder can hold, are the handle
  root's own business, inside its scan. A scan says how each id's place has changed, or that it is
  gone.
- The library's list of files is worked out from the records, which every scan and every change
  Volti makes writes. Nothing patches the list by hand, and Volti's own changes don't rescan.

## What changes for the user

- **Linking a folder** no longer opens the screen for incoming files by itself when files left in
  Volti's folder clash with files in the linked one. The status line says how many were moved and
  how many clash, and points to the ⋯ menu's "Move N scores left in Volti…", which stays until
  they are resolved.
- **Moving the files left in Volti's folder** (on linking, and from the ⋯ menu) waits for the
  whole scan of the linked folder, both passes. Today it acts on pass 1's ids, and can delete the
  only copy of a file whose path was trusted but whose contents had changed. From the ⋯ menu, it
  asks for access first (while the tap counts), then scans, then moves; the status line says it is
  checking the folder meanwhile.
- **Check for new scores** says what it found once the whole scan is done, both passes.
- **A scan cut short keeps what it hashed:** the files it identified are in the records, and aren't
  hashed again.
- **Adding files, putting one back, moving files left in Volti's folder and exporting** no longer
  scan the folder again to show the result.
- **Which of two copies of a file in the linked folder is canonical**, when both are new in the
  same scan, is the first one hashed rather than the one whose path sorts first.
- **A file moved outside Volti** shows at its new path as soon as that file is hashed, rather
  than once every new file is; a file deleted outside Volti shows gone once every new file is
  hashed, as now.

Nothing else changes: what is shown, when, and every message.

## `ScoreRoot`

In `originals/_types.ts`. Paths are library paths ("Masses/Latin/Mass in G.pdf").

```ts
/** A library root: files by path. */
export interface ScoreRoot {
  /** Whether it can be read now without asking. Never asks. */
  access(): Promise<'ready' | 'locked'>;
  /** Make sure it can be read, or changed too, asking where it isn't allowed yet (from a tap); throws NoAccess. */
  needAccess(mode: 'read' | 'readwrite'): Promise<void>;
  /** How what is in it differs from `known`, as it finds out: see "Scanning". */
  getUpdates(known: Known, signal: AbortSignal): AsyncIterable<Updates>;
  /** The file at `path`. */
  read(path: string): Promise<File>;
  /** Whether there is a file at `path` (as the root finds names: a folder that ignores case finds one in any case). */
  exists(path: string): Promise<boolean>;
  /** Write `data` at `path`, over a file there, making the folders on it; one that fails part way leaves nothing. Gives the file as written, and its stamp. */
  write(path: string, data: Blob): Promise<{ file: File; stamp?: Stamp }>;
  /** Move the file at `from` to `to`, making the folders on it. */
  move(from: string, to: string): Promise<Moved>;
  remove(path: string): Promise<void>;
}

/** Where a moved file is now, as the root spells its folder, with its stamp; or why it couldn't move. */
export type Moved =
  | { path: string; file: File; stamp?: Stamp; leftBehind?: true }  // leftBehind: copied, but the file at `from` couldn't be deleted
  | { caseOnly: true };                                               // only the case changes, and this root can't do that
```

### Stamps

```ts
/**
 * What a root notes about a file to tell later whether it has changed, without reading it: a
 * handle root's size and modified time, say, or a crc32. Only its root reads what is in it. Flat,
 * so it can be stored as it is and compared field by field; never has a field called `kind`.
 */
export type Stamp = Readonly<Record<string, string | number>>;
```

A root gives a stamp with each file it finds, writes or moves, and is given back the stamps
recorded when it scans again. Everything else carries stamps without looking inside them: they
are recorded with the file's record, in the same write, and compared only as a whole (the same
keys, each value `===`).

`LinkedDirectoryHandleRoot`'s stamp is `{ size, modified }`: the file's size and `lastModified`. It converts
to and from its own exact type, `HandleStamp { size: number; modified: number }`, at its edge. A
root that knows its files' ids (Drive) needs no stamp.

Policy stays out of the roots: whether a name is taken before moving or adding (`exists`), the
messages, and what a move means for the records are `library-files.ts`'s and `misc-files.ts`'s.
A root only reports what happened.

The roots:

| Root | File | Made by |
| --- | --- | --- |
| `InternalDirectoryHandleRoot`: Volti's own folder in OPFS. Always `ready`; gives no stamps; `getUpdates` says nothing and ends at once, as only Volti changes what is in it. | `_directory-handle-roots.ts` | `internal-score-fs.ts` |
| `LinkedDirectoryHandleRoot`: the linked folder. Access by the folder's permissions, stamps on what it writes and moves, the hidden copies, and `getUpdates` by scanning. | `_directory-handle-roots.ts` | `device-score-fs.ts` |

Both are in one file and share the file operations on a `FileSystemDirectoryHandle` (`read`,
`exists`, `write`, `move`, `remove`), in a base class there that isn't exported; each adds its own
access, stamps and `getUpdates`.

`device-score-fs.ts` offers `_linkedRoot(): Promise<ScoreRoot | undefined>` in place of `_linked()`,
and `internal-score-fs.ts` offers `_internalRoot(): Promise<ScoreRoot>`. `library-files.ts` uses
the linked root while a folder is linked, else the internal one.

`walk`, `placeOf`, `_makeFolder`, `writeFile` (for roots) and the mechanics of `moveInRoot`
(`h.move`, copying where it can't, `isSameEntry`, the case-only check) move into that base
class.
`writeFile` stays in `_filesystem-utils.ts` for `inbox-fs.ts` and `trash-fs.ts`, which write to
OPFS and aren't roots.

Also unchanged: linking and unlinking, `FolderLink`, `folderState` (which asks the linked root's
`access()`), `canLinkFolder`, `unlockFolder`, and `_isLinked`, which the service worker uses.

### Exports

Exports stay in the linked folder's `Exports` subfolder, through the root: `exportExists(name)` is
`exists('Exports/<name>.pdf')` and `saveExport(name, pdf)` is `write`. An exported PDF is a file in
the root, so it is recorded as adding a file is (its bytes are hashed when it is written) and shows
in the library at once.

## Scanning

```ts
/** Where an id is in a root: its path (the canonical one, if it is there more than once), and its root's stamp. */
export interface Found { path: string; stamp?: Stamp }

/** What the records hold for a root: each id's place there. */
export type Known = ReadonlyMap<string, Found>;

/** A change a scan found: `id` is at `found` now (new, moved, or restamped), or, without `found`, nowhere in the root any more. */
export interface Update { id: string; found?: Found }

/** One batch of what a scan says: its changes, in order, and how many new files are still to be hashed. */
export interface Updates { changes: Update[]; left: number }
```

`ScoreRoot.getUpdates(known, signal): AsyncIterable<Updates>` says how `known` has changed: the same
map, keyed the same way, with entries replaced or removed. A root says only what has changed; an id
whose place is as `known` has it says nothing. A later change for an id replaces an earlier one, in
a batch or across batches. A batch holds whatever the root has ready (a folder walked, files hashed
since the batch before, a page of a listing); the scan doesn't go on until the batch is taken, so
the slower the batches are taken, the bigger they get. A scan ends when it has nothing more to say,
or when `signal` aborts; one aborted says nothing more.

`Found` replaces `_Found`: the id is the key, and a stamp replaces `size` and `modified`.

### What `LinkedDirectoryHandleRoot` keeps

- **The hidden copies:** a file whose id is at another path, its canonical one, too. Kept in
  memory, path → id and stamp, for as long as this root lives, so they aren't hashed again; never
  said, never stored. Linking a folder makes a new root, so one folder's copies are never trusted
  in another.
- **Which path is canonical**, by the rules of "Duplicates in the linked folder", as now: an id
  stays at its `known` path while a file with it is still there (sticky); when it isn't, the copy
  whose path sorts first takes over. A new id is at the first of its copies to be hashed, and stays
  there by the same stickiness.

These rules are a pure function beside `_directory-handle-roots.ts`, unit tested, taken from
`_resolveListing`.

### How `LinkedDirectoryHandleRoot` scans

1. Walk the folder: PDFs and images, a few folders deep, skipping names starting with a dot.
2. Pass 1: a path that `known` or a hidden copy has is trusted to have that id and stamp, without
   reading the file. An id whose known path the walk didn't find, but which has a trusted hidden
   copy, is said at that copy at once. Every other file is read and hashed, a few at a time (8), and
   stamped, and said as it is hashed: a new id at its path; an id whose known path the walk didn't
   find at its path (the file moved); an id whose known path is still there not at all (a hidden
   copy).
3. When every file is hashed: each id whose known path the walk didn't find, and which wasn't found
   anywhere else, is said gone. Only then can a file deleted be told from one moved.
4. Pass 2, in the background of the scan: the files trusted in pass 1 are got one at a time. One
   whose stamp differs from the one trusted is hashed. If its id is the same, the id is said with
   its new stamp; if not, its new id is said at its path, and its old id at another copy or gone. A
   file known with no stamp is hashed too, and said with its stamp. A file gone meanwhile is
   skipped: the next scan sees it missing.

`left` is the number of new files still to hash. Volti's own folder has no updates to give
(below). A root that knows its ids (Drive) compares
what it lists, or its changes since it last looked, against `known`, and says the same changes.

### What a scan means for the records

`library-files.ts` makes `known` from the records in this root: each `folder` record's id, path
and stamp. A record in the root is `where: { kind: 'folder', ...stamp }`, the stamp's fields
spread into `where`, so the linked folder's records are `{ kind: 'folder', size, modified }`, as stored
today; the stamp read back is every field of `where` but `kind`.

Each batch is written in one transaction, change by change, by one pure rule in `_record-model.ts`
that uses the places' ranks as now:

```ts
/**
 * What a change a scan found means for the record of its id: the record to write, and the bytes of
 * a place given up; null when nothing changes. `found` missing: the id is gone from the root.
 */
export function _applyUpdate(record: OriginalRecord | undefined, found: Found | undefined, linked: boolean): { next: OriginalRecord; drop?: { id: string; where: Where; path: string } } | null;
```

- **An id at a place, with no record:** a new record there, with the stamp.
- **An id at a place, its record in a lower place** (Volti's folder, the inbox, Recently removed,
  gone): the record moves there, with the stamp, and the bytes of the old place are deleted after.
- **An id at a place, its record in this root:** its path and stamp become those given.
- **An id gone:** its `folder` record becomes `gone`; one elsewhere is left alone.

`_record-model.ts` and `library-files.ts` never read what is in a stamp: they copy it, and compare
it whole. `_resolveListing` goes: its duplicate rules are the linked folder root.s, and its ranks are in
`_applyUpdate`. So does `hidden` in `library-files.ts`, and with it today's bug of trusting a copy from
the folder linked before.

Every write is to a record unchanged since the scan read it, as now: a record Volti or the service
worker changed meanwhile wins. The scan's own writes count as its reading.

## Volti's own folder

It isn't scanned: its root's `getUpdates` says nothing. Only Volti writes there, and every write records the file's id with it
(`_placed`), so its files are the `internal` records. `_listInternal` goes: `leftInApp` and the
count of files left in Volti's folder come from the records.

The one case the records can miss is a crash between writing a file into `library/` and writing
its record. At start-up, `tidyStorage` walks `library/` and records each file no record points to
that was last modified more than ten minutes ago: hashed, at its path, as `internal`, unless its id
has a better place, when the file is deleted.

`internalBytes` stays a walk of OPFS `library/` for the storage screen.

## The library's files

```ts
/**
 * The library's files, sorted by title: the records in the current root (the linked folder's,
 * linked or locked, else Volti's own). Yields at once, again after every change to the records
 * this page makes, and with how many new files a running scan has left to hash. Ends when `signal`
 * aborts.
 */
export function libraryFiles(signal: AbortSignal): AsyncIterable<{ files: SourceFile[]; left: number }>;

/** Scan the root (the linked folder, readable), writing the records; ends when the scan does. A scan started stops one running. */
export function scanRoot(): Promise<void>;
```

- The list is worked out from the records alone, by a pure function in `_record-model.ts` (the ids
  whose record is in the root, at their paths), then made into `SourceFile`s with `_sourceFileOf`.
- `_record-store.ts` tells listeners after each write it makes: `_onRecords(heard): () => void`.
  Writes by the service worker (shares) aren't heard; the library picks those up as now
  (`addShared`).
- Each of Volti's own changes writes the record, so the list follows it. A file Volti writes or
  moves into the root is recorded with the stamp `write` or `move` gives, so the next scan needn't
  hash it. `LibraryFile.move` writes `{ path, where }` even when the file has no record yet (one
  found by a scan not yet settled); today it writes nothing then.

**The library** (`library.ts`) reads `libraryFiles` for as long as it lives, setting `originals`,
`reading` and the status line, and drawing the scores at most once a frame. It scans
(`scanRoot`) only where the folder may have changed outside Volti, or the root changed: on opening,
on coming back after a while, Check for new scores, linking, unlocking, unlinking, and access
allowed from a score. Nothing else calls it: adding files, putting one back, moving, renaming,
removing and exporting are heard through the records. `filesChanged` and its patches go from the
library; the reader keeps `FileChange` for its own open scores.

## Behaviour to keep exactly

- Pass 1 hashes new files a few at a time (8), and the library shows its files before the first
  is hashed and as they are; pass 2 gets one file at a time.
- A newer scan stops an older one, and the older one writes nothing after.
- No record is written over one changed since the scan read it.
- Bytes are written before the record pointing to them, and deleted after it stops pointing to
  them.
- Moving a file: the taken check (ignoring case where the folder does), copying where moving fails,
  the case-only message, and the "couldn't delete it here" messages, as now.
- A locked folder's files are its `folder` records.

## Tests

- `_applyUpdate` and the list worked out from the records: unit tested in `_record-model.test.ts`:
  each row of the rule, with each place of record, and stamps carried into `where` as given.
- The linked folder root's duplicate rules, unit tested beside it: sticky, the copy sorting first taking
  over, a new id at its first copy hashed, an id said gone only when no copy is left.
- The directory handle roots' file operations, against an in-memory stand-in for the handle API: `exists`, `write` (and
  one failing part way), `move` (moved, copied, copied and left behind, case only), and
  `InternalDirectoryHandleRoot`'s `getUpdates` saying nothing.
- `LinkedDirectoryHandleRoot`, against the same stand-in: stamps from `write` and `move`, and its
  scan: known paths
  not read; new ones hashed, stamped and said; nothing said for a file as known; a hidden copy not
  said; a moved file said at its new path as soon as it is hashed, and a deleted one said gone only
  once every file is hashed; pass 2 saying a known file whose stamp differs or is missing; `left` counting down.
- The existing tests keep passing.

## Docs

- `STORAGE.md`: `Where`'s `folder` (`kind`, plus the root's stamp, which never has a `kind`; the
  linked folder root's is `size` and `modified`, as now), "The hash cache" (it is the linked folder root's scan,
  going by stamps), "Duplicates in the linked folder" (kept by the linked folder root; a new id at the
  first copy hashed in a scan), "Writing safely" (start-up records files in `library/` no
  record points to), and "What happens, by operation" (the listing rows: records written as each
  change is found; Volti's own folder isn't listed).
- `ARCHITECTURE.md`: the `originals/` row (the new files, in order, and what moved), and the
  library's paragraph (it follows the records).
- Each new module starts with a comment saying what belongs in it.

## Data

Nothing stored changes shape, and nothing is dropped: the linked folder root's stamp is the `size` and
`modified` a `folder` record holds today, so every stamp already stored stays good. Files in Volti's folder without a record
(left by a crash) are recorded at start-up rather than by the next listing.
