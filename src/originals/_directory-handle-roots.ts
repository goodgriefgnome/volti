// The library's roots that are folders of handles: Volti's own folder in OPFS and the linked scores
// folder. What both do to a folder by path (read, check, write, move, remove) is in a base class
// here; each adds its own access, stamps and scanning. Nothing else in originals/ holds a folder's
// handle to work on its files.

import { hashFile, inTurns, walk, writeFile } from './_filesystem-utils';
import { _FolderScan } from './_folder-scan';
import { _bytesName, _sameStamp } from './_record-model';
import type { Known, Moved, ScoreRoot, Stamp, UndeleteInfo, Update, Updates } from './_types';
import { folderOf, _nameOf } from './path-utils';
import { _removedDir } from './trash-fs';
import { NoAccess } from './types';

/** New files are few and wanted soon, so their hashing goes this many at once. */
const NEW_FILES_AT_ONCE = 8;

abstract class DirectoryHandleRoot implements ScoreRoot {
  /** `bin` is Volti's removed folder, where a removed file's copy goes. */
  constructor(protected dir: FileSystemDirectoryHandle, protected bin: () => Promise<FileSystemDirectoryHandle> = _removedDir) {}

  abstract access(): Promise<'ready' | 'locked'>;
  abstract needAccess(mode: 'read' | 'readwrite'): Promise<void>;
  abstract getUpdates(known: Known, signal: AbortSignal): AsyncIterable<Updates>;
  /** This root's stamp for a file it has written or moved; none for Volti's own folder. */
  protected abstract stampOf(file: File): Stamp | undefined;

  /** A folder keeps nothing of its own: its files are read where they are. */
  async kept(): Promise<boolean> { return false; }

  async read(path: string): Promise<File> {
    const [d, name] = await this.placeOf(path);
    return (await d.getFileHandle(name)).getFile();
  }

  async exists(path: string): Promise<boolean> {
    try {
      const [d, name] = await this.placeOf(path);
      await d.getFileHandle(name);
      return true;
    } catch {
      return false;
    }
  }

  async write(path: string, data: Blob): Promise<{ file: File; stamp?: Stamp }> {
    const d = await this.makeFolder(folderOf(path));
    const name = _nameOf(path);
    await writeFile(d, name, data);
    const file = await (await d.getFileHandle(name)).getFile();
    return { file, stamp: this.stampOf(file) };
  }

  async move(from: string, to: string): Promise<Moved> {
    const [src, old] = await this.placeOf(from);
    const folder = folderOf(to), name = _nameOf(to);
    const into = folder === folderOf(from) ? src : await this.makeFolder(folder);
    // The same folder, even when written differently (as a folder that ignores case can be).
    const same = into === src || (await into.isSameEntry(src));
    const now = same ? (folderOf(from) ? folderOf(from) + '/' : '') + name : to;
    const h = await src.getFileHandle(old);
    if (same && name === old) {
      const file = await h.getFile();
      return { path: now, file, stamp: this.stampOf(file) };
    }
    // Changing only the case finds the file itself where the file system ignores case.
    const caseOnly = same && name.toLowerCase() === old.toLowerCase();
    // Where it can't be moved (as in some of Android's folders), copy it there, then delete it here.
    const moved = h.move
      ? await (same ? h.move(name) : h.move(into, name)).then(() => true, (e) => { console.warn('Moving by copying, as moving failed:', e); return false; })
      : false;
    let leftBehind = false;
    if (!moved) {
      if (caseOnly) return { caseOnly: true };
      await writeFile(into, name, await h.getFile());
      // Both are the same score now, so one left behind only shows twice in the Files app.
      leftBehind = !(await src.removeEntry(old).then(() => true, () => false));
    }
    const file = await (await into.getFileHandle(name)).getFile();
    return { path: now, file, stamp: this.stampOf(file), ...(leftBehind ? { leftBehind: true as const } : {}) };
  }

  /** The file is copied into Volti's removed folder first, so failing part way loses nothing; a copy left by a failed delete is deleted. */
  async remove(path: string, id: string): Promise<UndeleteInfo> {
    const [d, name] = await this.placeOf(path);
    const copiedAt = Date.now();
    const bin = await this.bin();
    const kept = _bytesName(id, { kind: 'removed', removedAt: copiedAt });
    await writeFile(bin, kept, await (await d.getFileHandle(name)).getFile());
    try {
      await d.removeEntry(name);
    } catch (e) {
      await bin.removeEntry(kept).catch(() => {});
      throw e;
    }
    return { copiedAt };
  }

  /** A folder has no bin of its own: a removed file is put back from the copy Volti keeps. */
  canUndelete(): boolean { return false; }

  async undelete(): Promise<Moved | 'taken'> {
    throw new Error('A folder has no bin to take a file out of');
  }

  /** The folder a path in the root is in, and the file's name. */
  protected async placeOf(path: string): Promise<[FileSystemDirectoryHandle, string]> {
    const parts = path.split('/');
    let d = this.dir;
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
    return [d, parts.at(-1)!];
  }

  /** The subfolder `path` of the root ('' for the root itself), making the folders on it that aren't there yet. */
  protected async makeFolder(path: string): Promise<FileSystemDirectoryHandle> {
    let d = this.dir;
    for (const p of path ? path.split('/') : []) d = await d.getDirectoryHandle(p, { create: true });
    return d;
  }
}

/** Volti's own folder in OPFS: always ready, no stamps, and nothing changes in it but what Volti does. */
export class InternalDirectoryHandleRoot extends DirectoryHandleRoot {
  async access() { return 'ready' as const; }

  /** Moves the file into Volti's removed folder, where the file system can; else copies it, as any folder does. */
  override async remove(path: string, id: string): Promise<UndeleteInfo> {
    const [d, name] = await this.placeOf(path);
    const h = await d.getFileHandle(name);
    const copiedAt = Date.now();
    const moved = h.move
      ? await h.move(await this.bin(), _bytesName(id, { kind: 'removed', removedAt: copiedAt })).then(() => true, (e) => { console.warn('Removing by copying, as moving failed:', e); return false; })
      : false;
    return moved ? { copiedAt } : super.remove(path, id);
  }

  async needAccess() {}
  async *getUpdates(): AsyncIterable<Updates> {}
  protected stampOf() { return undefined; }
}

/** What the linked folder's stamp is for a file, at its edge: exact types for its fields. */
type HandleStamp = { size: number; modified: number };

/** The linked scores folder: access by its permissions, stamps of size and modified time, and scanning. */
export class LinkedDirectoryHandleRoot extends DirectoryHandleRoot {
  /** The copies of ids found at other paths than their places, from the last scan: never hashed again by this root. */
  private hidden = new Map<string, { id: string; stamp?: Stamp }>();

  async access(): Promise<'ready' | 'locked'> {
    return (await this.dir.queryPermission({ mode: 'read' })) === 'granted' ? 'ready' : 'locked';
  }

  /** Asking works only from a tap: elsewhere, or when it is refused, throws NoAccess. */
  async needAccess(mode: 'read' | 'readwrite'): Promise<void> {
    if ((await this.dir.queryPermission({ mode })) === 'granted') return;
    if ((await this.dir.requestPermission({ mode }).catch(() => 'denied')) !== 'granted') throw new NoAccess('Volti has no access to the scores folder.');
  }

  protected stampOf(file: File): Stamp {
    const stamp: HandleStamp = { size: file.size, modified: file.lastModified };
    return stamp;
  }

  /**
   * The scan, as the spec's "How LinkedDirectoryHandleRoot scans" says: pass 1 trusts the paths
   * `known` and the hidden copies have, hashes the others (`NEW_FILES_AT_ONCE` at a time) and says
   * each as it is hashed, then says the ids gone; pass 2 gets the trusted files one at a time.
   */
  async *getUpdates(known: Known, signal: AbortSignal): AsyncIterable<Updates> {
    const walked: [string, FileSystemFileHandle][] = [];
    await walk(this.dir, '', 0, walked);
    if (signal.aborted) return;
    const handles = new Map(walked);

    const trusted = new Map<string, { id: string; stamp?: Stamp }>();
    for (const [id, f] of known) trusted.set(f.path, { id, stamp: f.stamp });
    const atKnown = [...handles.keys()].filter((p) => trusted.has(p));
    for (const [p, c] of this.hidden) if (!trusted.has(p)) trusted.set(p, c);
    // The files at known paths are seen first, so a hidden copy doesn't look like a move.
    const checked = [...atKnown, ...[...handles.keys()].filter((p) => trusted.has(p) && !atKnown.includes(p))];
    const fresh = [...handles.keys()].filter((p) => !trusted.has(p));

    const scan = new _FolderScan(known);
    const first: Update[] = [];
    for (const path of checked) first.push(...scan.see({ path, ...trusted.get(path)! }));
    let left = fresh.length;
    if (first.length || left) yield { changes: first, left };
    if (signal.aborted) return;

    // Pass 1: hash the new files. A worker that has added to `pending` waits until its batch is taken.
    const pending: Update[] = [];
    let dirty = false, finished = false, stopped = false;
    let failure: { error: unknown } | undefined;
    let wake: (() => void) | undefined;
    const poke = () => { wake?.(); wake = undefined; };
    let waiting: (() => void)[] = [];
    const hashing = inTurns(fresh, NEW_FILES_AT_ONCE, async (path) => {
      if (stopped || signal.aborted) return;
      const file = await handles.get(path)!.getFile();
      const id = await hashFile(file);
      if (stopped || signal.aborted) return;
      left--;
      pending.push(...scan.see({ path, id, stamp: this.stampOf(file) }));
      dirty = true;
      poke();
      await new Promise<void>((resolve) => waiting.push(resolve));
    }, signal);
    hashing.then(() => { finished = true; poke(); }, (error) => { failure = { error }; finished = true; poke(); });
    try {
      while (true) {
        if (!dirty && !finished) await new Promise<void>((resolve) => { wake = resolve; });
        if (signal.aborted) return;
        if (!dirty) break;
        const batch = { changes: pending.splice(0), left };
        dirty = false;
        const taking = waiting;
        waiting = [];
        yield batch;
        taking.forEach((resolve) => resolve());
        if (signal.aborted) return;
      }
    } finally {
      stopped = true;
      waiting.forEach((resolve) => resolve());
    }
    if (failure) throw failure.error;

    // Only now can a file deleted be told from one moved.
    const gone = scan.finish();
    if (gone.length) yield { changes: gone, left: 0 };

    // Pass 2: the trusted files, one at a time (each `getFile()` is a request to Android's storage framework).
    for (const path of checked) {
      if (signal.aborted) return;
      let file: File;
      try {
        file = await handles.get(path)!.getFile();
      } catch (e) {
        if (e instanceof DOMException && e.name === 'NotFoundError') continue;
        throw e;
      }
      const was = trusted.get(path)!;
      const stamp = this.stampOf(file);
      if (was.stamp && _sameStamp(was.stamp, stamp)) continue;
      const id = await hashFile(file);
      // A newer scan has taken over: what it wrote is not to be written over.
      if (signal.aborted) return;
      const changes = scan.see({ path, id, stamp });
      if (changes.length) yield { changes, left: 0 };
    }
    if (!signal.aborted) this.hidden = scan.hidden();
  }
}
