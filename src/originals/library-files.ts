// Source files over the library's root: the linked scores folder (device-score-fs.ts) when there is
// one, and Volti's own folder in OPFS (internal-score-fs.ts) when there isn't. Both are folders with
// true paths, read the same way. A file in the root is a source file that can be moved (renamed, or
// into another folder) and removed (into Recently removed), asking for the access that needs. Also
// listing the root's files, known by the hash of their contents, and tidying storage at start-up.

import { kv } from '../storage/kv';
import { _canRead, _linked, _needAccess } from './device-score-fs';
import { hashFile, walk } from './_filesystem-utils';
import { _dropInboxBytes } from './inbox-fs';
import { _internalFiles, _opfsRoot, _removeInternalFile } from './internal-score-fs';
import { _bytesName, _resolveListing, type _Found, type OriginalRecord, type Where } from './_record-model';
import { _loadRecords, _record, _records, _updateRecord, _updateRecords } from './_record-store';
import type { Readable } from './_types';
import { _readOriginal } from './original';
import { byTitle, folderOf, _nameOf, _shownFolder, _tidyPath, titleOf, _unfoundName } from './path-utils';
import { _forgetRemovedBytes, _keepRemoved } from './trash-fs';
import type { AskPassword, FolderState, Original, SourceFile } from './types';

/** The library's root: the linked folder, or the app's own. Access to a linked one must be allowed. */
async function root(): Promise<FileSystemDirectoryHandle> {
  return (await _linked()) ?? _opfsRoot();
}

/** The file at `path` in the root. Access must be allowed. */
async function fileAt(path: string): Promise<File> {
  const [d, name] = await placeOf(path);
  return (await d.getFileHandle(name)).getFile();
}

/** The folder a path in the root is in, and the file's name. */
async function placeOf(path: string): Promise<[FileSystemDirectoryHandle, string]> {
  const parts = path.split('/');
  let d = await root();
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
  return [d, parts.at(-1)!];
}

/**
 * The subfolder `path` of the root ('' for the root itself), making the folders on it that aren't
 * there yet. Write access must have been allowed.
 */
export async function _makeFolder(path: string): Promise<FileSystemDirectoryHandle> {
  let d = await root();
  for (const p of path ? path.split('/') : []) d = await d.getDirectoryHandle(p, { create: true });
  return d;
}

/** The PDFs and images in the root, read now, by path; access must be granted. */
export async function _folderFiles(): Promise<{ path: string; file: File }[]> {
  const found: [string, FileSystemFileHandle][] = [];
  await walk(await root(), '', 0, found);
  return Promise.all(found.map(async ([path, h]) => ({ path, file: await h.getFile() })));
}

/* ---------- its files ---------- */

/** A file at its path in the library's root. */
class LibraryFile implements Readable {
  constructor(readonly id: string, public path: string) {}

  async file(): Promise<File> {
    await _needAccess('read');
    return fileAt(this.path);
  }

  read(ask?: AskPassword): Promise<Original> {
    return _readOriginal(this, ask);
  }

  canReadNow(): Promise<boolean> {
    return _canRead();
  }

  async move(path: string): Promise<string | null> {
    const to = _tidyPath(path);
    if (to === this.path) return null;
    const unfound = _unfoundName(to);
    if (unfound) return unfound;
    return this.moveInRoot(to);
  }

  /** There is a file called `name` where it is being moved. */
  private taken(name: string, folder: string) {
    return folder === folderOf(this.path) ? `There is already a file called “${name}” there.` : `There is already a file called “${name}” in ${_shownFolder(folder)}.`;
  }

  private async moveInRoot(to: string): Promise<string | null> {
    await _needAccess('readwrite');
    const [from, old] = await placeOf(this.path);
    const folder = folderOf(to), name = _nameOf(to);
    const into = folder === folderOf(this.path) ? from : await _makeFolder(folder);
    // The same folder, even when written differently (as a folder that ignores case can be).
    const same = into === from || (await into.isSameEntry(from));
    const now = same ? (folderOf(this.path) ? folderOf(this.path) + '/' : '') + name : to;
    if (same && name === old) return null;
    // Changing only the case finds the file itself where the file system ignores case.
    const caseOnly = same && name.toLowerCase() === old.toLowerCase();
    if (!caseOnly && (await into.getFileHandle(name).then(() => true, () => false))) return this.taken(name, folder);
    const h = await from.getFileHandle(old);
    // Where it can't be moved (as in some of Android's folders), copy it there, then delete it here.
    const moved = h.move
      ? await (same ? h.move(name) : h.move(into, name)).then(() => true, (e) => { console.warn('Moving by copying, as moving failed:', e); return false; })
      : false;
    if (!moved) {
      if (caseOnly) return 'Only the case changes, and this folder can\'t do that. Change another letter too.';
      const copy = await into.getFileHandle(name, { create: true });
      try {
        const w = await copy.createWritable();
        await w.write(await h.getFile());
        await w.close();
      } catch (e) {
        await into.removeEntry(name).catch(() => {});
        throw e;
      }
      // Both are the same score now, so one left behind only shows twice in the Files app.
      if (!(await from.removeEntry(old).then(() => true, () => false))) {
        return same ? `Copied it as “${name}”, but couldn't delete “${old}”. Delete it in the Files app.`
          : `Copied it into ${_shownFolder(folder)}, but couldn't delete it here. Delete it in the Files app.`;
      }
    }
    // The same contents, so the same id: no need to read it again.
    const file = await (await into.getFileHandle(name)).getFile(), where = await rootWhere(file);
    await _updateRecord(this.id, (r) => r && { ...r, path: now, where });
    this.path = now;
    return null;
  }

  async remove(): Promise<void> {
    await _needAccess('readwrite');
    const [d, name] = await placeOf(this.path);
    const before = _record(this.id);
    await _keepRemoved(this.id, this.path, await (await d.getFileHandle(name)).getFile());
    const kept = _record(this.id)?.where;
    try {
      await d.removeEntry(name);
    } catch (e) {
      // Still in the library: not removed after all.
      await _updateRecord(this.id, () => before);
      if (kept?.kind === 'removed') await _forgetRemovedBytes(this.id, kept.removedAt);
      throw e;
    }
  }
}

/** Each id's file in the root. */
const made = new Map<string, LibraryFile>();

/** The file in the root with id `id` at `path`: the one already made for it, brought up to date. */
export function _sourceFileOf(id: string, path: string): SourceFile {
  let o = made.get(id);
  if (!o) made.set(id, (o = new LibraryFile(id, path)));
  else o.path = path;
  return o;
}

/** Every score's title, by id, from its original's record, whether or not its file can be found. */
export const knownTitles = async () => Object.fromEntries([..._records()].map(([id, r]) => [id, titleOf(r.path)]));

/** Where a file just written into the root is: the linked folder, as it is now, or Volti's own. */
async function rootWhere(file: File): Promise<Where> {
  return (await _linked()) ? { kind: 'folder', size: file.size, modified: file.lastModified } : { kind: 'internal' };
}

/**
 * A file has been written into the root at `path`: its record is there now, and the bytes of the
 * place it was in before (the inbox, Recently removed, or Volti's own folder while a folder is
 * linked) are deleted.
 */
export async function _placed(id: string, path: string, file: File): Promise<void> {
  const where = await rootWhere(file);
  const before: { record?: OriginalRecord } = {};
  await _updateRecord(id, (r) => {
    before.record = r;
    return { ...r, path, where };
  });
  const old = before.record;
  if (old) await _dropBytes({ id, path: old.path, where: old.where }, where.kind === 'folder');
}

/** Delete the bytes of a place a record has left. */
async function _dropBytes(d: { id: string; where: Where; path: string }, linked: boolean): Promise<void> {
  try {
    if (d.where.kind === 'internal' && linked) await _removeInternalFile(d.path);
    else if (d.where.kind === 'inbox') await _dropInboxBytes(d.id);
    else if (d.where.kind === 'removed') await _forgetRemovedBytes(d.id, d.where.removedAt);
  } catch (e) {
    console.warn('Could not delete the bytes of a place given up:', e);
  }
}

/** Whether two records are the same, as stored. */
const same = (a: OriginalRecord | undefined, b: OriginalRecord | undefined) => JSON.stringify(a) === JSON.stringify(b);

/** The ids of files in the linked folder found more than once, as last listed: path → the copy. */
const hidden: Record<'folder' | 'internal', Map<string, _Found>> = { folder: new Map(), internal: new Map() };

/**
 * Hears the files known so far while new or changed files are read, and how many are `left`
 * to read.
 */
type Progress = (originals: SourceFile[], left: number) => void;

/**
 * List the `entries` of a root of `kind` (the linked folder, or Volti's own folder), after the
 * records are loaded: work out each file's id, hashing only those the records can't vouch for
 * (a folder file whose size and modified time are as recorded; any file of Volti's own folder at
 * the path recorded, as only Volti changes those), one at a time, then write what the listing
 * means for the records and delete the bytes of places given up. Gives the files that win, each
 * at its canonical path.
 */
async function listing(kind: 'folder' | 'internal', entries: { path: string; file: File }[], linked: boolean, progress?: Progress): Promise<{ id: string; path: string }[]> {
  // A snapshot: the copy in memory changes as records are written meanwhile.
  const records = new Map(_records());
  const at = new Map<string, { id: string; where: Where }>();
  for (const [id, r] of records) if (r.where.kind === kind) at.set(r.path, { id, where: r.where });
  const idOf = (path: string, file: File): string | undefined => {
    const r = at.get(path);
    if (r) {
      if (kind === 'internal') return r.id;
      if (r.where.kind === 'folder' && r.where.size === file.size && r.where.modified === file.lastModified) return r.id;
    }
    const copy = hidden[kind].get(path);
    return copy && copy.size === file.size && copy.modified === file.lastModified ? copy.id : undefined;
  };
  const found: _Found[] = [];
  const fresh: { path: string; file: File }[] = [];
  for (const e of entries) {
    const id = idOf(e.path, e.file);
    if (id) found.push({ path: e.path, id, size: e.file.size, modified: e.file.lastModified }); else fresh.push(e);
  }
  const shown = () => _resolveListing(kind, records, found, linked).files.map((f) => _sourceFileOf(f.id, f.path)).sort(byTitle);
  for (const [n, e] of fresh.entries()) {
    if (n === 0) progress?.(shown(), fresh.length);
    found.push({ path: e.path, id: await hashFile(e.file), size: e.file.size, modified: e.file.lastModified });
    progress?.(shown(), fresh.length - n - 1);
  }

  const result = _resolveListing(kind, records, found, linked);
  // Each record is written only if it is still as the listing saw it: a share made meanwhile wins.
  await _updateRecords([...result.changed].map(([id, next]) => [id, (stored) => (same(stored as OriginalRecord | undefined, records.get(id)) ? next : stored)]));
  for (const d of result.drop) {
    // A place given up is deleted only if the record did move.
    if (result.changed.has(d.id) && !same(_record(d.id), result.changed.get(d.id))) continue;
    await _dropBytes(d, linked);
  }
  hidden[kind] = result.duplicates;
  return result.files;
}

/**
 * The library's files, sorted by title: the same SourceFile for an id as before; two of the same
 * file show the first. Files new or changed since last time are hashed, which reads them whole, one
 * at a time; `progress` hears the files known so far before the first and after each. While the
 * linked folder is locked, its files are the ones its records say.
 */
export async function libraryFiles(state: FolderState, progress?: Progress): Promise<SourceFile[]> {
  await _loadRecords();
  const files = state.kind === 'locked'
    ? [..._records()].flatMap(([id, r]) => (r.where.kind === 'folder' ? [{ id, path: r.path }] : []))
    : await listing(state.kind === 'ready' ? 'folder' : 'internal', await _folderFiles(), state.kind === 'ready', progress);
  return files.map((f) => _sourceFileOf(f.id, f.path)).sort(byTitle);
}

/**
 * The files in Volti's own folder while a folder is linked: those not moved into it yet, listed as
 * the root is. A file whose id the linked folder has is deleted.
 */
export async function _listInternal(): Promise<{ id: string; path: string; file: File }[]> {
  await _loadRecords();
  const entries = await _internalFiles();
  const files = new Map(entries.map((e) => [e.path, e.file]));
  return (await listing('internal', entries, true)).map((f) => ({ ...f, file: files.get(f.path)! }));
}

/** The keys earlier versions wrote that are not in the format of STORAGE.md; what they held is not carried over. */
const OLD_KEYS = ['folder-files', 'hashes', 'internal-ids', 'titles', 'removed', 'inbox'];
const OLD_PREFIXES = ['pos:', 'aspects:', 'password:'];
/** How old a file no record points to must be before it is deleted: a share may be being written. */
const ORPHAN_MS = 10 * 60 * 1000;

/**
 * Start-up tidying, once, before anything is listed: delete the old database `volti` and the keys
 * earlier versions wrote, and the files in `inbox/` and `removed/` that no record points to and
 * that were last modified more than ten minutes ago. Can be removed in a later version, once
 * nothing is left to tidy.
 */
export async function tidyStorage(now = Date.now()): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('volti');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
  const old = (await Promise.all(OLD_PREFIXES.map((p) => kv.entries(p)))).flat().map(([key]) => key);
  await Promise.all([...OLD_KEYS, ...old].map((key) => kv.del(key)));

  const records = await _loadRecords();
  const pointedTo = (name: 'inbox' | 'removed') => new Set([...records].flatMap(([id, r]) => (r.where.kind === name ? [_bytesName(id, r.where)] : [])));
  for (const name of ['inbox', 'removed'] as const) {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(name, { create: true });
    const kept = pointedTo(name);
    for await (const [file, h] of dir.entries()) {
      if (kept.has(file) || h.kind !== 'file') continue;
      if (now - (await (h as FileSystemFileHandle).getFile()).lastModified > ORPHAN_MS) await dir.removeEntry(file).catch(() => {});
    }
  }
}
