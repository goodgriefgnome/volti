// Source files over the library's root: the linked scores folder (linked-folder.ts) when there is
// one, and Volti's own folder in OPFS (handles/internal-score-fs.ts) when there isn't. Both are folders with
// true paths, read the same way. A file in the root is a source file that can be moved (renamed, or
// into another folder) and removed (into Recently removed), asking for the access that needs. Also
// listing the root's files, known by the hash of their contents, and tidying storage at start-up.

import { _isLinked } from './_folder-link';
import { _linkedRoot } from './linked-folder';
import { hashFile } from './_filesystem-utils';
import { _dropInboxBytes } from './inbox-fs';
import { _internalFiles, _internalRoot, _removeInternalFile } from './handles/internal-score-fs';
import { _applyUpdate, _bytesName, _folderWhere, _inRoot, _knownOf, _rank, type OriginalRecord, type Where } from './_record-model';
import { _loadRecords, _onRecords, _record, _records, _updateRecord, _updateRecords } from './_record-store';
import type { Readable, ScoreRoot, Stamp } from './_types';
import { _readOriginal } from './read/original';
import { byTitle, folderOf, _nameOf, _shownFolder, _tidyPath, titleOf, _unfoundName } from './path-utils';
import { _forgetRemovedBytes } from './trash-fs';
import type { AskPassword, Original, SourceFile } from './types';

/** The library's root: the linked folder, or the app's own. Access to a linked one must be allowed. */
export async function _root(): Promise<ScoreRoot> {
  return (await _linkedRoot()) ?? _internalRoot();
}

/* ---------- its files ---------- */

/** A file at its path in the library's root. */
class LibraryFile implements Readable {
  constructor(readonly id: string, public path: string) {}

  async file(): Promise<File> {
    const r = await _root();
    if (!(await r.kept(this.id))) await r.needAccess('read');
    return r.read(this.path, this.id);
  }

  read(ask?: AskPassword): Promise<Original> {
    return _readOriginal(this, ask);
  }

  async canReadNow(): Promise<boolean> {
    const r = await _root();
    return (await r.access()) === 'ready' || r.kept(this.id);
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
    // The root keeps what Volti needs to put it back (a copy, or a place in its own bin), or fails and leaves the file where it is.
    const removed = await r.remove(this.path, this.id);
    const removedAt = 'copiedAt' in removed ? removed.copiedAt : Date.now();
    const where: Where = 'copiedAt' in removed ? { kind: 'removed', removedAt } : { kind: 'binned', removedAt, binned: removed.binned };
    try {
      await _updateRecord(this.id, (rec) => ({ ...rec, path: this.path, where }));
    } catch (e) {
      // Not recorded: the copy is no use to anyone.
      if ('copiedAt' in removed) await _forgetRemovedBytes(this.id, removedAt);
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
  return (await _linkedRoot()) ? _folderWhere(stamp) : { kind: 'internal' };
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

/* ---------- scanning, and the library's files ---------- */

/** How many new files the running scan has left to hash: 0 when none is running. */
let left = 0;
/** The running scan, stopped by a new one. */
let scanning: AbortController | undefined;
/** Who hears that `left` changed (a change to the records is heard from the store). */
const leftHeard = new Set<() => void>();

/**
 * Scan the root (the linked folder, readable), writing the records; ends when the scan does. A
 * scan started stops one running, and the older one writes nothing after. Each batch of changes is
 * written in one transaction, each to a record unchanged since the scan read it (a record Volti or
 * the service worker changed meanwhile wins), and the bytes of places given up are deleted after.
 */
export async function scanRoot(): Promise<void> {
  scanning?.abort();
  const mine = (scanning = new AbortController());
  await _loadRecords();
  const root = await _linkedRoot();
  if (!root || (await root.access()) !== 'ready' || mine.signal.aborted) return;
  // What the scan has read of each record: its own writes count.
  const seen = new Map(_records());
  try {
    for await (const batch of root.getUpdates(_knownOf(seen), mine.signal)) {
      if (mine.signal.aborted) return;
      left = batch.left;
      // A later change for an id replaces an earlier one.
      const latest = new Map(batch.changes.map((u) => [u.id, u.found] as const));
      const wrote = new Map<string, OriginalRecord>();
      const drops: { id: string; where: Where; path: string }[] = [];
      await _updateRecords([...latest].map(([id, found]) => [id, (stored) => {
        if (!same(stored, seen.get(id))) return stored;
        const applied = _applyUpdate(id, stored, found, true);
        if (!applied) return stored;
        wrote.set(id, applied.next);
        if (applied.drop) drops.push(applied.drop);
        return applied.next;
      }]));
      for (const [id, record] of wrote) seen.set(id, record);
      for (const d of drops) await _dropBytes(d, true);
      leftHeard.forEach((heard) => heard());
    }
  } finally {
    if (scanning === mine) {
      left = 0;
      leftHeard.forEach((heard) => heard());
    }
  }
}

/**
 * The library's files, sorted by title: the records in the current root (the linked folder's,
 * linked or locked, else Volti's own). Yields at once, again after every change to the records
 * this page makes, and with how many new files a running scan has left to hash. Ends when `signal`
 * aborts.
 */
export async function* libraryFiles(signal: AbortSignal): AsyncIterable<{ files: SourceFile[]; left: number }> {
  let changed = true;
  let wake: (() => void) | undefined;
  const heard = () => { changed = true; wake?.(); wake = undefined; };
  const stop = _onRecords(heard);
  leftHeard.add(heard);
  signal.addEventListener('abort', heard);
  try {
    while (!signal.aborted) {
      if (!changed) {
        await new Promise<void>((resolve) => { wake = resolve; });
        continue;
      }
      changed = false;
      const linked = !!(await _linkedRoot());
      const files = _inRoot(_records(), linked).map((f) => _sourceFileOf(f.id, f.path)).sort(byTitle);
      if (!signal.aborted) yield { files, left };
    }
  } finally {
    stop();
    leftHeard.delete(heard);
    signal.removeEventListener('abort', heard);
  }
}

/** How old a file no record points to must be before it is deleted: a share may be being written. */
const ORPHAN_MS = 10 * 60 * 1000;

/**
 * Start-up tidying, once, before anything is listed: delete the files in `inbox/` and `removed/`
 * that no record points to (left by a crash between writing the bytes and the record) and that
 * were last modified more than ten minutes ago. Files in `library/` that no `internal` record
 * points to, and that old, are recorded: hashed, at their paths, as `internal`, unless their id has
 * a better place, when the file is deleted. (One whose id is already `internal` at another path
 * is left alone.)
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
  await recordOrphans(records, now);
}

/** Record the files in Volti's own folder that no `internal` record points to: see `tidyStorage`. */
async function recordOrphans(records: ReadonlyMap<string, OriginalRecord>, now: number): Promise<void> {
  const linked = await _isLinked();
  const internal: Where = { kind: 'internal' };
  const recorded = new Set([...records.values()].flatMap((r) => (r.where.kind === 'internal' ? [r.path] : [])));
  for (const { path, file } of await _internalFiles()) {
    if (recorded.has(path) || now - file.lastModified <= ORPHAN_MS) continue;
    const id = await hashFile(file);
    const rank = (r: OriginalRecord | undefined) => (r ? _rank(r.where, linked) : -1);
    if (rank(_record(id)) > _rank(internal, linked)) {
      await _removeInternalFile(path).catch((e) => console.warn('Could not delete a file a better place has:', e));
    } else if (_record(id)?.where.kind !== 'internal') {
      const before: { record?: OriginalRecord } = {};
      // Unless a better place has it by now.
      await _updateRecord(id, (r) => {
        before.record = r;
        return rank(r) > _rank(internal, linked) ? r : { ...r, path, where: internal };
      });
      const old = before.record;
      if (old && rank(old) <= _rank(internal, linked)) await _dropBytes({ id, path: old.path, where: old.where }, linked);
    }
  }
}
