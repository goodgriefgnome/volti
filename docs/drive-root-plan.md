# A Google Drive folder as the scores folder: plan

How to build what `docs/drive-root-spec.md` describes. Read the spec first: it says what the
result must be, and where this plan and the spec disagree, the spec wins.

Each stage below is one commit, or a few, pushed before the next starts. After every commit,
`npm test` and `npm run build` pass. Paths are under `src/` unless they say otherwise.

Read these before starting, as the new code copies their patterns:

- `originals/_types.ts` (`ScoreRoot`, `Found`, `Update`, `Updates`), `originals/_folder-scan.ts`
  (`_FolderScan`), and how `LinkedDirectoryHandleRoot.getUpdates` in
  `originals/_directory-handle-roots.ts` feeds it.
- `originals/device-score-fs.ts`: the link, kept under the kv key `folder`.
- `originals/library-files.ts`: `_root()`, `LibraryFile`, `scanRoot()`.
- `originals/order.test.ts`: every file of `originals/` in import order. A new file goes in its
  list, at the place given in each stage, or the test fails.
- `ARCHITECTURE.md`, "Layers": a file starting with `_` is imported only from its own directory.

The order of `originals/` once every stage is done:

```
'_fake-handles', '_fake-drive', 'path-utils', '_filesystem-utils', 'types', '_types',
'_record-model', '_record-store', '_folder-scan', '_directory-handle-roots',
'_drive-config', '_drive-auth', '_drive-api', '_byte-cache', '_drive-root',
'_pdf-source', '_image-source', '_sources', 'original',
'_folder-link', 'device-score-fs', 'drive-score-fs', 'linked-folder',
'internal-score-fs', 'inbox-fs', 'trash-fs', 'library-files', 'misc-files',
```

## Stage 1: the build-time client, and `Unreachable`

Nothing uses Drive yet; this stage adds what later stages build on.

1. **`types/drive-env.d.ts`** (new), beside `types/version.d.ts`:

   ```ts
   // The Google OAuth client, given at build time (originals/_drive-config.ts).
   interface ImportMetaEnv {
     readonly VITE_DRIVE_CLIENT_ID?: string;
     readonly VITE_DRIVE_CLIENT_SECRET?: string;
   }
   ```

2. **`originals/_drive-config.ts`** (new; at its place in the order above):

   ```ts
   // The Google OAuth client Volti signs in with, given at build time (VITE_DRIVE_CLIENT_ID and
   // VITE_DRIVE_CLIENT_SECRET: the deploy workflow's secrets, or .env.local). None: no Drive.
   export const _clientId: string = import.meta.env.VITE_DRIVE_CLIENT_ID ?? '';
   export const _clientSecret: string = import.meta.env.VITE_DRIVE_CLIENT_SECRET ?? '';
   /** The page Google sends the browser back to: Volti's own URL (…/volti/). */
   export const _redirectUri = () => new URL(import.meta.env.BASE_URL, location.origin).href;
   ```

3. **`.gitignore`**: add `.env*.local`.
4. **`.github/workflows/deploy.yml`**: give the `npm run build` step the `env` the spec shows.
5. **`originals/types.ts`**: a new error, after `NoAccess`:

   ```ts
   /** The file is in the linked folder, but the folder can't be reached now: no network. */
   export class Unreachable extends Error {
     name = 'Unreachable';
   }
   ```

6. **`reader/_open-scores.ts`**: the `catch` that falls back to the saved pages (line ~49) takes
   `Unreachable` as it takes `NoAccess`.
7. **`library/_offline-status.ts`**: `Blocked` gains `'offline'`; `offlineText` says for it
   `“${s.title}” isn't on this tablet yet: connect to keep it.` (the spec's "Not on this tablet
   yet: connect to keep it", with the title, as the other reasons have it). Test it in
   `_offline-status.test.ts` beside the other reasons.
8. **`library/_offline-pages.ts`**: in `read`, `Unreachable` gives `'offline'`.

## Stage 2: one link of either kind under `folder`

Still only device folders, but the link and what the library calls move to where Drive can join
them. After this stage the stored link is dropped once, and the folder must be linked again.

1. **`originals/_folder-link.ts`** (new; at its place in the order above). Only kv and keys: `inbox-fs.ts`, which
   the service worker imports, imports it.

   ```ts
   // The kv key `folder`: the linked folder, on the device or in Google Drive, kept after unlinking
   // to tell whether one linked later is the same. Read and written only through here.

   export type FolderLink =
     | { kind: 'device'; handle: FileSystemDirectoryHandle; linked: boolean }
     | { kind: 'drive'; folderId: string; name: string; linked: boolean };

   export const _storedLink = (): Promise<FolderLink | undefined> => kv.get<FolderLink>(keys.folder);
   export const _storeLink = (link: FolderLink): Promise<void> => kv.set(keys.folder, link);
   /** Whether a folder is linked, read afresh from storage: for the service worker, which has no state. */
   export const _isLinked = async () => (await _storedLink())?.linked === true;
   ```

2. **`stored-data.ts`**: `DATA_VERSION = 4`; `STEPS` gains `3: toVersion4`, which deletes
   `keys.folder` (`kv.del`). Its doc comment says the link changed shape and is dropped.
   `folderToVersion3` and `_linkToVersion3` stay (version 2 data still passes through step 2).
   Update the comment on `folder` in `storage/keys.ts`: `FolderLink`, in
   `originals/_folder-link.ts`.
3. **`originals/device-score-fs.ts`**: it no longer touches the key. It keeps:
   - `canLinkFolder()`, as now.
   - `_pickFolder(): Promise<FileSystemDirectoryHandle | null>`: the picker part of
     `linkFolder` (null when cancelled; throws `FolderRefused`).
   - `_deviceRoot(handle): LinkedDirectoryHandleRoot`: one root per handle, made again for
     another handle (as `root` is now).
   - `_unlockDevice(handle): Promise<boolean>`: the body of `unlockFolder` now.
   - `_linkToVersion3` and `folderToVersion3`, as now.

   Its header comment says what it holds now.
4. **`originals/linked-folder.ts`** (new; at its place in the order above). Header: "The linked scores folder, of either kind: the link under `folder`
   (_folder-link.ts), linking and unlinking, its state, and its root; each kind's own work is in
   device-score-fs.ts and drive-score-fs.ts." It exports:

   ```ts
   /** The linked folder's root, if one is linked (locked or not). */
   export async function _linkedRoot(): Promise<ScoreRoot | undefined>;
   export async function folderState(): Promise<FolderState>;
   /** Pick a folder on the device and link it. Must be called from a tap. False when cancelled. */
   export async function linkDeviceFolder(): Promise<boolean>;
   /** From a tap: asks for access to a device folder. Never signs in to Drive (that leaves the page): false for one. */
   export async function unlockFolder(): Promise<boolean>;
   export async function unlinkFolder(): Promise<void>;
   ```

   and, private, `switchTo(link: FolderLink, same: boolean)`: when not `same`, turns every
   `folder` record into `gone` (the code at `device-score-fs.ts:72-77` now), then stores `link`
   and forgets the root it holds. `linkDeviceFolder` is `_pickFolder`, then `switchTo` with `same`
   from `isSameEntry` against a stored `device` link. `unlinkFolder` stores the link with
   `linked: false`. Keep the link read once in a module variable, as `dir` is now.
5. **`originals/types.ts`**: `FolderState` gains `place: 'device' | 'drive'` on `ready` and
   `locked`, as the spec shows.
6. Imports that move:
   - `library-files.ts`: `_linkedRoot` from `linked-folder`, `_isLinked` from `_folder-link`.
     `rootWhere` asks `await _linkedRoot()` in place of `_linked()`.
   - `inbox-fs.ts`, `misc-files.ts`: `_isLinked` from `_folder-link`.
   - `library/library.ts`: `folderState`, `unlinkFolder`, `unlockFolder` from
     `linked-folder`; `link()` calls `linkDeviceFolder()`.
   - `reader/reader.ts`, `reader/_toolbar-menus.ts`: from `linked-folder`.
7. Tests:
   - `stored-data.test.ts`: `STEPS[3]` exists (or test `toVersion4` with kv stood in, if the
     file already does so for another step; otherwise leave it to the manual check).
   - `order.test.ts`: the new files.
   - Everything else passes unchanged.

## Stage 3: the byte cache

1. **`originals/_byte-cache.ts`** (new; at its place in the order above). Made testable by taking its folder
   and budget:

   ```ts
   // Copies of originals' bytes, by id, in OPFS bytes/ with an index (bytes/index.json): kept for
   // the Drive root, evicted least recently used over a budget, except those pinned.

   export interface _ByteCache {
     /** The bytes kept for `id`, if any; noted as used. */
     get(id: string): Promise<File | undefined>;
     /** Whether bytes are kept for `id`, without noting it as used. */
     has(id: string): Promise<boolean>;
     /** Keep `bytes` as `id`'s, then keep within the budget. */
     put(id: string, bytes: Blob): Promise<void>;
     /** Keep exactly these ids' bytes for good, and let go of the others pinned before. */
     pin(ids: readonly string[]): Promise<void>;
     /** How many bytes are kept. */
     size(): Promise<number>;
     /** Delete everything kept. */
     clear(): Promise<void>;
   }
   export function _makeByteCache(dir: () => Promise<FileSystemDirectoryHandle>, budget: () => Promise<number>, now?: () => number): _ByteCache;
   /** The app's: OPFS bytes/, 25% of the quota (none when the browser won't say). */
   export const _byteCache: _ByteCache;
   ```

   - The index is `{ [id]: { size: number; used: number; pinned: boolean } }`, read once and
     written after each change. An index that can't be read is taken as empty, and files it
     doesn't list are deleted on the next `put`.
   - `put` writes `bytes/<id>` first, then the index, then evicts unpinned ids, least recently
     used first, until the total fits. An id pinned before its bytes come is kept when they come.
   - Every method catches its own failures and logs them (`console.warn`): `get` gives
     `undefined`, `put` and `pin` do nothing, `size` gives 0 (the spec: never a reason a file
     can't be read).
2. **`originals/_byte-cache.test.ts`**, with `_fakeFolder({})` from `_fake-handles.ts` as the
   folder (add to the fake whatever `createWritable`/`removeEntry` it lacks), a budget you set,
   and a clock you move:
   - put then get gives the same bytes; `get` of an unknown id is `undefined`;
   - over budget, the least recently used goes, and a `get` makes an id recently used;
   - pinned ids are never evicted, even over budget; pinning anew unpins the others;
   - an id pinned before it is put is kept when put;
   - `size` is the total; `clear` empties it.

## Stage 4: signing in, and the Drive API

1. **`originals/_drive-auth.ts`** (new; at its place in the order above). Its storage is passed in, so tests
   need no IndexedDB:

   ```ts
   export interface _AuthStore { get(): Promise<string | undefined>; set(token: string): Promise<void>; del(): Promise<void> }

   /** The authorization URL, for the verifier's S256 challenge, `state`, the drive scope, offline access and consent. Pure. */
   export function _authUrl(o: { clientId: string; redirectUri: string; challenge: string; state: string }): string;
   /** base64url(SHA-256(verifier)). */
   export function _challenge(verifier: string): Promise<string>;
   /** A random verifier (43–128 characters of the allowed set) and state. */
   export function _newVerifier(): string;

   export class _DriveAuth {
     constructor(store: _AuthStore, client: { id: string; secret: string }, now?: () => number);
     /** Whether there is a refresh token. */
     signedIn(): Promise<boolean>;
     /** Exchange `code` for tokens, storing the refresh token. Throws when Google refuses. */
     exchange(code: string, verifier: string, redirectUri: string): Promise<void>;
     /** An access token with a minute or more left, refreshed if need be (or `force`d). Throws NoAccess when signed out (deleting the refresh token on invalid_grant), Unreachable without a network. */
     token(force?: boolean): Promise<string>;
     /** Revoke the refresh token with Google (failures ignored) and delete it. */
     signOut(): Promise<void>;
   }
   /** The app's: the refresh token under the kv key `drive-auth` ({ refreshToken }). */
   export const _driveAuth: _DriveAuth;
   ```

   - Requests go to `https://oauth2.googleapis.com/token` as `application/x-www-form-urlencoded`
     with `client_id` and `client_secret`, as the removed test page did (look in git history for
     `public/drive-test.html`: `tokenRequest`).
   - A `fetch` that rejects (a `TypeError`) is `Unreachable`.
   - Add `keys.driveAuth: 'drive-auth'` to `storage/keys.ts`, with its comment.
2. **`originals/_drive-api.ts`** (new; at its place in the order above): the Drive requests, each through
   one helper that adds the token and maps failures.

   ```ts
   /** What Volti asks of Drive. DriveRoot and the folder chooser use only this, so tests stand in for it. */
   export interface _DriveApi {
     /** The folder's children, every page, not trashed: files and folders. */
     children(folderId: string, signal?: AbortSignal): Promise<_DriveItem[]>;
     /** The children called `name`, not trashed. */
     named(folderId: string, name: string): Promise<_DriveItem[]>;
     download(fileId: string): Promise<Blob>;
     /** A new file in `folderId`, or new contents for `over`. Gives its id. */
     upload(folderId: string, name: string, data: Blob, over?: string): Promise<string>;
     createFolder(parentId: string, name: string): Promise<string>;
     /** Rename and/or move a file (from `fromFolder` to `toFolder`). */
     update(fileId: string, change: { name?: string; fromFolder?: string; toFolder?: string }): Promise<void>;
     trash(fileId: string): Promise<void>;
   }
   export interface _DriveItem { id: string; name: string; folder: boolean; sha256?: string; created: string }
   export function _httpDriveApi(auth: _DriveAuth): _DriveApi;
   ```

   - `children` and `named`: `GET https://www.googleapis.com/drive/v3/files` with
     `q='<id>' in parents and trashed=false` (and `and name='<name>'`; escape `\` and `'` with a
     backslash), `fields=nextPageToken,files(id,name,mimeType,sha256Checksum,createdTime)`,
     `pageSize=1000`, following `nextPageToken`. `folder` is
     `mimeType === 'application/vnd.google-apps.folder'`.
   - `download`: `files/<id>?alt=media`. `upload`: `upload/drive/v3/files?uploadType=multipart`
     (POST, new) or `upload/drive/v3/files/<id>?uploadType=multipart` (PATCH, `over`).
     `update`: `PATCH files/<id>?addParents=…&removeParents=…` with `{ name }`. `trash`: `PATCH`
     with `{ trashed: true }`.
   - Failures: a rejected `fetch` is `Unreachable`; a 401 gets a forced token and one retry, and
     a second 401 signs out (`auth.signOut()` without revoking is fine: delete the token) and
     throws `NoAccess`; anything else not ok throws an `Error` with the status and Google's
     message.
3. Tests, `fetch` stubbed with `vi.stubGlobal`:
   - `_drive-auth.test.ts`: `_authUrl` carries every parameter (client id, redirect, `S256`,
     challenge, state, scope, `access_type=offline`, `prompt=consent`); `_challenge` of the
     RFC 7636 example verifier `dBjftJeZ4CVP-mJ92IgdNa0qYDeJB6mJ3rcTNSV3qe4` is
     `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`; `exchange` stores the refresh token; `token`
     reuses a fresh token, refreshes one near expiry, throws `NoAccess` and deletes the token on
     `invalid_grant`, throws `Unreachable` when `fetch` rejects.
   - `_drive-api.test.ts`: `children` follows two pages and escapes a `'` in a name; a 401 then
     200 retries once with a forced token; 401 twice throws `NoAccess`; a rejected `fetch`
     throws `Unreachable`.

## Stage 5: `DriveRoot`

1. **`originals/_types.ts`**: `ScoreRoot` gains, for a root that keeps copies by id (the spec's
   "Scores open from the tablet's copy … signed in or not"):

   ```ts
   /** The file at `path`; `id`, when the caller knows it, lets a root that keeps copies by id read one without finding the path. */
   read(path: string, id?: string): Promise<File>;
   /** Whether the root keeps a copy of `id` it can read without access or a network. */
   kept(id: string): Promise<boolean>;
   ```

   The directory roots (both) ignore `id` and keep nothing (`kept` gives false). `LibraryFile.file()`
   passes `this.id`; `LibraryFile.canReadNow()` is `access() === 'ready' || kept(this.id)`.
2. **`originals/_fake-drive.ts`** (new; at its place in the order above; only tests import it): an in-memory
   `_DriveApi`. Items in a map by Drive id, each with its parent, name, created time (a counter),
   bytes and `trashed`; `sha256` the hex SHA-256 of the bytes (`hashBytes`). A `down` flag makes
   every method throw `Unreachable`, and `revoked` makes them throw `NoAccess`. Helpers to set up
   a tree from paths (`_fakeDrive({ 'A/x.pdf': 'bytes', … })`) and to read it back as paths.
3. **`originals/_drive-root.ts`** (new; at its place in the order above):

   ```ts
   // The library's root over a Google Drive folder, by id: listing its tree with Drive's
   // checksums (no downloads), and reading and changing its files through the Drive API, with
   // copies kept in the byte cache.

   export class DriveRoot implements ScoreRoot {
     constructor(folderId: string, api: _DriveApi, auth: { signedIn(): Promise<boolean> }, cache: _ByteCache);
   }
   ```

   What it keeps, from its last listing and its own writes:
   - `files: Map<path, { fileId: string; id: string }>`, every file at its path, the hidden
     copies included;
   - `folders: Map<folderPath, string[]>`, each folder path's Drive folder ids (more than one
     when folders of one name are merged; `''` is the linked folder).

   Its methods, as the spec's "`DriveRoot`" says:
   - `access()`: `ready` when signed in, else `locked`. `needAccess()`: throws `NoAccess` when
     not signed in.
   - `getUpdates(known, signal)`: list the tree breadth first from `folderId`, four folders deep
     (as `walk` in `_filesystem-utils.ts`), merging folders of one name under one path. Leave out
     names with a `/`, files that aren't `_isOriginalName`, and files without `sha256`. At a path
     with two files, keep the one with the earliest `created`. Then, through a `_FolderScan(known)`:
     see the files at known paths first (as `LinkedDirectoryHandleRoot` does, so a hidden copy
     doesn't look like a move), yield them as one batch; see the rest, yield them; then yield
     `finish()`. `left` is 0 in every batch. Replace `files` and `folders` only when the listing
     finished; stop quietly when `signal` aborts.
   - `read(path, id)`: `id` (given, or from `files`) in the cache, else find the file's Drive id
     (from `files`, else by `named` down the path, one request per folder), download it, put it
     in the cache, and give it as a `File` named as the path's last part.
   - `exists(path)`: `named` in each of the parent folder's ids; false when the folder isn't
     there.
   - `write(path, data)`: make the folders on the path that aren't there (`createFolder`, adding
     to `folders`), `upload` (over the file at the path, if any), put the bytes in the cache under
     their hash (`hashBytes`), update `files`. Gives `{ file }`, no stamp.
   - `move(from, to)`: make the folders of `to`, then one `update` (name, and parent when the
     folder changes); update `files`. Gives `{ path: to, file }` (the file from the cache when
     there, else downloaded: `LibraryFile` only needs its path; if you can avoid the download,
     give a `File` of no bytes and say why in a comment).
   - `remove(path)`: `trash`; drop it from `files`.
   - `kept(id)`: `cache.has(id)`.
4. **`originals/_drive-root.test.ts`**, over `_fake-drive` and a byte cache on `_fakeFolder`:
   - a first `getUpdates` with nothing known: every PDF and image at its path with its sha256 as
     id; four deep and no deeper; trashed, `/` names and other files left out;
   - known ids: unchanged gives no changes; moved in Drive gives the new path; deleted gives the
     id without `found`; a second copy of a known id doesn't move it (stays at its path);
   - two files at one path: the earlier created one is listed; two folders of one name: both
     folders' files under the one path;
   - over 1000 children: the fake pages (make its page size settable, say 2 in this test);
   - `read`: from the cache with no request (fake `down`); downloaded and then cached; offline
     and not cached throws `Unreachable`; `read(path, id)` before any listing reads the cache;
   - `exists`; `write` new folders and a new file, and over a file (one file there after);
     `move` within and across folders; `remove` puts it in the trash;
   - `revoked` makes `getUpdates` throw `NoAccess`.

## Stage 6: linking a Drive folder, and signing in

1. **`originals/drive-score-fs.ts`** (new; at its place in the order above):

   ```ts
   // The Google Drive side of the scores folder: whether Drive is offered, signing in (which
   // leaves the page) and finishing it at start-up, the folders the chooser shows, a Drive
   // folder's root, and the copies of its files kept on the tablet.

   /** Whether this build has a Google client (_drive-config.ts). */
   export const driveOffered: () => boolean;
   /** Leave for Google's sign-in page; back at Volti's URL, `finishSignIn` picks up `intent`. */
   export function signInToDrive(intent: 'link' | 'unlock'): Promise<never>;
   /**
    * At start-up, before the library: when the address has `?code=…&state=…` (or `?error=…`)
    * from Google, exchange the code, take them off the address, and give what was being done.
    * Undefined when the address has none. Throws when signing in failed.
    */
   export function finishSignIn(): Promise<'link' | 'unlock' | undefined>;
   /** The folders in a Drive folder ('root' for My Drive), by name. */
   export function driveFolders(parentId: string): Promise<{ id: string; name: string }[]>;
   /** The root over a Drive folder, one per folder id. */
   export function _driveRoot(folderId: string): DriveRoot;
   /** Sign out: revoke and forget the refresh token, and empty the byte cache (unlinking). */
   export function _forgetDrive(): Promise<void>;
   /** Keep these originals' bytes on the tablet for good (the offline job's setlist scores). */
   export function keepOriginalsOffline(ids: readonly string[]): Promise<void>;
   /** How many bytes of Drive files are kept on the tablet, for the storage screen. */
   export function keptFromDriveBytes(): Promise<number>;
   ```

   The verifier, state and intent wait in `sessionStorage` (`volti-drive-sign-in`) while the
   page is away; `finishSignIn` checks the state, and deletes the entry either way.
2. **`originals/linked-folder.ts`** gains the Drive kind:
   - `linkDriveFolder(folderId: string, name: string): Promise<void>`: `switchTo` with `same`
     when the stored link is `drive` with that `folderId`.
   - `_linkedRoot()` gives `_driveRoot(folderId)` for a `drive` link; `folderState()` gives its
     `name`, `place: 'drive'`, and `ready`/`locked` from the root's `access()`.
   - `unlockFolder()` gives false for Drive (signing in is the library's, below).
   - `unlinkFolder()` of a Drive folder also calls `_forgetDrive()`.
3. **`main.ts`**: before `new Library()`, `const signedIn = await finishSignIn().catch(…)`
   (on failure, keep the error to say in the library: "Could not sign in to Google Drive.").
   After `library.refresh()`: `'link'` opens the folder chooser (`library.chooseDriveFolder()`),
   `'unlock'` needs nothing more (the refresh scanned).
4. **`library/_drive-folders.ts`** (new): the folder chooser of the spec's "The folder chooser",
   a dialog from `ui/overlay.ts` (`showDialog`), as the other library dialogs are built:
   `chooseDriveFolder(): Promise<{ id: string; name: string } | null>`. It shows "Loading…" while
   `driveFolders` runs, and "Could not reach Google Drive." on `Unreachable`.
5. **`library/library.ts`**:
   - `link()`: with `driveOffered()` and `canLinkFolder()`, a menu (`showMenu`) of "A folder on
     this tablet" and "A folder in Google Drive"; with only one of them, that one; with neither,
     nothing (the banner doesn't offer it: see `_folder-banner.ts`).
   - Google Drive: signed in (`folderState`, or a new `driveSignedIn()` from `drive-score-fs`)
     goes to `chooseDriveFolder()`; not signed in goes to `signInToDrive('link')`.
   - `chooseDriveFolder()` (public, for `main.ts`): the chooser, then `linkDriveFolder`, then
     `refresh()` and `moveLeftIn(false)`, as `link()` does for a device folder.
   - `unlock()`: for `place: 'drive'`, `signInToDrive('unlock')`; for a device folder, as now.
   - `readOriginals()`: on `Unreachable` from `scanRoot()`, say "Could not reach Google Drive.
     The scores kept on this tablet still open." in place of the device message.
6. **`library/_folder-banner.ts`**: "Link scores folder" shows when `canLinkFolder() ||
   driveOffered()`; the locked button reads "Sign in to Google Drive" for `place: 'drive'`.
7. **`reader/reader.ts`** (line ~720): for a Drive folder, "Sign in to Google Drive from the
   library to read this score." in place of "Volti can’t read the scores folder without access."
8. Tests: `linked-folder` has no unit tests (it is kv and dispatch: covered by the manual checks).
   `finishSignIn`'s parsing of the address: a pure `_signInReturn(search: string, saved: …)`
   with tests for a good return, a state that doesn't match, `?error=access_denied`, and no
   return.

## Stage 7: keeping Drive files on the tablet, and the storage screen

1. **`library/_offline-pages.ts`**: after working out the setlists' score ids, call
   `keepOriginalsOffline(ids)` (from `drive-score-fs`) with the ids of the live setlists' scores.
   It is harmless with a device folder: nothing is put in the cache for one.
2. **`library/_storage.ts`**: `StoragePart.key` gains `'drive'`; `storageParts` takes the bytes
   kept from Drive and adds `{ key: 'drive', name: 'Scores kept from Google Drive', bytes }`
   after "Added scores", only when it is over 0. `measure()` asks `keptFromDriveBytes()`.
   Update `_storage.test.ts` for the new parameter, with a test that the part shows only when
   there are bytes.
3. **`styles/base.css`**: `--part-drive` in each of its three colour sets (pick a colour clearly
   unlike the others, light and dark), and **`styles/library.css`**: `.part-drive`.

## Stage 8: docs

- `STORAGE.md`: `folder` as `FolderLink` with both kinds; `drive-auth`; `folder` records meaning
  the linked folder, on the device or in Drive; OPFS `bytes/` and its index; "What happens, by
  operation" for linking a Drive folder, its scans, and unlinking it. Data version 4, and what its
  step drops.
- `ARCHITECTURE.md`: the `originals/` row, with the new files in order and a few words each, and
  the count of files; `library/_drive-folders.ts` in the `library/` row.
- `README.md`: linking a Google Drive folder, and Google's unverified-app warning; under
  Development, the Actions secrets `DRIVE_CLIENT_ID` and `DRIVE_CLIENT_SECRET`, `.env.local`,
  and that the Google client must list `http://localhost:5173/volti/` as a redirect URI for
  local sign-in.
- Delete `docs/drive-root-spec.md` and this plan, as the last commit, once the docs say
  everything they did.

## Manual checks in the app

On the tablet, with the deployed build (the Actions secrets set):

1. After updating, the scores folder shows as not linked. Link the device folder again: its
   scores come back with their markings and setlists, after reading every file once.
2. Link scores folder offers both places. Choose Google Drive: Google's page, the unverified-app
   warning (Advanced), consent; back in Volti, the folder chooser opens at My Drive. Open a
   folder, Use this folder. The library lists its scores, with the same markings and setlists
   as from the device folder, and no "Reading new scores" count.
3. Check for new scores after adding a PDF in Drive's website: it appears. Rename one in Drive:
   it moves, keeping its markings.
4. Open a score, then turn on airplane mode, close and open Volti: the library lists the scores
   (with the offline message), and that score opens. One never opened shows its saved pages, or
   says it can't be read.
5. Rename and move a score in Volti, export a PDF, remove a score: each shows in Drive's
   website (the removed one in Drive's trash). Restore it from Recently removed: back in Drive.
6. A setlist's status: with all its scores read once, it says ready; airplane mode, play it.
   The storage screen shows "Scores kept from Google Drive".
7. Remove Volti's access in the Google Account (Security, third-party connections). Open Volti:
   the banner says "Sign in to Google Drive"; tapping it signs in and comes back scanning.
8. Unlink: the storage screen's Drive part is gone; Google's list of connections no longer
   shows Volti. Link the device folder again: as in check 1.
9. On a desktop Chrome and on an iPad, link a Drive folder (on the iPad, Link scores folder goes
   straight to Google Drive).
10. A build without the secrets (`npm run build` locally, no `.env.local`): no Drive anywhere.

## Decisions not discussed

- The chooser lives in `library/_drive-folders.ts`, not `dialogs/drive-folders.ts`: only the
  library opens it (`ARCHITECTURE.md`'s rule for dialogs). The spec is changed to match.
- `unlockFolder()` never signs in; the library's `unlock()` does, for Drive. So the reader and
  opening a setlist, which call `unlockFolder()`, can never leave the page. The spec is changed
  to match.
- `ScoreRoot` gains `read(path, id?)` and `kept(id)`, so a cached score opens offline before any
  listing this session, and `canReadNow()` sees the cache. The spec is changed to match.
- A Drive scan lists the whole tree before saying anything, then the known paths first, the rest
  second, then the gone ones (not "folder by folder"): seeing a second copy before the known one
  would say a move and then undo it. The spec is changed to match.
- The byte cache's functions are `_`-named in `_byte-cache.ts`; the library reaches them through
  `keepOriginalsOffline` and `keptFromDriveBytes` in `drive-score-fs.ts`. The spec is changed to
  match.
- `DriveRoot` and `_drive-auth` take their API, auth, cache and storage as arguments, so tests
  stand in for Drive with `_fake-drive.ts` rather than by stubbing `fetch`; only
  `_drive-api.test.ts` and `_drive-auth.test.ts` stub `fetch`.
- The link's module is `_folder-link.ts`, apart from `linked-folder.ts`, so the service worker's
  `_isLinked` doesn't import the roots.
- A sign-in that fails or is cancelled says "Could not sign in to Google Drive." in the library.
- The offline reason reads "“Title” isn't on this tablet yet: connect to keep it."
- The storage screen's Drive part shows only when it holds something.
