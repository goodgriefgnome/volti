// The library's root over a Google Drive folder, by id: listing its tree with Drive's checksums
// (no downloads), and reading and changing its files through the Drive API, with copies kept in
// the byte cache.

import type { _ByteCache } from './_byte-cache';
import type { _DriveApi, _DriveItem } from './_drive-api';
import { hashBytes, inTurns } from './_filesystem-utils';
import { _FolderScan } from './_folder-scan';
import type { Known, Moved, ScoreRoot, Stamp, UndeleteInfo, Update, Updates } from './_types';
import { folderOf, _isOriginalName, _nameOf } from './path-utils';
import { NoAccess } from './types';

/** As deep as the device folder is listed: the linked folder, and four levels of folders in it. */
const MAX_DEPTH = 4;
/** Folders listed at once. */
const FOLDERS_AT_ONCE = 4;

/** A file Drive has at a path: its Drive id, the folder it is in, and its id as Volti knows it (the SHA-256 of its bytes). */
interface Entry { fileId: string; parent: string; id: string }

const missing = (path: string) => new DOMException(`No file at ${path}`, 'NotFoundError');

export class DriveRoot implements ScoreRoot {
  /** Every file at its path, as of the last listing and this root's own writes: the hidden copies too. */
  private files = new Map<string, Entry>();
  /** Each folder path's Drive folder ids: more than one when folders of one name are merged; '' is the linked folder. */
  private folders: Map<string, string[]>;

  constructor(private folderId: string, private api: _DriveApi, private auth: { signedIn(): Promise<boolean> }, private cache: _ByteCache) {
    this.folders = new Map([['', [folderId]]]);
  }

  async access(): Promise<'ready' | 'locked'> {
    return (await this.auth.signedIn()) ? 'ready' : 'locked';
  }

  /** Never signs in, as that leaves the page; both modes are the same, as the scope allows both. */
  async needAccess(): Promise<void> {
    if (!(await this.auth.signedIn())) throw new NoAccess('Not signed in to Google Drive.');
  }

  kept(id: string): Promise<boolean> {
    return this.cache.has(id);
  }

  /* ---------- scanning ---------- */

  /** The tree, breadth first, four folders deep; folders of one name under one path. */
  private async list(signal: AbortSignal): Promise<{ files: Map<string, Entry>; folders: Map<string, string[]> } | undefined> {
    const files = new Map<string, Entry & { created: string }>();
    const folders = new Map<string, string[]>([['', [this.folderId]]]);
    let level: string[] = [''];
    for (let depth = 0; depth <= MAX_DEPTH && level.length; depth++) {
      const pending = level.flatMap((path) => folders.get(path)!.map((id) => ({ path, id })));
      const listed = await inTurns(pending, FOLDERS_AT_ONCE, ({ id }) => this.api.children(id, signal), signal).catch((e) => {
        if (signal.aborted) return undefined;
        throw e;
      });
      if (!listed || signal.aborted) return undefined;
      const next = new Set<string>();
      pending.forEach(({ path, id: parent }, i) => {
        for (const item of listed[i]) {
          if (item.name.includes('/')) continue;
          const at = path ? `${path}/${item.name}` : item.name;
          if (item.folder) {
            if (depth === MAX_DEPTH) continue;
            const ids = folders.get(at) ?? [];
            if (!ids.includes(item.id)) ids.push(item.id);
            folders.set(at, ids);
            next.add(at);
          } else if (item.sha256 && _isOriginalName(item.name)) {
            const there = files.get(at);
            if (!there || item.created < there.created) files.set(at, { fileId: item.id, parent, id: item.sha256, created: item.created });
          }
        }
      });
      level = [...next];
    }
    return { files: new Map([...files].map(([p, { created: _c, ...e }]) => [p, e])), folders };
  }

  /**
   * The scan, as the spec's "`DriveRoot`" says: list the whole tree first, then say the files at
   * known paths as one batch (so a second copy seen first doesn't look like a move), then the rest,
   * then the ids gone. Nothing is downloaded: every file comes with its id.
   */
  async *getUpdates(known: Known, signal: AbortSignal): AsyncIterable<Updates> {
    const tree = await this.list(signal);
    if (!tree || signal.aborted) return;
    this.files = tree.files;
    this.folders = tree.folders;

    const knownPaths = new Set([...known.values()].map((f) => f.path));
    const entries = [...tree.files];
    const scan = new _FolderScan(known);
    const say = (list: [string, Entry][]): Update[] => list.flatMap(([path, e]) => scan.see({ path, id: e.id }));

    const first = say(entries.filter(([p]) => knownPaths.has(p)));
    if (first.length) yield { changes: first, left: 0 };
    if (signal.aborted) return;
    const rest = say(entries.filter(([p]) => !knownPaths.has(p)));
    if (rest.length) yield { changes: rest, left: 0 };
    if (signal.aborted) return;
    const gone = scan.finish();
    if (gone.length) yield { changes: gone, left: 0 };
  }

  /* ---------- finding by path ---------- */

  /** The Drive folder ids of the folder `path`, from the listing or by asking one folder at a time; made when `make`. None when it isn't there. */
  private async folderIds(path: string, make = false): Promise<string[]> {
    const known = this.folders.get(path);
    if (known) return known;
    if (!path) return [this.folderId];
    const parent = await this.folderIds(folderOf(path), make);
    const name = _nameOf(path);
    const ids: string[] = [];
    for (const p of parent) for (const item of await this.api.named(p, name)) if (item.folder) ids.push(item.id);
    if (!ids.length && make && parent.length) ids.push(await this.api.createFolder(parent[0], name));
    if (ids.length) this.folders.set(path, ids);
    return ids;
  }

  /** The file at `path`: from the listing, else asked of the folders it would be in. */
  private async entryAt(path: string): Promise<Entry | undefined> {
    const there = this.files.get(path);
    if (there) return there;
    const name = _nameOf(path);
    const found: { item: _DriveItem; parent: string }[] = [];
    for (const parent of await this.folderIds(folderOf(path))) {
      for (const item of await this.api.named(parent, name)) if (!item.folder) found.push({ item, parent });
    }
    if (!found.length) return undefined;
    const first = found.reduce((a, b) => (b.item.created < a.item.created ? b : a));
    return { fileId: first.item.id, parent: first.parent, id: first.item.sha256 ?? '' };
  }

  /* ---------- reading and changing ---------- */

  async read(path: string, id?: string): Promise<File> {
    const name = _nameOf(path);
    const want = id ?? this.files.get(path)?.id;
    const cached = want ? await this.cache.get(want) : undefined;
    if (cached) return new File([cached], name);
    const entry = await this.entryAt(path);
    if (!entry) throw missing(path);
    const bytes = await this.api.download(entry.fileId);
    await this.cache.put(await hashBytes(await bytes.arrayBuffer()), bytes);
    return new File([bytes], name);
  }

  async exists(path: string): Promise<boolean> {
    const name = _nameOf(path);
    for (const parent of await this.folderIds(folderOf(path))) {
      if ((await this.api.named(parent, name)).some((i) => !i.folder)) return true;
    }
    return false;
  }

  async write(path: string, data: Blob): Promise<{ file: File; stamp?: Stamp }> {
    const name = _nameOf(path);
    const parent = (await this.folderIds(folderOf(path), true))[0];
    const over = await this.entryAt(path);
    const fileId = await this.api.upload(over?.parent ?? parent, name, data, over?.fileId);
    const id = await hashBytes(await data.arrayBuffer());
    await this.cache.put(id, data);
    this.files.set(path, { fileId, parent: over?.parent ?? parent, id });
    return { file: new File([data], name) };
  }

  async move(from: string, to: string): Promise<Moved> {
    const entry = await this.entryAt(from);
    if (!entry) throw missing(from);
    const toFolder = folderOf(from) === folderOf(to) ? entry.parent : (await this.folderIds(folderOf(to), true))[0];
    await this.api.update(entry.fileId, { name: _nameOf(to) === _nameOf(from) ? undefined : _nameOf(to), fromFolder: entry.parent, toFolder });
    this.files.delete(from);
    this.files.set(to, { ...entry, parent: toFolder });
    // Only the path matters to the library (the contents don't change), so no bytes are fetched for the file given.
    return { path: to, file: new File([], _nameOf(to)) };
  }

  /** Trashes the file, downloading and writing nothing: Drive's bin keeps it. `binned` says which file, and the folder it was in, to take it out again. */
  async remove(path: string): Promise<UndeleteInfo> {
    const entry = await this.entryAt(path);
    if (!entry) throw missing(path);
    await this.api.trash(entry.fileId);
    this.files.delete(path);
    return { binned: { fileId: entry.fileId, parent: entry.parent, folderId: this.folderId } };
  }

  /** In this root's bin when it was removed from this Drive folder. */
  canUndelete(binned: Stamp): boolean {
    return binned.folderId === this.folderId;
  }

  /** Untrashes the file and moves it to `to` in one request: back with its own Drive id. 'taken' when a file is at `to`. */
  async undelete(binned: Stamp, to: string): Promise<Moved | 'taken'> {
    if (await this.exists(to)) return 'taken';
    const toFolder = (await this.folderIds(folderOf(to), true))[0];
    await this.api.update(String(binned.fileId), { name: _nameOf(to), fromFolder: String(binned.parent), toFolder, untrash: true });
    // Only the path matters to the library (the contents don't change), so no bytes are fetched for the file given.
    return { path: to, file: new File([], _nameOf(to)) };
  }
}
