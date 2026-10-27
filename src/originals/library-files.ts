// Source files over the library's root: the linked scores folder (device-score-fs.ts) when there is
// one, and Volti's own folder in OPFS (internal-score-fs.ts) when there isn't. Both are folders with
// true paths, read the same way. A file in the root is a source file that can be moved (renamed, or
// into another folder) and removed (into Recently removed), asking for the access that needs. Also
// listing the root's files, known by the hash of their contents.

import { keys, kv } from '../storage';
import { linked, needAccess, relist, rememberedListing, saveListing } from './device-score-fs';
import { walk } from './filesystem-utils';
import { Hasher, rememberHash } from './hashes';
import { opfsRoot } from './internal-score-fs';
import type { Readable } from './internal-types';
import { readOriginal } from './original';
import { byTitle, folderOf, nameOf, shownFolder, tidyPath, titleOf, unfoundName } from './path-utils';
import { forgetRemoved, keepRemoved } from './trash-fs';
import type { AskPassword, FolderState, Original, SourceFile } from './types';

/** Where a file in the root is, for remembering its hash: the linked folder's and the app's are kept apart. */
const whereIs = async (path: string) => ((await linked()) ? 'folder/' : 'app/') + path;

/** Note the id of a file at `path` in the root whose contents are known, such as one just renamed or added, so it isn't read again. */
export async function rememberId(path: string, file: File, id: string) {
  await rememberHash(await whereIs(path), file, id);
}

/** The library's root: the linked folder, or the app's own. Access to a linked one must be allowed. */
async function root(): Promise<FileSystemDirectoryHandle> {
  return (await linked()) ?? opfsRoot();
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
export async function makeFolder(path: string): Promise<FileSystemDirectoryHandle> {
  let d = await root();
  for (const p of path ? path.split('/') : []) d = await d.getDirectoryHandle(p, { create: true });
  return d;
}

/** The PDFs and images in the root, read now, by path; access must be granted. */
export async function folderFiles(): Promise<{ path: string; file: File }[]> {
  const found: [string, FileSystemFileHandle][] = [];
  await walk(await root(), '', 0, found);
  return Promise.all(found.map(async ([path, h]) => ({ path, file: await h.getFile() })));
}

/* ---------- its files ---------- */

/** A file at its path in the library's root. */
class LibraryFile implements Readable {
  constructor(readonly id: string, public path: string) {}

  async file(): Promise<File> {
    await needAccess('read');
    return fileAt(this.path);
  }

  read(ask?: AskPassword): Promise<Original> {
    return readOriginal(this, ask);
  }

  async move(path: string): Promise<string | null> {
    const to = tidyPath(path);
    if (to === this.path) return null;
    const unfound = unfoundName(to);
    if (unfound) return unfound;
    return this.moveInRoot(to);
  }

  /** There is a file called `name` where it is being moved. */
  private taken(name: string, folder: string) {
    return folder === folderOf(this.path) ? `There is already a file called “${name}” there.` : `There is already a file called “${name}” in ${shownFolder(folder)}.`;
  }

  private async moveInRoot(to: string): Promise<string | null> {
    await needAccess('readwrite');
    const [from, old] = await placeOf(this.path);
    const folder = folderOf(to), name = nameOf(to);
    const into = folder === folderOf(this.path) ? from : await makeFolder(folder);
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
          : `Copied it into ${shownFolder(folder)}, but couldn't delete it here. Delete it in the Files app.`;
      }
    }
    // The same contents, so the same id: no need to read it again.
    await rememberId(now, await (await into.getFileHandle(name)).getFile(), this.id);
    await relist(this.id, now);
    this.path = now;
    return null;
  }

  async remove(): Promise<void> {
    await needAccess('readwrite');
    const [d, name] = await placeOf(this.path);
    const key = await keepRemoved(this.id, this.path, await (await d.getFileHandle(name)).getFile());
    try {
      await d.removeEntry(name);
    } catch (e) {
      // Still in the library: not removed after all.
      await forgetRemoved(key);
      throw e;
    }
    await relist(this.id);
  }
}

/** Each id's file in the root. */
const made = new Map<string, LibraryFile>();

/** The file in the root with id `id` at `path`: the one already made for it, brought up to date. */
export function sourceFileOf(id: string, path: string): SourceFile {
  let o = made.get(id);
  if (!o) made.set(id, (o = new LibraryFile(id, path)));
  else o.path = path;
  return o;
}

/** Every file's title as last seen, by id: for a score whose file can't be found. */
export const knownTitles = async () => (await kv.get<Record<string, string>>(keys.titles)) ?? {};

/**
 * Hears the files known so far while new or changed files are read, and how many are `left`
 * to read.
 */
type Progress = (originals: SourceFile[], left: number) => void;

/**
 * The library's files, sorted by title: the same SourceFile for an id as before; two of the same file show
 * the first. Files new or changed since last time are hashed, which reads them whole, one at a
 * time; `progress` hears the files known so far before the first and after each. While the
 * linked folder is locked, its PDFs are the ones remembered.
 */
export async function libraryFiles(state: FolderState, progress?: Progress): Promise<SourceFile[]> {
  const hasher = await Hasher.load();
  const locked = state.kind === 'locked';
  const remembered = locked ? await rememberedListing() : [];
  const files = locked ? [] : await folderFiles();
  const where = await Promise.all(files.map((f) => whereIs(f.path)));
  const ids = new Map<string, string>();
  const known = () => {
    const seen = new Map<string, string>();
    for (const e of [...remembered, ...files.filter((f) => ids.has(f.path)).map((f) => ({ id: ids.get(f.path)!, path: f.path }))]) if (!seen.has(e.id)) seen.set(e.id, e.path);
    return [...seen].map(([id, path]) => sourceFileOf(id, path)).sort(byTitle);
  };
  const fresh: number[] = [];
  for (const [i, f] of files.entries()) {
    if (hasher.known(where[i], f.file)) ids.set(f.path, await hasher.id(where[i], f.file)); else fresh.push(i);
  }
  for (const [n, i] of fresh.entries()) {
    if (n === 0) progress?.(known(), fresh.length);
    ids.set(files[i].path, await hasher.id(where[i], files[i].file));
    progress?.(known(), fresh.length - n - 1);
  }
  if (!locked) await saveListing(files.map((f) => ({ path: f.path, id: ids.get(f.path)! })));
  // The hashes of the root not read this time are kept: the app's while a folder is linked, and the other way round.
  await hasher.save(locked ? ['folder/', 'app/'] : [state.kind === 'none' ? 'folder/' : 'app/']);
  const found = known();
  await kv.update<Record<string, string>>(keys.titles, (old) => ({ ...old, ...Object.fromEntries(found.map((f) => [f.id, titleOf(f.path)])) }));
  return found;
}
