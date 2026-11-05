// Source files over the library's root: the linked scores folder (device-score-fs.ts) when there is
// one, and Volti's own folder in OPFS (internal-score-fs.ts) when there isn't. Both are folders with
// true paths, read the same way. A file in the root is a source file that can be moved (renamed, or
// into another folder) and removed (into Recently removed), asking for the access that needs. Also
// listing the root's files, known by the hash of their contents, and tidying storage at start-up.

import { _linked, _linkedRoot } from './device-score-fs';
import { hashFile, inTurns, walk } from './_filesystem-utils';
import { _dropInboxBytes } from './inbox-fs';
import { _internalFiles, _internalRoot, _opfsRoot, _removeInternalFile } from './internal-score-fs';
import { _bytesName, _folderWhere, _resolveListing, type _Found, type OriginalRecord, type Where } from './_record-model';
import { _loadRecords, _record, _records, _updateRecord, _updateRecords } from './_record-store';
import type { Readable, ScoreRoot, Stamp } from './_types';
import { _readOriginal } from './original';
import { byTitle, folderOf, _nameOf, _shownFolder, _tidyPath, titleOf, _unfoundName } from './path-utils';
import { _forgetRemovedBytes, _keepRemoved } from './trash-fs';
import type { AskPassword, FolderState, Original, SourceFile } from './types';

/** The library's root: the linked folder, or the app's own. Access to a linked one must be allowed. */
export async function _root(): Promise<ScoreRoot> {
  return (await _linkedRoot()) ?? _internalRoot();
}

/** The PDFs and images in the root, by path, as handles: no file is got. Access must be granted. */
export async function _folderFiles(): Promise<{ path: string; handle: FileSystemFileHandle }[]> {
  const found: [string, FileSystemFileHandle][] = [];
  await walk((await _linked()) ?? (await _opfsRoot()), '', 0, found);
  return found.map(([path, handle]) => ({ path, handle }));
}

/* ---------- its files ---------- */

/** A file at its path in the library's root. */
class LibraryFile implements Readable {
  constructor(readonly id: string, public path: string) {}

  async file(): Promise<File> {
    const r = await _root();
    await r.needAccess('read');
    return r.read(this.path);
  }

  read(ask?: AskPassword): Promise<Original> {
    return _readOriginal(this, ask);
  }

  async canReadNow(): Promise<boolean> {
    return (await (await _root()).access()) === 'ready';
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
    const r = await _root();
    await r.needAccess('readwrite');
    const folder = folderOf(to), name = _nameOf(to);
    // Changing only the case finds the file itself where the file system ignores case.
    const caseOnly = to.toLowerCase() === this.path.toLowerCase();
    if (!caseOnly && (await r.exists(to))) return this.taken(name, folder);
    const moved = await r.move(this.path, to);
    if ('caseOnly' in moved) return 'Only the case changes, and this folder can\'t do that. Change another letter too.';
    const same = folder === folderOf(this.path);
    const left = moved.leftBehind
      ? (same ? `Copied it as “${name}”, but couldn't delete “${_nameOf(this.path)}”. Delete it in the Files app.`
        : `Copied it into ${_shownFolder(folder)}, but couldn't delete it here. Delete it in the Files app.`)
      : null;
    // The same contents, so the same id: no need to read it again. A file with no record yet gets one.
    const where = await rootWhere(moved.stamp);
    await _updateRecord(this.id, (rec) => ({ ...rec, path: moved.path, where }));
    this.path = moved.path;
    return left;
  }

  async remove(): Promise<void> {
    const r = await _root();
    await r.needAccess('readwrite');
    const before = _record(this.id);
    await _keepRemoved(this.id, this.path, await r.read(this.path));
    const kept = _record(this.id)?.where;
    try {
      await r.remove(this.path);
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

/* ---------- exports ---------- */

/** The folder inside the linked folder that exported PDFs are written to. */
export const EXPORTS = 'Exports';

/** The linked root, asking for write access (from a tap), or throws NoAccess; throws when no folder is linked. */
async function exportsRoot(): Promise<ScoreRoot> {
  const r = await _linkedRoot();
  if (!r) throw new Error('No folder linked');
  await r.needAccess('readwrite');
  return r;
}

/** Whether `name`.pdf is in the exports folder. Asks for write access (from a tap), or throws NoAccess. */
export async function exportExists(name: string): Promise<boolean> {
  return (await exportsRoot()).exists(`${EXPORTS}/${name.trim()}.pdf`);
}

/**
 * Write `name`.pdf into the exports folder, replacing one of that name, and record it as a score
 * of the library. Asks for write access (from a tap: exportExists is asked first), or throws NoAccess.
 */
export async function saveExport(name: string, data: Blob): Promise<void> {
  const path = `${EXPORTS}/${name.trim()}.pdf`;
  const { file, stamp } = await (await exportsRoot()).write(path, data);
  await _placed(await hashFile(file), path, stamp);
}

/** Every score's title, by id, from its original's record, whether or not its file can be found. */
export const knownTitles = async () => Object.fromEntries([..._records()].map(([id, r]) => [id, titleOf(r.path)]));

/** Where a file just written into the root is: the linked folder, as it is now, or Volti's own. */
async function rootWhere(stamp?: Stamp): Promise<Where> {
  return (await _linked()) ? _folderWhere(stamp) : { kind: 'internal' };
}

/**
 * A file has been written into the root at `path`: its record is there now, and the bytes of the
 * place it was in before (the inbox, Recently removed, or Volti's own folder while a folder is
 * linked) are deleted.
 */
export async function _placed(id: string, path: string, stamp?: Stamp): Promise<void> {
  const where = await rootWhere(stamp);
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

/** New files are few and wanted soon, so their hashing goes this many at once. */
const NEW_FILES_AT_ONCE = 8;
/**
 * Known files are checked in the background, behind whatever else reads the folder (such as a score
 * being opened): each `getFile()` is a request to Android's storage framework, so one at a time.
 */
const KNOWN_FILES_AT_ONCE = 1;

/** An entry of a listing: a file's path, and its handle (the linked folder) or the file itself (Volti's own). */
interface Entry { path: string; handle?: FileSystemFileHandle; file?: File }

/** A file trusted to be the one recorded, to be checked in pass 2. */
interface Known { path: string; handle: FileSystemFileHandle; found: _Found }

/**
 * Write what a listing means for the records, with each record written only if it is still as the
 * `records` snapshot saw it (a share made meanwhile wins), and delete the bytes of places given
 * up. Gives the files that win, each at its canonical path.
 */
async function settle(kind: 'folder' | 'internal', records: ReadonlyMap<string, OriginalRecord>, found: readonly _Found[], linked: boolean): Promise<{ id: string; path: string }[]> {
  const result = _resolveListing(kind, records, found, linked);
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
 * List the `entries` of a root of `kind` (the linked folder, or Volti's own folder), after the
 * records are loaded: work out each file's id by names only. A path the records have (or, in the
 * linked folder, a hidden copy) is trusted to be the file recorded, without getting it; the others
 * are got and hashed, `NEW_FILES_AT_ONCE` at a time. Then write what the listing means for the
 * records and delete the bytes of places given up. Gives the files that win, each at its canonical
 * path, and the trusted files with what was trusted of them, for pass 2 to check.
 */
async function listing(kind: 'folder' | 'internal', entries: Entry[], linked: boolean, progress?: Progress): Promise<{ files: { id: string; path: string }[]; known: Known[]; found: _Found[] }> {
  // A snapshot: the copy in memory changes as records are written meanwhile.
  const records = new Map(_records());
  const at = new Map<string, { id: string; where: Where }>();
  for (const [id, r] of records) if (r.where.kind === kind) at.set(r.path, { id, where: r.where });
  const trusted = (e: Entry): _Found | undefined => {
    const r = at.get(e.path);
    // The casts go in stage 6 of the score roots work: a stamp isn't read in here then.
    if (r) return { path: e.path, id: r.id, size: r.where.kind === 'folder' ? r.where.size as number : e.file?.size ?? 0, modified: r.where.kind === 'folder' ? r.where.modified as number : e.file?.lastModified ?? 0 };
    const copy = hidden[kind].get(e.path);
    return copy && { ...copy, path: e.path };
  };
  const found: _Found[] = [];
  const known: Known[] = [];
  const fresh: Entry[] = [];
  for (const e of entries) {
    const f = trusted(e);
    if (!f) fresh.push(e);
    else {
      found.push(f);
      if (e.handle) known.push({ path: e.path, handle: e.handle, found: f });
    }
  }
  const hashed: _Found[] = [];
  const shown = () => _resolveListing(kind, records, [...found, ...hashed], linked).files.map((f) => _sourceFileOf(f.id, f.path)).sort(byTitle);
  if (fresh.length) progress?.(shown(), fresh.length);
  const results = await inTurns(fresh, NEW_FILES_AT_ONCE, async (e) => {
    const file = e.file ?? (await e.handle!.getFile());
    const f = { path: e.path, id: await hashFile(file), size: file.size, modified: file.lastModified };
    hashed.push(f);
    progress?.(shown(), fresh.length - hashed.length);
    return f;
  });
  found.push(...results);
  return { files: await settle(kind, records, found, linked), known, found };
}

/**
 * Pass 2 of a scan of the linked folder: get the `known` files, `KNOWN_FILES_AT_ONCE` at a time,
 * and hash one whose size or modified time differs from what was trusted, replacing its `_Found`
 * in `all` (every file found, which the listing is resolved from). After each one that changed,
 * the listing is resolved again from a fresh snapshot of the records and written, and `changed`
 * hears the files. A file gone meanwhile is skipped: the next scan sees it missing.
 */
async function checkKnown(known: Known[], all: _Found[], signal: AbortSignal, changed: (originals: SourceFile[]) => void): Promise<void> {
  await inTurns(known, KNOWN_FILES_AT_ONCE, async (k) => {
    let file: File;
    try {
      file = await k.handle.getFile();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotFoundError') return;
      throw e;
    }
    if (file.size === k.found.size && file.lastModified === k.found.modified) return;
    const now = { path: k.path, id: await hashFile(file), size: file.size, modified: file.lastModified };
    // A newer scan has taken over: what it wrote is not to be written over.
    if (signal.aborted) return;
    all[all.indexOf(k.found)] = now;
    k.found = now;
    const files = await settle('folder', new Map(_records()), all, true);
    if (!signal.aborted) changed(files.map((f) => _sourceFileOf(f.id, f.path)).sort(byTitle));
  }, signal);
}

/** The pass 2 still running, if any. */
let checking: AbortController | undefined;

/**
 * The library's files, sorted by title: the same SourceFile for an id as before; two of the same
 * file show the first. A scan of the linked folder has two passes. Pass 1 goes by names: only names
 * no record has are got and hashed (which reads them whole), a few at a time, and `progress` hears
 * the files known so far before the first and after each; a name the records have is trusted to be
 * the file recorded. Pass 2 then runs in the background, without being waited for, getting the
 * trusted files one at a time and hashing one whose size or modified time differs from its record;
 * `changed` hears the library's files each time it finds one. A new scan stops a pass 2 still
 * running. While the linked folder is locked, its files are the ones its records say.
 */
export async function libraryFiles(state: FolderState, progress?: Progress, changed?: (originals: SourceFile[]) => void): Promise<SourceFile[]> {
  checking?.abort();
  const mine = (checking = new AbortController());
  await _loadRecords();
  let files: { id: string; path: string }[];
  if (state.kind === 'locked') files = [..._records()].flatMap(([id, r]) => (r.where.kind === 'folder' ? [{ id, path: r.path }] : []));
  else if (state.kind === 'ready') {
    const listed = await listing('folder', await _folderFiles(), true, progress);
    files = listed.files;
    // Unless a newer scan began meanwhile, which has taken over.
    if (changed && listed.known.length && checking === mine) {
      void checkKnown(listed.known, listed.found, mine.signal, changed).catch((e) => {
        if (e?.name !== 'AbortError') console.warn('Checking the known files stopped:', e);
      });
    }
  } else {
    const entries = await _internalFiles();
    files = (await listing('internal', entries, false, progress)).files;
  }
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
  return (await listing('internal', entries, true)).files.map((f) => ({ ...f, file: files.get(f.path)! }));
}

/** How old a file no record points to must be before it is deleted: a share may be being written. */
const ORPHAN_MS = 10 * 60 * 1000;

/**
 * Start-up tidying, once, before anything is listed: delete the files in `inbox/` and `removed/`
 * that no record points to (left by a crash between writing the bytes and the record) and that
 * were last modified more than ten minutes ago.
 */
export async function tidyStorage(now = Date.now()): Promise<void> {
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
