// The linked scores folder, of either kind: the link under `folder` (_folder-link.ts), linking and
// unlinking, its state, and its root; each kind's own work is in device-score-fs.ts and
// drive-score-fs.ts.

import { _storedLink, _storeLink, type FolderLink } from './_folder-link';
import { _loadRecords, _records, _updateRecords } from './_record-store';
import type { ScoreRoot } from './_types';
import { _deviceRoot, _pickFolder, _unlockDevice } from './device-score-fs';
import type { FolderState } from './types';

/** The link, read once; undefined before it is read (`read` tells), and when there is none. */
let link: FolderLink | undefined;
let read = false;

async function current(): Promise<FolderLink | undefined> {
  if (!read) { link = await _storedLink(); read = true; }
  return link?.linked ? link : undefined;
}

/** The linked folder's root, if one is linked (locked or not). */
export async function _linkedRoot(): Promise<ScoreRoot | undefined> {
  const l = await current();
  if (l?.kind === 'device') return _deviceRoot(l.handle);
  return undefined;
}

export async function folderState(): Promise<FolderState> {
  const l = await current();
  if (!l) return { kind: 'none' };
  const name = l.kind === 'device' ? l.handle.name : l.name;
  const place = l.kind;
  return (await (await _linkedRoot())!.access()) === 'ready' ? { kind: 'ready', name, place } : { kind: 'locked', name, place };
}

/**
 * Store `link` as the linked folder. A folder that isn't the same as the last one linked has
 * none of the `folder` records' files, so they turn `gone`; the same one keeps them, so nothing is hashed again.
 */
async function switchTo(next: FolderLink, same: boolean): Promise<void> {
  if (!same) {
    await _loadRecords();
    await _updateRecords([..._records()].filter(([, r]) => r.where.kind === 'folder')
      .map(([id]) => [id, (r) => (r?.where.kind === 'folder' ? { ...r, where: { kind: 'gone' } } : r)]));
  }
  await _storeLink(next);
  link = next;
  read = true;
}

/** Pick a folder on the device and link it. Must be called from a tap. False when cancelled. */
export async function linkDeviceFolder(): Promise<boolean> {
  const picked = await _pickFolder();
  if (!picked) return false;
  const old = await _storedLink();
  const same = old?.kind === 'device' && (await old.handle.isSameEntry(picked).catch(() => false));
  await switchTo({ kind: 'device', handle: picked, linked: true }, same);
  return true;
}

/** From a tap: asks for access to a device folder. Never signs in to Drive (that leaves the page): false for one. */
export async function unlockFolder(): Promise<boolean> {
  const l = await current();
  return l?.kind === 'device' ? _unlockDevice(l.handle) : false;
}

export async function unlinkFolder(): Promise<void> {
  const old = await _storedLink();
  link = undefined;
  read = true;
  if (old) await _storeLink({ ...old, linked: false });
}
