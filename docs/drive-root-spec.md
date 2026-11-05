# A Google Drive folder as the scores folder: spec

What Volti is once a folder in Google Drive can be linked as the scores folder, reached through the
Drive API rather than a folder picked on the device: signing in, linking, the Drive root (a third
`ScoreRoot`), keeping its files on the tablet, and what the user sees. Linking a folder on the
device stays as it is.

## Why

A Drive folder picked with Android's folder picker works, offline too, as Drive's own app keeps
the files. But a scan's pass 2 calls `getFile()` on every known file, and Drive's provider
downloads a file to answer that, so every scan downloads the whole folder. The File System Access
API has no way to learn a file's size or date without `getFile()`. And the folder asks for access
again every session ("Allow access"). On desktop Chrome and iPads there is no Drive in the picker
at all.

The Drive API gives each file's SHA-256 (`sha256Checksum`) with a listing, without downloading
anything; it is the SHA-256 Volti uses for ids, so a Drive folder's scores keep their ids, their
markings and their setlists. And a refresh token keeps Volti signed in between sessions.

What a test page found (`public/drive-test.html`, since removed: it is in the history), which
this spec builds on:

- Google's token endpoint needs the client secret, with PKCE or without. A browser app has nowhere
  to hide one, so it ships in Volti's built code (but not in the repository: see "Signing in").
- Refresh tokens work from the browser.
- With `drive.file`, a folder picked in the Google Picker can't be listed: its files aren't the
  app's. With `drive.readonly`, it can. Volti also renames, moves, removes and writes files, so it
  needs the full `drive` scope. That scope is restricted: Google verifies an app that uses it only
  after a yearly security assessment. So the OAuth app is in production but unverified. Anyone can
  sign in, past a "Google hasn't verified this app" warning, up to 100 users in all. Its refresh
  tokens don't expire after 7 days, as they do while an app is in Testing (to confirm: see
  "Open").
- Drive's `sha256Checksum` is the SHA-256 of the bytes.

## What changes for the user

- **Link scores folder** offers two places: "A folder on this tablet" (as now) and "A folder in
  Google Drive". Where the browser can't pick a folder on the device (`canLinkFolder()` false:
  iPads, Firefox), it goes straight to Google Drive.
- **Linking a Drive folder:** signing in to Google (Google's own page, then back to Volti; the
  first time, past Google's "Google hasn't verified this app" warning, under Advanced), then
  choosing the folder in Volti's own folder chooser: My Drive's folders, opening one to see its
  folders, and "Use this folder".
- **Signing in again**, only when Google stops taking the refresh token: access removed from the
  Google Account, the password changed, or about six months unused. The folder then shows as
  locked, and the banner's button is "Sign in to Google Drive" where it is "Allow access" for a
  folder on the device. Signing in leaves Volti for Google's page and comes back to the library.
- **Scans download nothing.** A scan lists the folder's tree, a request or two per folder; no
  "Reading new scores" count, as every file comes with its id.
- **Scores open from the tablet's copy** once read once, online or not, signed in or not. Those of
  setlists are kept on the tablet for good, as their pages are now. A score never read can't be
  opened offline: its saved pages show, as for a locked folder now.
- **Removing a score** moves its file to Drive's trash too, as well as keeping it in Recently
  removed.
- Everything else is as with a folder on the device: renaming, moving, adding, Recently removed,
  exports into `Exports`, the files left in Volti's folder moved in on linking.

## Signing in

`originals/_drive-auth.ts`: the OAuth authorization code flow with PKCE (S256), as the test page
does it.

- **The client** is a Google Cloud OAuth client of type Web application. Its client ID and secret
  aren't in the repository: they come in at build time, as `VITE_DRIVE_CLIENT_ID` and
  `VITE_DRIVE_CLIENT_SECRET`, and Vite writes them into the built code.
  `originals/_drive-config.ts` reads them:

  ```ts
  export const clientId: string = import.meta.env.VITE_DRIVE_CLIENT_ID ?? '';
  export const clientSecret: string = import.meta.env.VITE_DRIVE_CLIENT_SECRET ?? '';
  ```

  (the two typed in a new `src/types/drive-env.d.ts`, extending Vite's `ImportMetaEnv`, beside
  `version.d.ts`). With no client ID,
  Drive isn't offered, so a build without them (a fork, a test run) is Volti without Drive.
- **Where they come from:** the deploy workflow (`.github/workflows/deploy.yml`) passes them to its
  `npm run build` step from the repository's Actions secrets `DRIVE_CLIENT_ID` and
  `DRIVE_CLIENT_SECRET`:

  ```yaml
      - run: npm run build
        env:
          VITE_DRIVE_CLIENT_ID: ${{ secrets.DRIVE_CLIENT_ID }}
          VITE_DRIVE_CLIENT_SECRET: ${{ secrets.DRIVE_CLIENT_SECRET }}
  ```

  On a development machine they go in `.env.local`, which Vite reads; `.gitignore` gains
  `.env*.local` so it is never committed. The tests don't need them: they stand in for Google.
- **The redirect URI** is Volti's own URL (`https://goodgriefgnome.github.io/volti/`). Signing in
  navigates there with `?code=…&state=…`; at start-up, before the library is made, `main.ts` hands
  those to `_drive-auth.ts`, which exchanges the code, stores the refresh token, and takes them off
  the address (`history.replaceState`). What the app was doing when it left for Google's page is in
  `sessionStorage`: linking (then the folder chooser opens) or signing in again (then the library
  scans).
- **The scope** is `https://www.googleapis.com/auth/drive`, with `access_type=offline` and
  `prompt=consent`, so a refresh token comes back each time.
- **The refresh token** is stored under a new kv key, `drive-auth`: `{ refreshToken: string }`. The
  access token is held in memory only, refreshed when it has under a minute left.
- **Signed out** is when there is no refresh token, or Google refuses it (`invalid_grant`: expired
  or revoked). The refresh token is then deleted, and the root is `locked`.
- **Offline** is when the token request can't be made. The root stays `ready`; only what needs the
  network fails (below).
- **Unlinking** revokes the refresh token with Google and deletes `drive-auth`.

Signing in only ever happens from a tap in the library: the Drive banner button, or linking. The
reader never leaves for Google's page; a score that needs Drive and can't have it shows its saved
pages, as for a locked folder now.

## The link

The kv key `folder` keeps the linked folder, of either kind:

```ts
/** What is stored under `folder`: the linked folder, kept after unlinking to tell whether one linked later is the same. */
type FolderLink =
  | { kind: 'device'; handle: FileSystemDirectoryHandle; linked: boolean }
  | { kind: 'drive'; folderId: string; name: string; linked: boolean };
```

As now, unlinking keeps it with `linked: false`, and linking the same folder again keeps every
`folder` record (the same handle by `isSameEntry`; the same `folderId`). Linking a folder of the
other kind writes over the last one of the first kind; its records are `gone` by then anyway
(below), so nothing is lost by forgetting it.

A new `linked-folder.ts` owns the key, and the functions the library calls: `folderState`,
`unlockFolder`, `unlinkFolder`, the root `_linkedRoot()`, and the turning of `folder` records into
`gone` when another folder is linked (`linkFolder` does that now, `device-score-fs.ts:72-77`).
Each asks the kind stored and goes to the module for it:

- `device-score-fs.ts`, the device folder: `linkFolder` (the picker), unlocking by asking
  permission, and its root, as now, but no longer reading or writing the key itself.
- A new `drive-score-fs.ts`, the Drive folder: linking a chosen folder, unlocking by signing in,
  and its root (`DriveRoot`, below).

`FolderState` gains where the folder is:

```ts
export type FolderState =
  | { kind: 'none' }
  | { kind: 'ready'; name: string; place: 'device' | 'drive' }
  | { kind: 'locked'; name: string; place: 'device' | 'drive' };
```

and `unlockFolder()` for Drive starts signing in (it leaves the page).

Records: a Drive folder's files are `folder` records, as a device folder's are: `folder` means
"in the linked folder", wherever it is. Linking another folder than the one linked before (another
`folderId`, or a device folder after a Drive one, or the other way) turns every `folder` record
into `gone` first, as linking another device folder does now; the first scan then finds the same
ids in the new folder by their checksums, with nothing downloaded.

`_isLinked()` (the service worker's) reads the same key, so it covers both kinds.


## The folder chooser

`dialogs/drive-folders.ts`: a dialog listing the folders in a Drive folder, starting at My Drive,
by name; tapping one opens it; a path of the folders above to go back; "Use this folder"; Cancel.
It lists through the Drive API (`files.list`, folders only, not trashed). No Google Picker: Volti
loads no script from Google.

## `DriveRoot`

`originals/_drive-root.ts`, a `ScoreRoot` over a Drive folder by id, with its access from
`_drive-auth.ts`. Paths are library paths, as for any root: names of folders and the file under
the linked folder.

What it keeps in memory, from its last listing and kept up to date by its own writes: each path's
Drive file id, and each folder path's Drive folder id.

- **`access()`**: `ready` with a refresh token, `locked` without (never asks).
- **`needAccess(mode)`**: throws `NoAccess` when signed out; it never signs in (that leaves the
  page). Both modes are the same: the scope allows both.
- **`getUpdates(known, signal)`**: lists the folder's tree, four folders deep as on the device,
  only PDFs and images by name (`_isOriginalName`), one request per folder (more for over 1000
  entries), not trashed. Each file is seen with its id from `sha256Checksum`, through the same
  `_FolderScan` the device folder uses: its duplicate rules and its canonical paths, with the
  hidden copies kept in this root's memory. Then `finish()`: ids not found are gone. Batches as
  the listing goes, folder by folder; `left` is always 0. No stamps: a file changed in Drive has
  a new checksum, so a new id at its path.
- **`read(path)`**: the file's bytes, from the byte cache (below) by its id when there, else
  downloaded (`files.get` with `alt=media`) and put in the cache. Offline and not in the cache:
  throws `Unreachable`.
- **`exists(path)`**: asks Drive (a file of that name in that folder, not trashed); Drive names
  are case-sensitive.
- **`write(path, data)`**: makes the folders on the path that aren't there; uploads the file, as a
  new file or over the one at the path; puts the bytes in the cache. No stamp.
- **`move(from, to)`**: one `files.update`, changing the name and the parent folder (made if
  needed). Never `caseOnly` or `leftBehind`.
- **`remove(path)`**: moves the file to Drive's trash (`trashed: true`).

Names Drive allows that paths can't hold:

- **A name with a `/`** in it, file or folder, is left out of the listing.
- **Two files at one path** (Drive allows two files of one name in a folder): the one Drive made
  first is at the path; the others are left out, as if not there.
- **Two folders of one name** in a folder: their files are listed under the one path, so each is
  read and changed through it; two files of one name across them are as above.

A Drive request that fails for want of a network throws `Unreachable`; one Google refuses for the
token (401 after a refresh) signs out and throws `NoAccess`; any other failure throws as it is.

## The byte cache

`originals/_byte-cache.ts`: copies of originals' bytes in OPFS, `bytes/<id>`, with an index
(`bytes/index.json`: each id's size, when last used, and whether it is pinned). Only the Drive root
uses it: a folder on the device has its files on the device (Drive's provider keeps its own copies
for a Drive folder picked on Android).

```ts
/** The bytes kept for `id`, if any; noted as used. */
export function _cachedBytes(id: string): Promise<File | undefined>;
/** Keep `bytes` as `id`'s, then keep the cache within its budget. */
export function _cacheBytes(id: string, bytes: Blob): Promise<void>;
/** Keep exactly these ids' bytes for good (never evicted), and let go of the others pinned before. */
export function _pinBytes(ids: readonly string[]): Promise<void>;
/** How much room the bytes kept take, for the storage screen. */
export function cachedBytesSize(): Promise<number>;
```

- **Budget:** 25% of the origin's quota (`navigator.storage.estimate()`); none when the browser
  won't say. Unpinned bytes go least recently used first; pinned ones never.
- **Pinned:** the originals of the setlists' scores (not archived), by the offline job
  (`library/_offline-pages.ts`), each time it runs, beside the pages it pins. Its reading of those
  originals is what fills the cache.
- **Ids are hashes,** so a copy is never out of date: a file changed in Drive is another id.
- Anything that goes wrong with the cache means the bytes aren't kept, never that a file can't be
  read.
- **The storage screen** (`library/_storage.ts`) shows the bytes kept as their own part,
  "Scores kept from Google Drive".
- **Unlinking** a Drive folder empties the cache.

## Reading what can't be read now

A new error in `types.ts`, `Unreachable`: the file is in the linked folder, but the folder can't be
reached now (no network). `openPages` (`reader/_open-scores.ts:49`) falls back to the saved pages
on it, as on `NoAccess`. The offline job counts such a score as `blocked` with a new reason,
`offline`, shown as "Not on this tablet yet: connect to keep it".

`SourceFile.canReadNow()` for a Drive file is true when its bytes are cached, or when signed in.
That lets a cached score open with the folder locked, and the reader's tap for access (for a
device folder) isn't asked for it. For a device folder it is as now.

## Scanning

As for a device folder: on opening, on coming back after a while, Check for new scores, linking,
signing in. A scan while offline fails as a device folder's listing fails when it can't be read,
with the library showing the records; its message for Drive is "Could not reach Google Drive. The
scores kept on this tablet still open."

## Behaviour to keep exactly

- A device folder, linked or not, works as now, its scans and access included.
- Records are written only over a record unchanged since the scan read it.
- A score's id is the SHA-256 of its contents, whichever folder it is in.

## Tests

- `_drive-auth.ts`'s pure parts: the authorization URL (PKCE challenge from the verifier, state,
  scope, offline access, consent), and reading the token response; with `fetch` stubbed, the
  exchange, a refresh, and `invalid_grant` signing out.
- `DriveRoot`, against an in-memory stand-in for the Drive API (`fetch` stubbed): the listing
  (four deep, PDFs and images only, trashed left out, a `/` in a name left out, two files at one
  path, two folders of one name, paging), `getUpdates` over it (new, moved, gone, duplicates),
  `read` (cached, downloaded and cached, offline `Unreachable`), `exists`, `write` (new folders,
  new file, over a file), `move`, `remove` (trashed), a 401 signing out.
- `_byte-cache.ts`, with OPFS stood in: kept and read back, least recently used evicted over
  budget, pinned never evicted, unpinned when no longer pinned.
- The existing tests keep passing.

## Docs

- `STORAGE.md`: `folder` holding either kind; the key `drive-auth`; `folder` records meaning the
  linked folder, on the device or in Drive; OPFS `bytes/`; "What happens, by operation" for linking a Drive
  folder and for its scans.
- `ARCHITECTURE.md`: the `originals/` row (the new files, in order), and the folder chooser in
  `dialogs/`.
- `README.md`: linking a Google Drive folder (and Google's unverified-app warning); under
  Development, the two Actions secrets the deployed build needs and `.env.local` for a local one.
- Each new module starts with a comment saying what belongs in it.

## Data

`folder` changes shape (it gains `kind`), so the link stored now is dropped: `DATA_VERSION` goes
to 4, and the step from 3 deletes the key. The folder is then linked again once; as it isn't known
to be the same, its records turn `gone` and its files are read again to find their ids (for a
folder from Drive's Android app, downloading each once). Scores, cuts and markings are kept, by
id. `drive-auth` is a new key, and OPFS `bytes/` a new directory.

## Open

- **That refresh tokens last** now that the app is in production: the test page, signed in again
  after the switch, should still refresh after more than 7 days. Tokens issued while the app was
  in Testing still expire after 7 days. If Google expires them anyway, signing in is weekly, and
  nothing else changes.
- **The 100-user cap** of an unverified app counts every account that ever signs in. Sharing Volti
  beyond that needs verification and its yearly assessment, or a design around `drive.file`, which
  can't see files a user adds to the folder outside Volti.
- **The changes feed** (`changes.list`) would let a scan ask only what changed since the last one,
  instead of listing every folder. A listing downloads nothing, so it is left for later, if scans
  of a large tree turn out slow.
