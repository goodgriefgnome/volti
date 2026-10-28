// Files coming into the library, from Add PDFs, shared from other apps (the inbox), put back from
// Recently removed, or left in the app's own folder when a folder is linked: each a source file held
// outside the library (a MemoryFile), known by its id, which moving puts at the path chosen for it in
// the library's root (arrivals.ts says what happens to each there).

import { hashBytes } from './_filesystem-utils';
import { _needAccess } from './device-score-fs';
import { _dropInboxBytes, _inboxFile } from './inbox-fs';
import { _removeInternalFile } from './internal-score-fs';
import { _listInternal, _makeFolder, _placed, _sourceFileOf } from './library-files';
import { folderOf, _importName, _nameOf, _shownFolder, _tidyPath, _unfoundName } from './path-utils';
import { _loadRecords, _record, _records, _updateRecord } from './_record-store';
import { writeFile } from './_filesystem-utils';
import type { Readable } from './_types';
import { _readOriginal } from './original';
import { _keepRemoved, _removedFile } from './trash-fs';
import type { AskPassword, Original, Removed, SourceFile } from './types';

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
  remove() { return this.moved ? this.moved.remove() : this.drop(); }

  async move(path: string): Promise<string | null> {
    if (this.moved) return this.moved.move(path);
    const to = _tidyPath(path), folder = folderOf(to), name = _nameOf(to);
    const unfound = _unfoundName(to);
    if (unfound) return unfound;
    await _needAccess('readwrite');
    const d = await _makeFolder(folder);
    if (await d.getFileHandle(name).then(() => true, () => false)) return `There is already a file called “${name}” in ${_shownFolder(folder)}.`;
    await writeFile(d, name, this.bytes);
    // Its record is there now, and the bytes of where it was are deleted.
    await _placed(this.id, to, await (await d.getFileHandle(name)).getFile());
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
 * record. Each is known by its record, hashed and recorded where it has none.
 */
export async function leftInApp(): Promise<SourceFile[]> {
  return (await _listInternal()).map(({ id, path, file }) => heldFile(id, path, file, async () => {
    await _removeInternalFile(path);
    // Not if the record has moved on, as when the linked folder has it.
    await _updateRecord(id, (r) => (r?.where.kind === 'internal' ? { ...r, where: { kind: 'gone' } } : r));
  }));
}

/** A file in Recently removed, at the path it had: moving it puts it back, and forgets it there. */
export async function removedSource(r: Removed): Promise<SourceFile> {
  return heldFile(r.id, r.path, await _removedFile(r));
}
