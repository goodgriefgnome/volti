// Volti's own folder in the origin private file system (OPFS), which is the library's root while no
// folder is linked (library-files.ts) and keeps the files left in it when one is.

import { walk } from './filesystem-utils';

/** Volti's own folder in OPFS: the library's root while no folder is linked. */
export const opfsRoot = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('library', { create: true });

/**
 * The PDFs and images in Volti's own folder, by path, whether or not it is the root now: those
 * left there when a folder was linked.
 */
export async function internalFiles(): Promise<{ path: string; file: File }[]> {
  const found: [string, FileSystemFileHandle][] = [];
  await walk(await opfsRoot(), '', 0, found);
  return Promise.all(found.map(async ([path, h]) => ({ path, file: await h.getFile() })));
}

/** Delete the file at `path` in Volti's own folder, as when it has been moved into the linked folder. */
export async function removeInternalFile(path: string): Promise<void> {
  const parts = path.split('/');
  let d = await opfsRoot();
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
  await d.removeEntry(parts.at(-1)!);
}

/** How much room the files in Volti's own folder take, in bytes. */
export async function internalBytes(): Promise<number> {
  const found: [string, FileSystemFileHandle][] = [];
  await walk(await opfsRoot(), '', 0, found);
  let n = 0;
  for (const [, h] of found) n += (await h.getFile()).size;
  return n;
}
