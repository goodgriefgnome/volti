// The scores added to Volti, kept in the app (the origin private file system): adding them, from the
// file picker or shared from other apps, listing, filing and removing them. Each file is kept under
// its id (the SHA-256 of its contents), and where it is in the library, its path ("Masses/Mass.pdf"),
// is kept by id in the kv store, so moving or renaming one changes only that. Added scores kept the
// old way, under their names and filed by a label, are moved over to this once.

import { keys, kv } from '../storage';
import { rememberedListing } from './folder';
import { hashBytes, Hasher } from './hashes';
import { takeInbox } from './inbox';
import { freeName, importName, isOriginalFile, titleOf } from './names';

const importsDir = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('imported', { create: true });

/** An added file's name: its id. */
const ID = /^[0-9a-f]{64}$/;

/** Where each added score is in the library, by id. */
type Paths = Record<string, string>;
const loadPaths = async () => (await kv.get<Paths>(keys.addedPaths)) ?? {};
const setPath = (id: string, path: string) => kv.update<Paths>(keys.addedPaths, (old) => ({ ...old, [id]: path }));

/** An added score: its id, and where it is in the library. */
export interface Added { id: string; path: string }

/** Moving the added scores kept the old way over, once a session; tried again next time if it fails. */
let movedOver: Promise<void> | undefined;
const moveOver = () => (movedOver ??= keepByIds().catch((e) => { movedOver = undefined; console.warn('Could not move the added scores over:', e); }));

/**
 * Rename each added file kept the old way (under its name, filed by a label) to its id, noting its
 * path first: its label's folder and its name. A file that is there under its id already, a second
 * copy, is deleted. Safe to run again after stopping part way.
 */
async function keepByIds() {
  const d = await importsDir();
  const old: [string, FileSystemFileHandle][] = [];
  for await (const [name, h] of d.entries()) if (h.kind === 'file' && !ID.test(name)) old.push([name, h as FileSystemFileHandle]);
  if (old.length) {
    const filed = (await kv.get<Record<string, string>>(keys.addedFolders)) ?? {};
    // Their hashes as worked out before, where they haven't changed: so they aren't read again.
    const hasher = await Hasher.load();
    for (const [name, h] of old) {
      const file = await h.getFile();
      if (!file.size) { await d.removeEntry(name).catch(() => {}); continue; }
      const id = await hasher.id('imported/' + name, file);
      if (await d.getFileHandle(id).then(() => true, () => false)) { await d.removeEntry(name); continue; }
      await setPath(id, (filed[id] ? filed[id] + '/' : '') + name);
      await moveFile(d, h, name, id);
    }
  }
  await kv.del(keys.addedFolders);
}

/** Rename a file in `d`; where it can't be, copy it under the new name, then delete it. */
async function moveFile(d: FileSystemDirectoryHandle, h: FileSystemFileHandle, from: string, to: string) {
  if (h.move && (await h.move(to).then(() => true, () => false))) return;
  await write(d, to, await h.getFile());
  await d.removeEntry(from);
}

/** Write a new file `name` in `d`; one that fails part way is deleted. */
async function write(d: FileSystemDirectoryHandle, name: string, data: Blob | ArrayBuffer) {
  const h = await d.getFileHandle(name, { create: true });
  try {
    const w = await h.createWritable();
    await w.write(data);
    await w.close();
  } catch (e) {
    await d.removeEntry(name).catch(() => {});
    throw e;
  }
}

/**
 * The added scores. Empty files, which failed to be written as they were added, are deleted; a
 * file with no path noted (which nothing should leave) is at the top, under its id.
 */
export async function addedScores(): Promise<Added[]> {
  await moveOver();
  const d = await importsDir();
  const paths = await loadPaths();
  const added: Added[] = [];
  for await (const [id, h] of d.entries()) {
    if (h.kind !== 'file' || !ID.test(id)) continue;
    if (!(await (h as FileSystemFileHandle).getFile()).size) { await d.removeEntry(id).catch(() => {}); continue; }
    added.push({ id, path: paths[id] ?? id });
  }
  return added;
}

/** An added score's file. */
export const addedFile = async (id: string) => (await (await importsDir()).getFileHandle(id)).getFile();

/** File added score `id` at `path` in the library. The file stays where it is. */
export const fileAdded = (id: string, path: string) => setPath(id, path);

/** Delete an added score: its file, then where it was. */
export async function removeAdded(id: string): Promise<void> {
  await (await importsDir()).removeEntry(id);
  await kv.update<Paths>(keys.addedPaths, (old) => {
    const { [id]: _, ...rest } = old ?? {};
    return rest;
  });
}

/**
 * Keep copies of PDFs and images in the app, at the top of the library. A file the library already
 * has, in the folder or added, isn't copied again: `already` has their titles. Each one's path is
 * noted before its file is written, so a file is never without one.
 */
export async function importFiles(files: Iterable<File>): Promise<{ added: number; already: string[] }> {
  const d = await importsDir();
  const scores = await addedScores();
  const listed = await rememberedListing();
  const have = new Set([...scores.map((s) => s.id), ...listed.map((e) => e.id)]);
  const taken = new Set(scores.filter((s) => !s.path.includes('/')).map((s) => s.path.toLowerCase()));
  let added = 0;
  const already: string[] = [];
  for (const f of files) {
    if (!isOriginalFile(f)) continue;
    // Read once: on Android a picked file may not be readable a second time.
    const bytes = await f.arrayBuffer();
    const id = await hashBytes(bytes);
    if (have.has(id)) { already.push(titleOf(importName(f.name, f.type))); continue; }
    const path = freeName(importName(f.name, f.type), taken);
    await setPath(id, path);
    await write(d, id, bytes);
    have.add(id);
    taken.add(path.toLowerCase());
    added++;
  }
  return { added, already };
}

export async function importShared(): Promise<number> {
  const files = await takeInbox();
  return files.length ? (await importFiles(files)).added : 0;
}

/** How much room the imported copies take, in bytes. */
export async function importedBytes(): Promise<number> {
  let n = 0;
  for await (const [, h] of (await importsDir()).entries()) if (h.kind === 'file') n += (await (h as FileSystemFileHandle).getFile()).size;
  return n;
}
