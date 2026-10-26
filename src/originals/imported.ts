// The copies of PDFs and images imported into the app (the origin private file system): adding them, from the
// file picker or shared from other apps, listing and removing them, and the subfolder each is
// filed under in the library.

import { keys, kv } from '../storage';
import { rememberedListing } from './folder';
import { hashBytes, Hasher } from './hashes';
import { takeInbox } from './inbox';
import { freeName, importName, isOriginalFile, tidyFolder, titleOf } from './names';
import type { Found, Original } from './originals';

export const importsDir = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('imported', { create: true });

/**
 * Keep copies of PDFs in the app. A file the library already has, in the folder or imported, isn't
 * copied again: `already` has their titles.
 */
export async function importFiles(files: Iterable<File>): Promise<{ added: number; already: string[] }> {
  const d = await importsDir();
  const hasher = await Hasher.load();
  const imported = await importedOriginals(hasher);
  const listed = await rememberedListing();
  const have = new Set([...imported.map((o) => o.id), ...listed.map((e) => e.id)]);
  const taken = new Set(imported.map((o) => o.path.toLowerCase()));
  let added = 0;
  const already: string[] = [];
  for (const f of files) {
    if (!isOriginalFile(f)) continue;
    // Read once: on Android a picked file may not be readable a second time.
    const bytes = await f.arrayBuffer();
    const id = await hashBytes(bytes);
    if (have.has(id)) { already.push(titleOf(importName(f.name, f.type))); continue; }
    const name = freeName(importName(f.name, f.type), taken);
    const h = await d.getFileHandle(name, { create: true });
    try {
      const w = await h.createWritable();
      await w.write(bytes);
      await w.close();
    } catch (e) {
      await d.removeEntry(name).catch(() => {});
      throw e;
    }
    await hasher.id('imported/' + name, await h.getFile());
    have.add(id);
    taken.add(name.toLowerCase());
    added++;
  }
  await hasher.save('folder/');
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

export async function removeImported(o: Original): Promise<void> {
  const d = await importsDir();
  await d.removeEntry(o.path);
}

/** File an imported original under a subfolder in the library ('' for none). The file stays where it is. */
export async function fileAdded(o: Original, folder: string): Promise<void> {
  const path = tidyFolder(folder);
  await kv.update<Record<string, string>>(keys.addedFolders, (old) => {
    const { [o.id]: _, ...rest } = old ?? {};
    return path ? { ...rest, [o.id]: path } : rest;
  });
}

/** The copies imported into the app. Empty ones, which failed to be written as they were added, are deleted. */
export async function importedFiles(): Promise<Found[]> {
  const filed = (await kv.get<Record<string, string>>(keys.addedFolders)) ?? {};
  const d = await importsDir();
  const files: Found[] = [];
  for await (const [name, h] of d.entries()) {
    if (h.kind !== 'file') continue;
    const handle = h as FileSystemFileHandle, file = await handle.getFile();
    if (!file.size) { await d.removeEntry(name).catch(() => {}); continue; }
    files.push({
      where: 'imported/' + name,
      file,
      make: (id) => ({ id, title: titleOf(name), folder: filed[id] ?? '', location: 'imported', path: name, getFile: () => handle.getFile() }),
    });
  }
  return files;
}

/** The imported copies, with their ids. */
async function importedOriginals(hasher: Hasher): Promise<Original[]> {
  return Promise.all((await importedFiles()).map(async (f) => f.make(await hasher.id(f.where, f.file))));
}
