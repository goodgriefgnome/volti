// Files coming into the library, from Add PDFs, shared from other apps (the inbox), put back from
// Recently removed, or left in the app's own folder when a folder is linked: each a source file held
// outside the library (a MemoryFile), known by its id, which moving puts at the path picked for it in
// the library's root (`arrivals` in path-utils.ts says what happens to each there).

import { hashBytes } from './_filesystem-utils';
import { _dropInboxBytes, _inboxFile } from './inbox-fs';
import { _isLinked } from './_folder-link';
import { _internalRoot, _removeInternalFile } from './handles/internal-score-fs';
import { _linkedRoot } from './linked-folder';
import { _placed, _root, _sourceFileOf } from './library-files';
import { folderOf, _importName, _nameOf, _shownFolder, _tidyPath, _unfoundName } from './path-utils';
import { _loadRecords, _record, _records, _updateRecord } from './_record-store';
import type { Readable, Stamp } from './_types';
import { _readOriginal } from './read/original';
import { _keepRemoved, _removedFile, recentlyRemoved } from './removed-fs';
import { NoAccess, type AskPassword, type Original, type Removed, type SourceFile } from './types';

/**
 * A file Volti holds outside the library: coming in, left in its own folder, or in Recently
 * removed. Moving it puts it into the library, and the record says the bytes of where it was are
 * deleted; from then on it is the library's file there.
 */
class MemoryFile implements Readable {
  /** Once moved into the library, the file there, which does the rest. */
  private moved?: SourceFile;

  constructor(readonly id: string, private at: string, private bytes: File, private drop: () => Promise<void>) {}

  get path() { return this.moved?.path ?? this.at; }
  async file() { return this.bytes; }
  read(ask?: AskPassword): Promise<Original> { return this.moved ? this.moved.read(ask) : _readOriginal(this, ask); }
  async canReadNow() { return this.moved ? this.moved.canReadNow() : true; }
  remove() { return this.moved ? this.moved.remove() : this.drop(); }

  async move(path: string): Promise<string | null> {
    if (this.moved) return this.moved.move(path);
    const to = _tidyPath(path), folder = folderOf(to), name = _nameOf(to);
    const unfound = _unfoundName(to);
    if (unfound) return unfound;
    const r = await _root();
    await r.needAccess('readwrite');
    if (await r.exists(to)) return `There is already a file called “${name}” in ${_shownFolder(folder)}.`;
    const { stamp } = await r.write(to, this.bytes);
    // Its record is there now, and the bytes of where it was are deleted.
    await _placed(this.id, to, stamp);
    this.moved = _sourceFileOf(this.id, to);
    return null;
  }
}

/**
 * A file Volti holds outside the library, `bytes`, at `path` (where it would go); `remove` is what
 * removing it does.
 */
const heldFile = (id: string, path: string, bytes: File, remove: () => Promise<void> = async () => {}): SourceFile =>
  new MemoryFile(id, path, bytes, remove);

/**
 * A file coming in, read once (on Android a picked file may not be readable a second time), with
 * an ending its name says it is a PDF or an image by; it would go at `path`, by default its own
 * name at the top. Nothing is stored until it is added.
 */
export async function readIncoming(f: File, path?: string): Promise<SourceFile> {
  const bytes = await f.arrayBuffer();
  const file = new File([bytes], _importName(f.name, f.type), { type: f.type, lastModified: f.lastModified });
  return heldFile(await hashBytes(bytes), path ?? file.name, file);
}

/**
 * The files shared to Volti and waiting in the inbox, oldest first, each at the name it would go
 * at. Removing one (left out, or the dialog cancelled) moves it to Recently removed, unless its
 * record has moved on since, as when the library has the file now: then only the inbox bytes go.
 */
export async function inboxFiles(): Promise<SourceFile[]> {
  await _loadRecords();
  const waiting = [..._records()].flatMap(([id, r]) => (r.where.kind === 'inbox' ? [{ id, path: r.path, at: r.where.inboxAt }] : []))
    .sort((a, b) => a.at - b.at);
  const out: SourceFile[] = [];
  for (const { id, path } of waiting) {
    let file: File;
    try {
      file = await _inboxFile(id);
    } catch (e) {
      console.warn('A shared file is missing from the inbox:', e);
      continue;
    }
    out.push(heldFile(id, path, file, async () => {
      // The bytes go to Recently removed first, and leave the inbox after.
      if (_record(id)?.where.kind === 'inbox') await _keepRemoved(id, _record(id)!.path, file);
      await _dropInboxBytes(id);
    }));
  }
  return out;
}

/**
 * The files in the app's own folder while a folder is linked: those not moved into it yet, each at
 * its path there, which moving it into the linked folder deletes, and removing it deletes with its
 * record. They are the `internal` records, each with its bytes read from the folder.
 */
export async function leftInApp(): Promise<SourceFile[]> {
  if (!(await _isLinked())) return [];
  const root = await _internalRoot();
  const out: SourceFile[] = [];
  for (const [id, r] of _records()) {
    if (r.where.kind !== 'internal') continue;
    const path = r.path;
    let file: File;
    try {
      file = await root.read(path);
    } catch (e) {
      console.warn('A file left in Volti\'s folder can\'t be read:', e);
      continue;
    }
    out.push(heldFile(id, path, file, async () => {
      await _removeInternalFile(path);
      // Not if the record has moved on, as when the linked folder has it.
      await _updateRecord(id, (rec) => (rec?.where.kind === 'internal' ? { ...rec, where: { kind: 'gone' } } : rec));
    }));
  }
  return out;
}

/**
 * A file in a root's own bin (Drive's bin), at the path it had: Volti keeps no bytes of it, so
 * moving it asks the root to take it out of the bin, to the path picked, and records it there.
 * Reading it, for the preview of the incoming screen, works only where the root kept a copy.
 */
class BinnedFile implements Readable {
  /** Once moved into the library, the file there, which does the rest. */
  private moved?: SourceFile;

  constructor(readonly id: string, private at: string, private binned: Stamp) {}

  get path() { return this.moved?.path ?? this.at; }
  async file() { return (await _linkedRoot())!.read(this.at, this.id); }
  read(ask?: AskPassword): Promise<Original> { return this.moved ? this.moved.read(ask) : _readOriginal(this, ask); }
  async canReadNow() { return this.moved ? this.moved.canReadNow() : !!(await _linkedRoot())?.kept(this.id); }
  /** It stays in the bin: leaving it out of the library changes nothing. */
  async remove() { if (this.moved) await this.moved.remove(); }

  async move(path: string): Promise<string | null> {
    if (this.moved) return this.moved.move(path);
    const to = _tidyPath(path), folder = folderOf(to), name = _nameOf(to);
    const unfound = _unfoundName(to);
    if (unfound) return unfound;
    const r = await _linkedRoot();
    if (!r) throw new NoAccess('No folder is linked.');
    await r.needAccess('readwrite');
    const taken = `There is already a file called “${name}” in ${_shownFolder(folder)}.`;
    if (await r.exists(to)) return taken;
    const moved = await r.undelete(this.binned, to);
    // Only the case changing is for a move; an undelete has no such case.
    if (moved === 'taken' || 'caseOnly' in moved) return taken;
    // Its record is in the folder now.
    await _placed(this.id, moved.path, moved.stamp);
    this.moved = _sourceFileOf(this.id, moved.path);
    return null;
  }
}

/**
 * A file in Recently removed, at the path it had: moving it puts it back, and forgets it there. One
 * kept by Volti is moved from its copy, into whatever is linked; one in a root's bin is taken out of it.
 */
export async function removedSource(r: Removed): Promise<SourceFile> {
  return r.binned ? new BinnedFile(r.id, r.path, r.binned) : heldFile(r.id, r.path, await _removedFile(r));
}

/**
 * The files in Recently removed, the latest first, in two lists: `here`, those that can be put
 * back now (kept by Volti, or in the linked folder's own bin), and `elsewhere`, those in another
 * folder's bin (or any bin, while no folder is linked), which can't.
 */
export async function removedLists(): Promise<{ here: Removed[]; elsewhere: Removed[] }> {
  const all = await recentlyRemoved();
  const root = await _linkedRoot();
  const here = (r: Removed) => !r.binned || !!root?.canUndelete(r.binned);
  return { here: all.filter(here), elsewhere: all.filter((r) => !here(r)) };
}
