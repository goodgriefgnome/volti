// Recently removed: a score's file removed from the library is kept here, in the app's own store
// (OPFS removed/), with where it was and when, for a week; then it is deleted for good, as Volti
// starts. One is put back by moving it into the library (misc-files.ts, `removedSource`). The score
// made from it (cuts, markings, named excerpts) is kept by its id all along, as for any score whose
// file is missing. Which files are here is in the records (_record-store.ts). Files deleted
// outside Volti aren't here.

import { writeFile } from './_filesystem-utils';
import { _bytesName, _toPurge } from './_record-model';
import { _loadRecords, _records, _updateRecord, _updateRecords } from './_record-store';
import type { Removed } from './types';

const removedDir = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('removed', { create: true });

/** Delete the bytes kept of a removed file, once its record no longer says they are there. */
export async function _forgetRemovedBytes(id: string, at: number): Promise<void> {
  await (await removedDir()).removeEntry(_bytesName(id, { kind: 'removed', removedAt: at })).catch(() => {});
}

/**
 * Keep score `id`'s file, which was at `path` in the library, in Recently removed, as its file is
 * removed from there: the bytes first, then its record. A caller whose removing fails sets the
 * record back and forgets the bytes.
 */
export async function _keepRemoved(id: string, path: string, file: File): Promise<void> {
  const at = Date.now();
  await writeFile(await removedDir(), _bytesName(id, { kind: 'removed', removedAt: at }), file);
  await _updateRecord(id, (r) => ({ ...r, path, where: { kind: 'removed', removedAt: at } }));
}

/** The files removed in the last week, the latest first. */
export async function recentlyRemoved(): Promise<Removed[]> {
  await _loadRecords();
  return [..._records()].flatMap(([id, r]) => (r.where.kind === 'removed' ? [{ id, path: r.path, at: r.where.removedAt }] : []))
    .sort((a, b) => b.at - a.at);
}

/** A removed file's file, as it was. */
export const _removedFile = async (r: Removed) => (await (await removedDir()).getFileHandle(_bytesName(r.id, { kind: 'removed', removedAt: r.at }))).getFile();

/** Delete for good the files removed a week ago or more: their records become gone. */
export async function purgeRemoved(now = Date.now()): Promise<void> {
  const due = new Map(_toPurge(await _loadRecords(), now).map((id) => [id, _records().get(id)!.where]));
  const purged: [string, number][] = [];
  await _updateRecords([...due].map(([id, where]) => [id, (r) => {
    // Still the copy that was due, not one put back or removed again meanwhile.
    if (r?.where.kind !== 'removed' || where.kind !== 'removed' || r.where.removedAt !== where.removedAt) return r;
    purged.push([id, where.removedAt]);
    return { ...r, where: { kind: 'gone' } };
  }]));
  for (const [id, at] of purged) await _forgetRemovedBytes(id, at);
}

/** How much room the removed files take, in bytes. */
export async function removedBytes(): Promise<number> {
  let n = 0;
  for await (const [, h] of (await removedDir()).entries()) if (h.kind === 'file') n += (await (h as FileSystemFileHandle).getFile()).size;
  return n;
}
