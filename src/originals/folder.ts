// Folders: Volti's own folder in the origin private file system (OPFS), which is the library's root
// while no folder is linked (library-root.ts) and keeps the files left in it when one is, and the
// Exports folder in a linked folder.

import { walk } from './filesystem-utils';
import { linked, needAccess } from './library-root';

/** Volti's own folder in OPFS: the library's root while no folder is linked. */
export const opfsRoot = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('library', { create: true });

/**
 * The PDFs and images in Volti's own folder, by path, whether or not it is the root now: those
 * left there when a folder was linked.
 */
export async function appFiles(): Promise<{ path: string; file: File }[]> {
  const found: [string, FileSystemFileHandle][] = [];
  await walk(await opfsRoot(), '', 0, found);
  return Promise.all(found.map(async ([path, h]) => ({ path, file: await h.getFile() })));
}

/** Delete the file at `path` in Volti's own folder, as when it has been moved into the linked folder. */
export async function removeAppFile(path: string): Promise<void> {
  const parts = path.split('/');
  let d = await opfsRoot();
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
  await d.removeEntry(parts.at(-1)!);
}

/** How much room the files in Volti's own folder take, in bytes. */
export async function appRootBytes(): Promise<number> {
  const found: [string, FileSystemFileHandle][] = [];
  await walk(await opfsRoot(), '', 0, found);
  let n = 0;
  for (const [, h] of found) n += (await h.getFile()).size;
  return n;
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

/**
 * Write `name`.pdf into the exports folder, replacing one of that name. Asks for write access
 * (from a tap: exportExists is asked first), or throws NoAccess.
 */
export async function saveExport(name: string, data: Blob): Promise<void> {
  const w = await (await (await exportsDir()).getFileHandle(name.trim() + '.pdf', { create: true })).createWritable();
  await w.write(data);
  await w.close();
}
