# What Volti stores

This is the format Volti's storage has. A change to what is stored changes this file in the same commit.

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

The **version of the stored data** is kept under `data-version` (none stored is version 1). At
start-up, before anything else reads the store, `src/stored-data.ts` runs each step from the stored
version up to the app's, raising the stored version after each; the library opens only once they
are done. Data from a newer version than the app's is not opened.

- **Version 1 to 2:** ink went from being kept by cut to being kept by page of the original, and
  archived cuts went. Each score's markings, archived cuts' included, went on their cut's page with
  no pass; exact duplicates on a page were kept once; ink under a cut id no cut had, archived cuts
  and `ownInk` were dropped (`scoresToVersion2` in `scores/store.ts`).
- **Version 2 to 3:** what earlier versions left went: the old database **`volti`**, from before
  scores; the keys `folder-files`, `hashes`, `internal-ids`, `titles`, `removed`, `inbox`,
  `pos:<id>`, `aspects:<id>` and `password:<id>`, whose contents were not carried over; a score's
  `id`, `title` and `names` (the named excerpts before `excerpts`, not carried over); and a bare
  handle under `folder`, from before records, which became `{ handle, linked: true }`
  (`toVersion3` in `stored-data.ts`).
- **Version 3 to 4:** the link under `folder` gained `kind` (a folder in Google Drive can be linked
  too), so the stored link was dropped (`toVersion4` in `stored-data.ts`). The folder is linked
  again once; as it isn't known to be the same, its `folder` records turn `gone` and its files are
  read again to find their ids. Scores, cuts and markings are kept, by id.
- **Version 4 to 5:** face gestures became the person's own, each with its trials, so the eight
  built-in gestures' settings under `face-gestures` (their directions, levels and holds) were
  dropped (`toVersion5` in `stored-data.ts`). Face gestures are off until one is added and recorded.

### Every key

| Key | Value | Owner |
| --- | --- | --- |
| `original:<id>` | `OriginalRecord` | `originals/` |
| `folder` | `FolderLink`, a folder on the device or in Google Drive | `originals/_folder-link.ts` |
| `drive-auth` | `{ refreshToken: string }`, the Google Drive sign-in; missing when signed out | `originals/drive/_auth.ts` |
| `data-version` | `number`, the version of the stored data; 1 when missing | `stored-data.ts` |
| `score:<id>` | `StoredScore` | `scores/store.ts` |
| `ink:<id>` | `ScoreInk` | `scores/store.ts` |
| `glyph:<font id>:<gid>` | `string`, a glyph's outline | `markings/store.ts` |
| `symbols` | `SymbolLibrary` | `markings/store.ts` |
| `placed-mark-colors` | `{ color?: string; background?: string }`, the default colours | `markings/store.ts` |
| `tool-settings` | `ToolSettings`, each tool's settings for new markings | `markings/store.ts` |
| `face-gestures` | `FaceSettings`, the face gestures the person defined, each with its fit | `face/store.ts` |
| `face-trials:<id>` | `Trial[]`, a face gesture's trials | `face/store.ts` |
| `last-read` | `LastRead` | `reader/_store.ts` |
| `setlists` | `string[]`, setlist ids, newest first | `setlists/store.ts` |
| `setlist:<id>` | `Setlist` | `setlists/store.ts` |
| `last-added-to` | `string`, a setlist id | `setlists/store.ts` |
| `closed-folders` | `string[]`, library folder paths | `library/_store.ts` |

No other key is written.

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
  /**
   * In the linked folder at `path`, with its root's stamp: what the root notes about a file to tell
   * later whether it has changed, without reading it. A flat set of fields that never has one
   * called `kind`. The linked folder's is `size` and `modified`: the file's size and modified time
   * when its id was worked out.
   */
  | ({ kind: 'folder' } & Readonly<Record<string, string | number>>)
  /** In Volti's own folder, at OPFS library/<path>. */
  | { kind: 'internal' }
  /** Shared to Volti and not added yet, at OPFS inbox/<id>; `path` is the name it would go at. */
  | { kind: 'inbox'; inboxAt: number }
  /** In Recently removed, at OPFS removed/<removedAt>-<id>; `path` is where it was. */
  | { kind: 'removed'; removedAt: number }
  /** In a root's own bin (Drive's bin), removed at `removedAt`; Volti keeps no bytes. `binned` is what that root needs to take it out again (Drive: `fileId`, `parent`, `folderId`). `path` is where it was. */
  | { kind: 'binned'; removedAt: number; binned: Readonly<Record<string, string | number>> }
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
4. `removed`, and `binned` (as good)
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
not stored. The linked folder's root (`LinkedDirectoryHandleRoot`) keeps them in memory, path →
`{ id, stamp }`, for as long as it lives, so they aren't hashed again; linking a folder makes a new
root, so one folder's copies are never trusted in another.

The canonical path is **sticky**. The record's path stays canonical while a file with that id is
still at it. Only when it isn't does another copy take over: the one whose path sorts first by
plain string comparison. An id that is new in a scan goes to the first of its copies to be hashed,
and stays there by the same stickiness. The rules are `_placeOf` in `_folder-scan.ts`.

Volti never writes the same id into its own folder twice. If it finds duplicates there anyway, they
are treated the same way.

#### The hash cache

A scan of the linked folder (the linked folder root's `getUpdates`) goes by names first: a file at
a `folder` record's path, or at a hidden copy's, is trusted to have that id and stamp without
reading it, and only the other names are hashed, eight at a time. Each is said, and its record
written, as it is hashed. A pass in the background follows, getting the trusted files one at a
time and hashing one whose stamp differs from the one trusted (`size` and `modified`) or that has
none; so a file changed in place is noticed a little after the library shows. A scan cut short
keeps what it hashed: those files are in the records already. Volti's own folder isn't scanned:
only Volti changes what is in it, and every write records the file's id with it.

There is no separate path → id record. The scan is given the map in memory, built from the
`original:` records.

### `folder`: the linked folder

```ts
type FolderLink =
  | { kind: 'device'; handle: FileSystemDirectoryHandle; linked: boolean }
  | { kind: 'drive'; folderId: string; name: string; linked: boolean };
```

`linked` is false once unlinked: the link is kept only to tell whether a folder linked later is the
same one. Missing until a folder is first linked. `folder` records mean "in the linked folder",
on the device or in Google Drive.

- **Linking** a folder that is the same as the stored one (`handle.isSameEntry`; the same
  `folderId`) keeps every `folder` record, so nothing is hashed again.
- **Linking a different folder**, or one of the other kind, turns every `folder` record into
  `gone` first. Linking a device folder after a Drive one signs out of Google and empties `bytes/`.
- **Unlinking** sets `linked: false` and leaves the records alone. While unlinked, `folder`
  records rank with `gone`. They aren't listed and don't stop a copy elsewhere from taking over.
- **While the folder is linked but locked** (access not yet allowed this session), the library
  lists the `folder` records as they are.

### `drive-auth`: the Google Drive sign-in

`{ refreshToken: string }`, kept while Volti is signed in to Google (`originals/drive/_auth.ts`).
The access token is held in memory only. Google refusing the refresh token (`invalid_grant`) deletes
it, and the folder shows as locked until the user signs in again. Unlinking a Drive folder revokes
the token and deletes the key.

### `score:<id>`

```ts
/** A Score as stored: the key gives its id. */
type StoredScore = Omit<Score, 'id'>;

interface Score {           // scores/model.ts, in memory
  id: string;               // not stored: taken from the key on loading
  key: string;              // the musical key; nothing sets it yet
  cuts: Cut[];              // the played order
  excerpts?: NamedExcerpt[]; // the score's named excerpts; missing until one is named
  symbolSize?: number;       // the size a symbol of scale 1 is placed at, in page widths; 0.035 until set
  textScale?: number;        // text's size relative to the symbol size: the one the last text resize implied; 0.6 until set
}
interface Cut { id: string; page: number; y0: number; y1: number; pad?: number; pass?: number /* from 1; none is pass 1 */ }
interface NamedExcerpt { first?: string; last?: string; name: string }
```

`Score` has no `title`: a score's title is always its original's (`titleOf(record.path)`).

### `ink:<id>`

```ts
type ScoreInk = Record<number /* original page, 0-based */, Marking[]>;
type Marking = Stroke | PlacedMarking;
interface Stroke {
  tool: 'pen' | 'highlighter';
  color: string;
  size: number;                                          // line width, as a fraction of the page width
  points: [x: number, y: number, pressure: number][];    // x, y as fractions of the page's width and height
  pass?: number;                                         // the one pass of its page it belongs to; every pass when missing
}
/** A symbol or text: glyphs placed whole at a point. A stroke has no `kind`. */
interface PlacedMarking {
  kind: 'symbol' | 'text';
  text: string;                                          // a symbol's characters, as placed from the library; a text marking's, what was typed
  font: string;                                          // the font's id
  glyphs: [gid: number, x: number, y: number][];         // each glyph's index, and its origin in em from the centre of the extent, y downwards
  at: [x: number, y: number];                            // the centre of its extent, as fractions of the page's width and height
  size: number;                                          // its em size, in page widths
  color?: string;                                        // the default colour when missing
  background?: Background;                               // none when missing
  pass?: number;                                         // the one pass of its page it belongs to; every pass when missing
}
interface Background {
  shape: 'box' | 'tag-left' | 'tag-right';
  color?: string;                                        // the default background colour when missing
}
```

A cut shows a marking of its page whose anchor (a placed marking's centre, a stroke's first point)
lies within it, ends included, and that has no pass or the cut's. A marking no cut shows is kept.

A score and its ink are always written in one transaction, so they never disagree. The glyphs a
marking names are in `glyph:` records, written before the marking that first uses them.

### `glyph:<font id>:<gid>`: one outline

A `string`: the glyph's outline as SVG path data, absolute `M`, `L`, `C` and `Z` only, in em
units, y downwards, from the glyph's origin. A font's id is the first 8 hex digits of the SHA-256
of its file, so a glyph never changes under its key. Never changed once written, and not yet
collected when no longer used. Opening a score loads the glyphs its ink uses into the glyph
table (`markings/glyphs.ts`), so drawing stays synchronous.

### `symbols`: the symbol library

```ts
interface SymbolLibrary {
  groups: SymbolGroup[];     // in their order on the toolbar
  adhoc: LibrarySymbol[];    // placed ad hoc, newest first, at most 8; cycles as a group
}
interface SymbolGroup { symbols: LibrarySymbol[] }
interface LibrarySymbol {
  font: string;              // the font's id
  text: string;              // its characters, Private Use Area included
  scale: number;             // its size relative to the score's symbol size
  background?: Background;   // a template: a marking placed as it gets a copy; none when missing
  glyphs: [gid: number, x: number, y: number][];  // as shaped when it was defined
}
```

One for the app, made from the starter (fingerings 1 to 5, and *pp* to *ff*, all Bravura at scale
1) the first time it is needed. A symbol is known by its font and characters, which are unique in
the library. Its glyphs are in `glyph:` records, written before the library.

### `placed-mark-colors`: the default colours

`{ color?: string; background?: string }`: the colour of placed markings, and of their backgrounds,
that have none of their own. A missing one is the built-in colour (`#1c1f26`, and `#cce0ff`); only
colours that differ from the built-in ones are stored.

### `face-gestures`: the face gestures the person defined

```ts
interface FaceSettings { gestures: Gesture[] }   // face/gestures.ts, in the order they were added
interface Gesture {
  id: string; name: string;
  direction: 'next' | 'prev' | 'none';
  hold: number;                                  // ms, 100 to 1500
  on?: number; release?: number;                 // the levels moved by hand, 0.05 to 0.95; none is the fit's
  note?: string;                                 // why it was set to none, in words
  fit: Fit;
}
interface Fit {                                  // face/_fit.ts: what its trials gave
  version: number;                               // FIT_VERSION when it was fitted
  trials: number;                                // how many it was fitted from
  flags: Flag[];                                 // tooFew, noChannels, unreliable, firesAtRest { frames, ms }
  template?: Template;                           // face/_template.ts; with it, the gesture is fitted:
  on?: number; release?: number;                 //   its fitted levels,
  rest?: number; peaks?: number[];               //   its rest level and each rep's peak
  missed?: Row[];                                // with no template: the clearest channels
}
```

It is the device's own, like `tool-settings`. Missing is no gestures; so is the eight built-in
gestures' shape of before version 5. A gesture without an id, a name or a fit is dropped when
read, and values out of range are clamped. The reader reads only this key: a fit has all that
turning needs. When a gesture was fitted by an earlier `FIT_VERSION`, every gesture is fitted again
from its trials when the settings are next loaded (levels moved by hand are dropped), the conflicts
are checked again, and the result is saved.

### `face-trials:<gesture id>`: a face gesture's trials

A `Trial[]` (`face/_recording.ts`), read by the Face gestures dialog and when fitting again, never
by the reader. A trial is `{ tUp, tDown, n, data }`: the times of its third rising and falling tones
(ms from its start), and `n` frames in a `Float32Array`, each `STRIDE` (55) floats: its time in ms
from the trial's start, the 52 scores in the template's channel order (`CHANNELS` in
`face/_template.ts`), and the head's yaw and pitch in degrees. Some 33 kB a trial. Deleted with the
gesture, and when its trials are cleared.

### `last-read`: where to pick up

```ts
type LastRead =
  /** An excerpt of score `id`: the excerpt it plays. With neither end, the whole score. */
  | { kind: 'excerpt'; id: string; first?: string; last?: string; cut: string }
  | { kind: 'setlist'; id: string; entry: string; cut: string };
```

The one thing last read and where in it, as the first cut on the screen. Missing until something
is read.

A score's reader is an excerpt's reader with no ends, so a whole score is an excerpt with neither
`first` nor `last`. An excerpt opened on its own from the library has
its ends, as they are when the key is written (they follow cut edits made while it is
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
| `library/` | Volti's own folder: the root while no folder is linked. A file at library path `p` is at `library/p`. | `originals/handles/internal-score-fs.ts` |
| `inbox/` | Files shared to Volti, one per id, named by the id. | `originals/inbox-fs.ts` |
| `removed/` | Recently removed, named `<removedAt>-<id>`. | `originals/removed-fs.ts` |
| `bytes/` | Copies of the files of a Google Drive folder, named by id, with an index `bytes/index.json` (`{ [id]: { size, used, pinned } }`). Kept within a quarter of the storage quota, least recently used out first; those of setlists' scores are pinned. Emptied when the folder is unlinked. Belongs to no record: Drive's own checksums are the ids. | `originals/drive/_byte-cache.ts` |
| the page cache's directories | Drawn pages | `page-cache/` (not covered here) |

Each file in `library/`, `inbox/` and `removed/` belongs to the `original:` record pointing at it.

## Writing safely

Two contexts write: the page, and the service worker (sharing). So:

- **Records are only changed by read-modify-write in one transaction** (`kv.update`, or
  `kv.updateMany` for several). The record is read inside the transaction, never from a copy read
  earlier. A scan that took a minute to hash must not overwrite a record the service worker
  wrote meanwhile.
- **Bytes are written before the record that points to them, and deleted after the record stops
  pointing to them.** A crash then leaves at worst a file no record points to, never a record
  pointing at nothing.
- **At start-up**, files in `inbox/` and `removed/` that no record points to are deleted, if they
  were last modified more than ten minutes ago. That leaves alone a share the service worker is
  writing at that moment. Files in `library/` that no `internal` record points to, and that old,
  are recorded: hashed, at their paths, as `internal`, unless their id has a better place, when the
  file is deleted (a crash between writing the file and its record is the only way to get one).

## What happens, by operation

| Operation | Records | Bytes |
| --- | --- | --- |
| **Scanning the linked folder** | Written as each change is found (`_applyUpdate`): an id at a place with no record: `folder` there, with its stamp. A record in a lower place: `folder` there, and the lower place gives way. A `folder` record: its path and stamp become those found. An id gone from the folder (once every new file is hashed): its `folder` record becomes `gone`. | Lower places' bytes deleted. |
| **Scanning a Google Drive folder** | As for the linked folder, but the files are listed with Drive's SHA-256 checksums, so nothing is downloaded or hashed, and no stamps are kept: a file changed in Drive has a new checksum, so a new id at its path. The whole tree is listed first, then the files at known paths are seen, then the rest, then the ids gone. | None. |
| **Linking a Google Drive folder** | Another folder than the last: every `folder` record becomes `gone` first. Then `folder` records come from the first scan, by checksum. | Sign-in: the refresh token under `drive-auth`. |
| **Reading a file of a Drive folder** | None. | Downloaded once into `bytes/<id>` (the hash of the bytes), then read from there, online or not. |
| **Unlinking a Google Drive folder** | As for any folder. | The refresh token is revoked and deleted, and `bytes/` is emptied. |
| **Locked folder** | None changed. The library is the `folder` records. | |
| **Adding a file** (Add PDFs, a share, putting back, moving one left in Volti's folder) | `folder` or `internal` at the picked path. | Written into the root, then the old place's bytes deleted. |
| **Renaming or moving a file** | `path` and the root's stamp. | Moved in the root. |
| **Removing a file** | In a device folder or Volti's own: `removed`, with `removedAt` now; `path` unchanged. In a Drive folder: `binned`, with `removedAt` now and the Drive file's id, its folder and the linked folder's id. | Device: copied to `removed/`, then deleted from the root. Volti's own: moved to `removed/`. Drive: the file goes to Drive's bin; nothing is downloaded or written. |
| **Putting a file back** | `folder` or `internal` at the path picked. | A `removed` copy is written into the root, as for adding a file, then deleted. A `binned` file is taken out of Drive's bin and moved to the path in one request, by the root that has its bin (the linked Drive folder, only if it is the one it was removed from). |
| **Sharing a file** (service worker) | No record, `removed` or `gone`: `inbox` at `_importName(name)`, with `inboxAt` now. A better place already: unchanged. | Written to `inbox/<id>` first; a `removed` copy deleted. A file with a better place is dropped. |
| **Leaving a shared file out**, or cancelling | `removed`, with `removedAt` now. | Moved from `inbox/` to `removed/`. |
| **Purging** (at start-up) | `removed` or `binned` for 7 days or more: `gone`. | A `removed` copy is deleted. A `binned` file is left to Drive, which empties its bin itself. |
| **Reading an original** | `aspects`, and `password` if one opened it. | |

Files picked with Add PDFs aren't stored until they're added. Leaving one out just forgets it.

Reading a file that has no record yet (one being previewed before it's added) keeps its aspects
and password in memory. They're written when its record is made.
