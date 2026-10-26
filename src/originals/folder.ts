// The library's root: the linked scores folder (File System Access) when there is one, and the
// app's own folder in the origin private file system (OPFS) when there isn't. Both are folders with
// true paths, read the same way; what differs is the root's: linking a folder, asking for access to
// it, and the listing remembered for while access is locked. Also the Exports folder in a linked
// folder. The only code that holds the folder's handle.

import { keys, kv } from '../storage';
import { isOriginalName } from './names';

export type FolderState =
  | { kind: 'none' }
  | { kind: 'ready'; name: string }
  | { kind: 'locked'; name: string }; // linked, but needs a tap to allow access this session

const MAX_DEPTH = 4;

let dir: FileSystemDirectoryHandle | undefined;

/** The library's root in OPFS, used while no folder is linked. */
const appRoot = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('library', { create: true });

/** The linked folder, if there is one. */
const linked = async () => (dir ??= await kv.get<FileSystemDirectoryHandle>(keys.folder));

/** The library's root: the linked folder, or the app's own. Access to a linked one must be allowed. */
async function root(): Promise<FileSystemDirectoryHandle> {
  return (await linked()) ?? appRoot();
}

/** Where a file in the root is, for remembering its hash: the linked folder's and the app's are kept apart. */
export const whereIs = async (path: string) => ((await linked()) ? 'folder/' : 'app/') + path;

export const canLinkFolder = () => 'showDirectoryPicker' in window;

export async function folderState(): Promise<FolderState> {
  const dir = await linked();
  if (!dir) return { kind: 'none' };
  const perm = await dir.queryPermission({ mode: 'read' });
  return perm === 'granted' ? { kind: 'ready', name: dir.name } : { kind: 'locked', name: dir.name };
}

/** Must be called from a tap. Asks to change files too (renaming, exports), so that's asked once. */
export async function linkFolder(): Promise<boolean> {
  try {
    dir = await window.showDirectoryPicker({ id: 'volti-scores', mode: 'readwrite' });
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return false;
    throw e;
  }
  await kv.set(keys.folder, dir);
  return true;
}

/**
 * Must be called from a tap. Asks to change files as well as read them, so renaming and exporting
 * don't ask again this session; when that is refused, asks to read them only.
 */
export async function unlockFolder(): Promise<boolean> {
  const dir = await linked();
  if (!dir) return false;
  if ((await dir.requestPermission({ mode: 'readwrite' }).catch(() => 'denied')) === 'granted') return true;
  return (await dir.requestPermission({ mode: 'read' })) === 'granted';
}

/** The scores folder can't be read, or changed, as access to it isn't allowed. */
export class NoAccess extends Error {
  name = 'NoAccess';
}

/**
 * Make sure the root can be read (`read`) or changed too (`readwrite`), asking for access to a
 * linked folder where it isn't allowed yet (the app's own needs none). Asking works only from a
 * tap: elsewhere, or when it is refused, throws NoAccess.
 */
export async function needAccess(mode: 'read' | 'readwrite'): Promise<void> {
  const dir = await linked();
  if (!dir) return;
  if ((await dir.queryPermission({ mode })) === 'granted') return;
  if ((await dir.requestPermission({ mode }).catch(() => 'denied')) !== 'granted') throw new NoAccess(`No access to the scores folder (${mode})`);
}

export async function unlinkFolder(): Promise<void> {
  dir = undefined;
  await kv.del(keys.folder);
  await kv.del(keys.folderListing);
}

/** A PDF in the linked folder, as last read: listed from this while access is locked. */
interface ListingEntry { path: string; id: string }

async function walk(d: FileSystemDirectoryHandle, prefix: string, depth: number, out: [string, FileSystemFileHandle][]) {
  for await (const [name, h] of d.entries()) {
    if (name.startsWith('.')) continue;
    if (h.kind === 'file' && isOriginalName(name)) out.push([prefix + name, h as FileSystemFileHandle]);
    else if (h.kind === 'directory' && depth < MAX_DEPTH) await walk(h as FileSystemDirectoryHandle, `${prefix}${name}/`, depth + 1, out);
  }
}

/** The file at `path` in the root. Access must be allowed. */
export async function fileAt(path: string): Promise<File> {
  const [d, name] = await placeOf(path);
  return (await d.getFileHandle(name)).getFile();
}

/** The folder a path in the root is in, and the file's name. */
export async function placeOf(path: string): Promise<[FileSystemDirectoryHandle, string]> {
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

/* ---------- exports ---------- */

/** The folder inside the linked folder that exported PDFs are written to. */
export const EXPORTS = 'Exports';

/** The exports folder, made if it isn't there yet; asks for write access (from a tap), or throws NoAccess. */
const exportsDir = async () => {
  const dir = await linked();
  if (!dir) throw new Error('No folder linked');
  await needAccess('readwrite');
  return dir.getDirectoryHandle(EXPORTS, { create: true });
};

/** Whether `name`.pdf is in the exports folder. Asks for write access (from a tap), or throws NoAccess. */
export async function exportExists(name: string): Promise<boolean> {
  return (await exportsDir()).getFileHandle(name.trim() + '.pdf').then(() => true, () => false);
}

/** Write a new file `name` in `d`, or over the one of that name; one that fails part way is deleted. */
export async function writeFile(d: FileSystemDirectoryHandle, name: string, data: Blob | ArrayBuffer) {
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
 * The PDFs and images in the app's own root, by path, whether or not it is the root now: those
 * left there when a folder was linked.
 */
export async function appFiles(): Promise<{ path: string; file: File }[]> {
  const found: [string, FileSystemFileHandle][] = [];
  await walk(await appRoot(), '', 0, found);
  return Promise.all(found.map(async ([path, h]) => ({ path, file: await h.getFile() })));
}

/** Delete the file at `path` in the app's own root, as when it has been moved into the linked folder. */
export async function removeAppFile(path: string): Promise<void> {
  const parts = path.split('/');
  let d = await appRoot();
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
  await d.removeEntry(parts.at(-1)!);
}

/** How much room the files in the app's own root take, in bytes. */
export async function appRootBytes(): Promise<number> {
  const found: [string, FileSystemFileHandle][] = [];
  await walk(await appRoot(), '', 0, found);
  let n = 0;
  for (const [, h] of found) n += (await h.getFile()).size;
  return n;
}

/**
 * Write `name`.pdf into the exports folder, replacing one of that name. Asks for write access
 * (from a tap: exportExists is asked first), or throws NoAccess.
 */
export async function saveExport(name: string, data: Blob): Promise<void> {
  const w = await (await (await exportsDir()).getFileHandle(name.trim() + '.pdf', { create: true })).createWritable();
  await w.write(data);
  await w.close();
}

/** The linked folder's PDFs as last read; none while no folder is linked. */
export const rememberedListing = async () => (await kv.get<ListingEntry[]>(keys.folderListing)) ?? [];

/** Remember the root's PDFs, as just read, where it is a linked folder. */
export const saveListing = async (listing: ListingEntry[]) => { if (await linked()) await kv.set(keys.folderListing, listing); };

/**
 * Note in the remembered listing that score `id`'s file is at `path` now (renamed or moved), or
 * with no `path`, that it is gone.
 */
export const relist = async (id: string, path?: string) => {
  if (await linked()) await kv.update<ListingEntry[]>(keys.folderListing, (old) => (old ?? []).flatMap((e) => (e.id !== id ? [e] : path ? [{ ...e, path }] : [])));
};
