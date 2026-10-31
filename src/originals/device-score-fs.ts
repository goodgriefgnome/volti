// The device score filesystem: the linked scores folder (File System Access). Its handle (the only
// code that holds it), linking and unlinking it, asking for access to it, and the Exports folder
// inside it that exported PDFs are written to. What it holds is in the records (_record-store.ts).

import { keys } from '../storage/keys';
import { kv } from '../storage/kv';
import { _loadRecords, _records, _updateRecords } from './_record-store';
import { FolderRefused, NoAccess, type FolderState } from './types';

/** What is stored under `folder`: the handle, kept after unlinking to tell whether a folder linked later is the same one. */
interface FolderLink { handle: FileSystemDirectoryHandle; linked: boolean }

let dir: FileSystemDirectoryHandle | undefined;

/** The linked folder, if there is one. */
export async function _linked(): Promise<FileSystemDirectoryHandle | undefined> {
  if (!dir) {
    const link = await storedLink();
    if (link?.linked) dir = link.handle;
  }
  return dir;
}

/**
 * What is stored under `folder`, as a FolderLink. Before records, it held the bare handle of the
 * linked folder: that reads as linked.
 */
export function _asLink(v: unknown): FolderLink | undefined {
  if (!v || typeof v !== 'object') return undefined;
  if ('handle' in v) return v as FolderLink;
  if ((v as { kind?: unknown }).kind === 'directory') return { handle: v as FileSystemDirectoryHandle, linked: true };
  return undefined;
}

const storedLink = async () => _asLink(await kv.get<unknown>(keys.folder));

/** Whether a folder is linked, read afresh from storage: for the service worker, which has no state. */
export const _isLinked = async () => (await storedLink())?.linked === true;

export const canLinkFolder = () => 'showDirectoryPicker' in window;

export async function folderState(): Promise<FolderState> {
  const dir = await _linked();
  if (!dir) return { kind: 'none' };
  const perm = await dir.queryPermission({ mode: 'read' });
  return perm === 'granted' ? { kind: 'ready', name: dir.name } : { kind: 'locked', name: dir.name };
}

/** Must be called from a tap. Asks to change files too (renaming, exports), so that's asked once. */
export async function linkFolder(): Promise<boolean> {
  let picked: FileSystemDirectoryHandle;
  try {
    picked = await window.showDirectoryPicker({ id: 'volti-scores', mode: 'readwrite' });
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return false;
    throw new FolderRefused(`The folder picker failed: ${(e as Error).message}`);
  }
  // The same folder as before keeps its records, so nothing is hashed again; another folder's files are not these.
  const old = await storedLink();
  if (!(old && (await old.handle.isSameEntry(picked).catch(() => false)))) {
    await _loadRecords();
    await _updateRecords([..._records()].filter(([, r]) => r.where.kind === 'folder')
      .map(([id]) => [id, (r) => (r?.where.kind === 'folder' ? { ...r, where: { kind: 'gone' } } : r)]));
  }
  await kv.set(keys.folder, { handle: picked, linked: true } satisfies FolderLink);
  dir = picked;
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

/** Whether the root can be read without asking: always the app's own, a linked folder once access is allowed. */
export async function _canRead(): Promise<boolean> {
  const dir = await _linked();
  return !dir || (await dir.queryPermission({ mode: 'read' })) === 'granted';
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
  const old = await storedLink();
  if (old) await kv.set(keys.folder, { handle: old.handle, linked: false } satisfies FolderLink);
}

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
