// The device score filesystem: the linked scores folder (File System Access). Its handle (the only
// code that holds it), linking and unlinking it, and its root (_directory-handle-roots.ts), which
// everything else works on its files through. What it holds is in the records (_record-store.ts).

import { keys } from '../storage/keys';
import { kv } from '../storage/kv';
import { LinkedDirectoryHandleRoot } from './_directory-handle-roots';
import { _loadRecords, _records, _updateRecords } from './_record-store';
import type { ScoreRoot } from './_types';
import { FolderRefused, type FolderState } from './types';

/** What is stored under `folder`: the handle, kept after unlinking to tell whether a folder linked later is the same one. */
interface FolderLink { handle: FileSystemDirectoryHandle; linked: boolean }

let dir: FileSystemDirectoryHandle | undefined;
/** The root over `dir`: made again when another folder is linked, so one folder's hidden copies are never trusted in another. */
let root: LinkedDirectoryHandleRoot | undefined;

/** The linked folder, if there is one. */
export async function _linked(): Promise<FileSystemDirectoryHandle | undefined> {
  if (!dir) {
    const link = await storedLink();
    if (link?.linked) dir = link.handle;
  }
  return dir;
}

/** The linked folder's root, if there is one. */
export async function _linkedRoot(): Promise<ScoreRoot | undefined> {
  const d = await _linked();
  if (!d) return undefined;
  return (root ??= new LinkedDirectoryHandleRoot(d));
}

const storedLink = () => kv.get<FolderLink>(keys.folder);

/**
 * What a `folder` stored by version 2 of the stored data is in version 3: before records, it held
 * the bare handle of the linked folder, which becomes a linked FolderLink; anything else stays.
 */
export function _linkToVersion3(v: unknown): unknown {
  const bare = !!v && typeof v === 'object' && !('handle' in v) && (v as { kind?: unknown }).kind === 'directory';
  return bare ? { handle: v as FileSystemDirectoryHandle, linked: true } satisfies FolderLink : v;
}

/** Part of the step from version 2 to 3 of the stored data: a bare handle under `folder` becomes a FolderLink. */
export const folderToVersion3 = () => kv.update<unknown>(keys.folder, _linkToVersion3);

/** Whether a folder is linked, read afresh from storage: for the service worker, which has no state. */
export const _isLinked = async () => (await storedLink())?.linked === true;

export const canLinkFolder = () => 'showDirectoryPicker' in window;

export async function folderState(): Promise<FolderState> {
  const dir = await _linked();
  if (!dir) return { kind: 'none' };
  return (await (await _linkedRoot())!.access()) === 'ready' ? { kind: 'ready', name: dir.name } : { kind: 'locked', name: dir.name };
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
  root = undefined;
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

export async function unlinkFolder(): Promise<void> {
  dir = undefined;
  root = undefined;
  const old = await storedLink();
  if (old) await kv.set(keys.folder, { handle: old.handle, linked: false } satisfies FolderLink);
}
