// The linked scores folder (File System Access): linking it, asking for access to it, finding the
// PDFs in it and its subfolders, the listing remembered for while access is locked, and the Exports
// folder in it. The only code that holds the folder's handle.

import { keys } from '../storage/keys';
import { kv } from '../storage/kv';
import { isOriginalName, titleOf } from './names';
import type { Found, Original } from './originals';

export type FolderState =
  | { kind: 'none' }
  | { kind: 'ready'; name: string }
  | { kind: 'locked'; name: string }; // linked, but needs a tap to allow access this session

const MAX_DEPTH = 4;

let dir: FileSystemDirectoryHandle | undefined;

export const canLinkFolder = () => 'showDirectoryPicker' in window;

export async function folderState(): Promise<FolderState> {
  dir ??= await kv.get<FileSystemDirectoryHandle>(keys.folder);
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
  if (!dir) return false;
  if ((await dir.requestPermission({ mode: 'readwrite' }).catch(() => 'denied')) === 'granted') return true;
  return (await dir.requestPermission({ mode: 'read' })) === 'granted';
}

/** Ask to change files in the linked folder as well as read them. Must be called from a tap. */
export async function allowWriting(): Promise<boolean> {
  if (!dir) return false;
  if ((await dir.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await dir.requestPermission({ mode: 'readwrite' })) === 'granted';
}

export async function unlinkFolder(): Promise<void> {
  dir = undefined;
  await kv.del(keys.folder);
  await kv.del(keys.folderListing);
}

/** A PDF in the linked folder, as last read: listed from this while access is locked. */
export interface ListingEntry { path: string; id: string }

async function walk(d: FileSystemDirectoryHandle, prefix: string, depth: number, out: [string, FileSystemFileHandle][]) {
  for await (const [name, h] of d.entries()) {
    if (name.startsWith('.')) continue;
    if (h.kind === 'file' && isOriginalName(name)) out.push([prefix + name, h as FileSystemFileHandle]);
    else if (h.kind === 'directory' && depth < MAX_DEPTH) await walk(h as FileSystemDirectoryHandle, `${prefix}${name}/`, depth + 1, out);
  }
}

async function fileAt(path: string): Promise<File> {
  const [d, name] = await placeOf(path);
  return (await d.getFileHandle(name)).getFile();
}

/** The folder a path in the linked folder is in, and the file's name. */
export async function placeOf(path: string): Promise<[FileSystemDirectoryHandle, string]> {
  if (!dir) throw new Error('No folder linked');
  const parts = path.split('/');
  let d = dir;
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
  return [d, parts.at(-1)!];
}

/**
 * The subfolder `path` of the linked folder ('' for the folder itself), making the folders on it
 * that aren't there yet. Write access must have been allowed.
 */
export async function makeFolder(path: string): Promise<FileSystemDirectoryHandle> {
  if (!dir) throw new Error('No folder linked');
  let d = dir;
  for (const p of path ? path.split('/') : []) d = await d.getDirectoryHandle(p, { create: true });
  return d;
}

export function folderOriginal({ path, id }: ListingEntry): Original {
  const slash = path.lastIndexOf('/');
  return {
    id,
    title: titleOf(path.slice(slash + 1)),
    folder: slash < 0 ? '' : path.slice(0, slash),
    location: 'folder',
    path,
    getFile: () => fileAt(path),
  };
}

/** The PDFs in the linked folder, read now; access must be granted. */
export async function folderFiles(): Promise<Found[]> {
  const found: [string, FileSystemFileHandle][] = [];
  await walk(dir!, '', 0, found);
  return Promise.all(found.map(async ([path, h]) => ({ where: 'folder/' + path, file: await h.getFile(), make: (id: string) => folderOriginal({ path, id }) })));
}

/* ---------- exports ---------- */

/** The folder inside the linked folder that exported PDFs are written to. */
export const EXPORTS = 'Exports';

const exportsDir = async () => {
  if (!dir) throw new Error('No folder linked');
  return dir.getDirectoryHandle(EXPORTS, { create: true });
};

/** Whether `name`.pdf is in the exports folder. Write access must have been allowed. */
export async function exportExists(name: string): Promise<boolean> {
  return (await exportsDir()).getFileHandle(name.trim() + '.pdf').then(() => true, () => false);
}

/** Write `name`.pdf into the exports folder, replacing one of that name. Write access must have been allowed. */
export async function saveExport(name: string, data: Blob): Promise<void> {
  const w = await (await (await exportsDir()).getFileHandle(name.trim() + '.pdf', { create: true })).createWritable();
  await w.write(data);
  await w.close();
}

/** The linked folder's PDFs as last read. */
export const rememberedListing = async () => (await kv.get<ListingEntry[]>(keys.folderListing)) ?? [];

export const saveListing = (listing: ListingEntry[]) => kv.set(keys.folderListing, listing);

/** Note in the remembered listing that score `id`'s file is at `path` now (renamed or moved). */
export const relist = (id: string, path: string) =>
  kv.update<ListingEntry[]>(keys.folderListing, (old) => (old ?? []).map((e) => (e.id === id ? { ...e, path } : e)));
