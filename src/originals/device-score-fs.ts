// The device side of the scores folder (File System Access): picking a folder, asking for access
// to it, and its root (_directory-handle-roots.ts), which everything else works on its files
// through. The link itself, and which kind is linked, is linked-folder.ts's.

import { keys } from '../storage/keys';
import { kv } from '../storage/kv';
import { LinkedDirectoryHandleRoot } from './_directory-handle-roots';
import { FolderRefused } from './types';

export const canLinkFolder = () => 'showDirectoryPicker' in window;

/** The root over `handle`: made again for another handle, so one folder's hidden copies are never trusted in another. */
let root: LinkedDirectoryHandleRoot | undefined;
let rootOf: FileSystemDirectoryHandle | undefined;
export function _deviceRoot(handle: FileSystemDirectoryHandle): LinkedDirectoryHandleRoot {
  if (rootOf !== handle) { root = new LinkedDirectoryHandleRoot(handle); rootOf = handle; }
  return root!;
}

/** Must be called from a tap. Asks to change files too (renaming, exports), so that's asked once. Null when cancelled; throws FolderRefused. */
export async function _pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await window.showDirectoryPicker({ id: 'volti-scores', mode: 'readwrite' });
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return null;
    throw new FolderRefused('Android blocks the Download folder itself and the top of internal storage; pick a folder inside them, such as Download/Scores.', { cause: e });
  }
}

/**
 * Must be called from a tap. Asks to change files as well as read them, so renaming and exporting
 * don't ask again this session; when that is refused, asks to read them only.
 */
export async function _unlockDevice(handle: FileSystemDirectoryHandle): Promise<boolean> {
  if ((await handle.requestPermission({ mode: 'readwrite' }).catch(() => 'denied')) === 'granted') return true;
  return (await handle.requestPermission({ mode: 'read' })) === 'granted';
}

/** What a `folder` stored by version 2 of the stored data held: a handle and whether it is linked. */
interface LinkV3 { handle: FileSystemDirectoryHandle; linked: boolean }

/**
 * What a `folder` stored by version 2 of the stored data is in version 3: before records, it held
 * the bare handle of the linked folder, which becomes a linked link; anything else stays.
 */
export function _linkToVersion3(v: unknown): unknown {
  const bare = !!v && typeof v === 'object' && !('handle' in v) && (v as { kind?: unknown }).kind === 'directory';
  return bare ? { handle: v as FileSystemDirectoryHandle, linked: true } satisfies LinkV3 : v;
}

/** Part of the step from version 2 to 3 of the stored data: a bare handle under `folder` becomes a link. */
export const folderToVersion3 = () => kv.update<unknown>(keys.folder, _linkToVersion3);
