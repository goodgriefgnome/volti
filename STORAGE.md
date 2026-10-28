# What Volti stores

This is the format Volti's storage is meant to have. The code doesn't follow it yet:
`STORAGE-PLAN.md` says how to get there. Once it does, this file describes the code, and a change
to what is stored changes this file in the same commit.

Volti keeps two kinds of thing on the tablet:

- **Records**, in IndexedDB: small, structured, read and written often.
- **Bytes**, in the origin private file system (OPFS) or the linked scores folder: the scores' files
  themselves, and pages drawn by the page cache.

## Words

- **id**: the SHA-256 of a file's contents, in lower-case hex. Two files with the same bytes have
  the same id. A score's id is its original's id.
- **library path** (or just **path**): where a file is in the library, as the user sees it:
  `"Masses/Latin/Mass in G.pdf"`. Folders are separated by `/`, with no leading `/`. A path never
  says which file system holds the bytes. Each file system decides where it keeps the bytes for a
  path.
- **root**: where the library's files are. That's the linked folder while one is linked, and
  Volti's own folder in OPFS while none is.
- **place**: where an original's bytes are now. See `where` below.

## IndexedDB

One database, **`volti-scores`**, version 1, with one object store, **`kv`**. Keys are strings
given out of line, with no key path and no indexes. Values are stored by structured clone, so they
may hold things JSON can't, such as a `FileSystemDirectoryHandle`.

`src/storage/kv.ts` is the only code that talks to IndexedDB. `src/storage/keys.ts` lists every key
and the module that owns it.

The old database **`volti`**, from before scores, is deleted at start-up.

### Every key

| Key | Value | Owner |
| --- | --- | --- |
| `original:<id>` | `OriginalRecord` | `originals/` |
| `folder` | `FolderLink` | `originals/device-score-fs.ts` |
| `score:<id>` | `StoredScore` | `scores/store.ts` |
| `ink:<id>` | `ScoreInk` | `scores/store.ts` |
| `last-read` | `LastRead` | `reader/_store.ts` |
| `setlists` | `string[]`, setlist ids, newest first | `setlists/store.ts` |
| `setlist:<id>` | `Setlist` | `setlists/store.ts` |
| `last-added-to` | `string`, a setlist id | `setlists/store.ts` |
| `closed-folders` | `string[]`, library folder paths | `library/_store.ts` |

No other key is written. Keys from earlier versions (`folder-files`, `hashes`, `internal-ids`,
`titles`, `removed`, `inbox`, `pos:<id>`, `aspects:<id>`, `password:<id>`) are deleted at
start-up. What they held is not carried over.

### `original:<id>`: one per original Volti knows

```ts
interface OriginalRecord {
  /** The library path: where it is, or where it was or would go. Always set. */
  path: string;
  /** Where its bytes are now. */
  where: Where;
  /** Each page's height / width, in page order. Missing until the original is first read. */
  aspects?: number[];
  /** The password that opened it, for a PDF that needed one. */
  password?: string;
}

type Where =
  /** In the linked folder at `path`; the file's size and modified time when its id was worked out. */
  | { kind: 'folder'; size: number; modified: number }
  /** In Volti's own folder, at OPFS library/<path>. */
  | { kind: 'internal' }
  /** Shared to Volti and not added yet, at OPFS inbox/<id>; `path` is the name it would go at. */
  | { kind: 'inbox'; inboxAt: number }
  /** In Recently removed, at OPFS removed/<removedAt>-<id>; `path` is where it was. */
  | { kind: 'removed'; removedAt: number }
  /** Nowhere Volti can find: deleted outside Volti, or purged from Recently removed. */
  | { kind: 'gone' };
```

Times are milliseconds since 1970 (`Date.now()`).

What is fixed and what changes:

- **Fixed by the contents:** the id, `aspects` and `password`. Once set, they are right for as long
  as the record exists.
- **Changes:** `path` and `where`.

`path` stays set in every place, including `gone`, because it gives the title of a score whose
file is missing (`titleOf(path)`).

#### One place per original

An original is in exactly one place. When a copy turns up in a better place, the record moves
there and the bytes in the old place are deleted. Places rank, best first:

1. `folder`, but only while the folder is linked (`FolderLink.linked`)
2. `internal`
3. `inbox`
4. `removed`
5. `gone`, and `folder` while the folder is not linked

For example:

- A file in the linked folder with the same id as a file in Volti's own folder deletes the one in
  Volti's own folder.
- Sharing a PDF that is in Recently removed moves it to the inbox, and deletes the copy in
  Recently removed.
- Sharing a PDF the library already has (`folder` while linked, or `internal`) changes nothing,
  and the shared bytes are dropped.

#### Duplicates in the linked folder

Other apps can put the same bytes at two paths in the linked folder. Only one of them is the
original's: the **canonical** path, the one in the record. The others are hidden in the library and
not stored. Volti keeps them in memory, path → `{ id, size, modified }`, for as long as the app
runs, so they aren't hashed again in that session.

The canonical path is **sticky**. The record's path stays canonical while a file with that id is
still at it. Only when it isn't does another copy take over: the one whose path sorts first by
plain string comparison. A copy found for the first time is chosen the same way.

Volti never writes the same id into its own folder twice. If it finds duplicates there anyway, they
are treated the same way.

#### The hash cache

For a `folder` record, the stored `size` and `modified` let a listing trust the id without
reading the file: a file at the record's path with the same size and modified time has the
record's id. Anything else is hashed again. Files in Volti's own folder are trusted by path
alone, because only Volti changes them.

There is no separate path → id record. The app builds that map in memory from the
`original:` records whenever it lists the library.

### `folder`: the linked folder

```ts
interface FolderLink {
  handle: FileSystemDirectoryHandle;
  /** False once unlinked: the handle is kept only to tell whether a folder linked later is the same one. */
  linked: boolean;
}
```

Missing until a folder is first linked.

- **Linking** a folder that is the same as the stored handle (`handle.isSameEntry`) keeps every
  `folder` record, so nothing is hashed again.
- **Linking a different folder** turns every `folder` record into `gone` first.
- **Unlinking** sets `linked: false` and leaves the records alone. While unlinked, `folder`
  records rank with `gone`. They aren't listed and don't stop a copy elsewhere from taking over.
- **While the folder is linked but locked** (access not yet allowed this session), the library
  lists the `folder` records as they are.

### `score:<id>`

```ts
/** A Score as stored: the key gives its id. */
type StoredScore = Omit<Score, 'id'>;

interface Score {           // scores/model.ts, in memory
  id: string;               // not stored: taken from the key on loading
  key: string;              // the musical key; nothing sets it yet
  cuts: Cut[];              // the played order
  archived: Cut[];          // removed cuts that had their own ink
  names?: ExcerptName[];    // missing in scores saved before names
}
interface Cut { id: string; page: number; y0: number; y1: number; pad?: number; ownInk?: boolean }
interface ExcerptName { first?: string; last?: string; name: string }
```

`Score` has no `title`: a score's title is always its original's (`titleOf(record.path)`). Loading
ignores a `title` or `id` a stored score has from an earlier version.

### `ink:<id>`

```ts
type ScoreInk = Record<string /* cut id */, Marking[]>;
type Marking = Stroke;
interface Stroke {
  tool: 'pen' | 'highlighter';
  color: string;
  size: number;                                          // line width, as a fraction of the page width
  points: [x: number, y: number, pressure: number][];    // x, y as fractions of the page's width and height
}
```

A score and its ink are always written in one transaction, so they never disagree.

### `last-read`: where to pick up

```ts
type LastRead =
  /** An excerpt of score `id`: the span it plays (as Span). With neither end, the whole score. */
  | { kind: 'excerpt'; id: string; first?: string; last?: string; cut: string }
  | { kind: 'setlist'; id: string; entry: string; cut: string };
```

The one thing last read and where in it, as the first cut on the screen. Missing until something
is read.

A score's reader is an excerpt's reader with no span, so a whole score is an excerpt with neither
`first` nor `last`. An excerpt opened on its own from the library has
its span's ends, as they are when the key is written (they follow cut edits made while it is
read). A whole score and an excerpt of it are different things to resume, as are two excerpts.
They match only when `id`, `first` and `last` are all equal. A setlist entry playing an excerpt is
part of its setlist, not an excerpt here.

- **Opening the score, excerpt or setlist named here** resumes at `cut` (in `entry`, for a
  setlist). That includes after the app is closed and reopened.
- **Opening anything else** starts at its beginning, and this key then names it.
- **Turning from one score to the next** in a score's reader makes the new score the one named.
- **Playing part of a score** from its reader (which reads it as an excerpt) makes that excerpt
  the one named.
- **Tapping one entry** of a setlist in the library is the same as opening the setlist and moving
  to that entry's start. It starts there, whatever this key says, and this key then names the
  setlist at that entry.
- **If the cut or the entry can't be found** (edited away, or the setlist deleted), opening
  starts at the beginning. So does an excerpt whose ends have changed since (renaming it doesn't
  change them).

### `setlists` and `setlist:<id>`

```ts
interface Setlist { id: string; title: string; archived: boolean; entries: Entry[] }
interface Entry { id: string; scoreId: string; first?: string; last?: string }  // no first or last: the whole score
```

Setlist and entry ids are random UUIDs. `setlists` gives the order. A `setlist:<id>` that it
doesn't list is ignored.

### `last-added-to` and `closed-folders`

`last-added-to` is the id of the setlist scores were last added to, offered first when adding
again. If the id names no setlist, it is ignored.

`closed-folders` lists the library folders the user closed by hand. A path that no longer exists
is ignored.

## OPFS

| Directory | Holds | Owner |
| --- | --- | --- |
| `library/` | Volti's own folder: the root while no folder is linked. A file at library path `p` is at `library/p`. | `originals/internal-score-fs.ts` |
| `inbox/` | Files shared to Volti, one per id, named by the id. | `originals/inbox-fs.ts` |
| `removed/` | Recently removed, named `<removedAt>-<id>`. | `originals/trash-fs.ts` |
| the page cache's directories | Drawn pages | `page-cache/` (not covered here) |

Each file in `library/`, `inbox/` and `removed/` belongs to the `original:` record pointing at it.

## Writing safely

Two contexts write: the page, and the service worker (sharing). So:

- **Records are only changed by read-modify-write in one transaction** (`kv.update`, or
  `kv.updateMany` for several). The record is read inside the transaction, never from a copy read
  earlier. A listing that took a minute to hash must not overwrite a record the service worker
  wrote meanwhile.
- **Bytes are written before the record that points to them, and deleted after the record stops
  pointing to them.** A crash then leaves at worst a file no record points to, never a record
  pointing at nothing.
- **At start-up**, files in `inbox/` and `removed/` that no record points to are deleted, if they
  were last modified more than ten minutes ago. That leaves alone a share the service worker is
  writing at that moment.

## What happens, by operation

| Operation | Records | Bytes |
| --- | --- | --- |
| **Listing a readable linked folder** | Each id found: `folder` at its canonical path, with its size and modified time; any lower place gives way. Each `folder` record whose id wasn't found: `gone`. | Lower places' bytes deleted. |
| **Listing while locked** | None changed. The library is the `folder` records. | |
| **Listing Volti's own folder** | Each id found that ranks above its record: `internal`, and lower places give way. A file whose id has a better place is dropped. Each `internal` record whose id wasn't found: `gone`. | Lower places' bytes deleted, and dropped files deleted. |
| **Adding a file** (Add PDFs, a share, putting back, moving one left in Volti's folder) | `folder` or `internal` at the chosen path. | Written into the root, then the old place's bytes deleted. |
| **Renaming or moving a file** | `path` (and `size`, `modified` if the file was copied rather than moved). | Moved in the root. |
| **Removing a file** | `removed`, with `removedAt` now; `path` unchanged. | Copied to `removed/`, then deleted from the root. |
| **Sharing a file** (service worker) | No record, `removed` or `gone`: `inbox` at `_importName(name)`, with `inboxAt` now. A better place already: unchanged. | Written to `inbox/<id>` first; a `removed` copy deleted. A file with a better place is dropped. |
| **Leaving a shared file out**, or cancelling | `removed`, with `removedAt` now. | Moved from `inbox/` to `removed/`. |
| **Purging** (at start-up) | `removed` for 7 days or more: `gone`. | Deleted. |
| **Reading an original** | `aspects`, and `password` if one opened it. | |

Files picked with Add PDFs aren't stored until they're added. Leaving one out just forgets it.

Reading a file that has no record yet (one being previewed before it's added) keeps its aspects
and password in memory. They're written when its record is made.
