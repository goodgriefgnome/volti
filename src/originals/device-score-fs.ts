// The device score filesystem: the linked scores folder (File System Access). Its handle (the only
// code that holds it), linking and unlinking it, asking for access to it, the listing remembered for
// while access is locked, the cache of its files' ids, and the Exports folder inside it that exported PDFs are written to.

import { keys } from '../storage/keys';
import { kv } from '../storage/kv';
import { hashFile } from './_filesystem-utils';
import type { Ids } from './_types';
import { NoAccess, type FolderState } from './types';

let dir: FileSystemDirectoryHandle | undefined;

/** The linked folder, if there is one. */
export const _linked = async () => (dir ??= await kv.get<FileSystemDirectoryHandle>(keys.folder));

export const canLinkFolder = () => 'showDirectoryPicker' in window;

export async function folderState(): Promise<FolderState> {
  const dir = await _linked();
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
  const dir = await _linked();
  if (!dir) return false;
  if ((await dir.requestPermission({ mode: 'readwrite' }).catch(() => 'denied')) === 'granted') return true;
  return (await dir.requestPermission({ mode: 'read' })) === 'granted';
}

/**
 * Make sure the root can be read (`read`) or changed too (`readwrite`), asking for access to a
 * linked folder where it isn't allowed yet (the app's own needs none). Asking works only from a
 * tap: elsewhere, or when it is refused, throws NoAccess.
 */
export async function _needAccess(mode: 'read' | 'readwrite'): Promise<void> {
  const dir = await _linked();
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
export interface _ListingEntry { path: string; id: string }

/** The linked folder's PDFs as last read; none while no folder is linked. */
export const _rememberedListing = async () => (await kv.get<_ListingEntry[]>(keys.folderListing)) ?? [];

/** Remember the root's PDFs, as just read, where it is a linked folder. */
export const _saveListing = async (listing: _ListingEntry[]) => { if (await _linked()) await kv.set(keys.folderListing, listing); };

/**
 * Note in the remembered listing that score `id`'s file is at `path` now (renamed or moved), or
 * with no `path`, that it is gone.
 */
export const _relist = async (id: string, path?: string) => {
  if (await _linked()) await kv.update<_ListingEntry[]>(keys.folderListing, (old) => (old ?? []).flatMap((e) => (e.id !== id ? [e] : path ? [{ ...e, path }] : [])));
};

/* ---------- exports ---------- */

/** The folder inside the linked folder that exported PDFs are written to. */
export const EXPORTS = 'Exports';

/** The exports folder, made if it isn't there yet; asks for write access (from a tap), or throws NoAccess. */
const exportsDir = async () => {
  const dir = await _linked();
  if (!dir) throw new Error('No folder linked');
  await _needAccess('readwrite');
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

/* ---------- its ids ---------- */

/** A file's id, good while its size and modified time stay the same. */
interface Hashed { size: number; modified: number; id: string }

/** The linked folder's ids by path in it. */
export type _HashCache = Record<string, Hashed>;

/**
 * The cache of the linked folder's ids. Other apps can change files there at any time, so an id is
 * trusted only while the file's size and modified time are as they were; otherwise it is read whole
 * again. Unlinking the folder doesn't clear it.
 */
class DeviceIds implements Ids {
  private constructor(private before: _HashCache, private now: _HashCache = {}) {}
  static async load() { return new DeviceIds((await kv.get<_HashCache>(keys.hashes)) ?? {}); }

  known(path: string, file: File): string | undefined {
    const was = this.before[path];
    return was && was.size === file.size && was.modified === file.lastModified ? was.id : undefined;
  }

  async id(path: string, file: File): Promise<string> {
    const id = this.known(path, file) ?? await hashFile(file);
    this.now[path] = { size: file.size, modified: file.lastModified, id };
    return id;
  }

  async remember(path: string, file: File, id: string) {
    await kv.update<_HashCache>(keys.hashes, (old) => ({ ...old, [path]: { size: file.size, modified: file.lastModified, id } }));
  }

  /** The old path's entry stays until the next listing drops it. */
  moved(_from: string, to: string, file: File, id: string) { return this.remember(to, file, id); }

  async forget() {}

  save() { return kv.set(keys.hashes, this.now); }
}

export const _deviceIds = (): Promise<Ids> => DeviceIds.load();
