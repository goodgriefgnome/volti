// Recently removed: a score's file removed from the library is kept here, in the app's own store
// (OPFS), with where it was and when, for a week; then it is deleted for good, as Volti starts. One
// is put back by moving it into the library (adding.ts, `removedSource`). The score made from it
// (cuts, markings, named excerpts) is kept by its id all along, as for any score whose file is
// missing. Files deleted outside Volti aren't here.

import { keys, kv } from '../storage';
import { writeFile } from './filesystem-utils';

/** How long a removed file is kept. */
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

const removedDir = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('removed', { create: true });

/** A removed file: kept under `key`, with its id, where it was in the library, and when it was removed (ms since 1970). */
export interface Removed { key: string; id: string; path: string; at: number }

type Records = Record<string, Removed>;
const load = async () => (await kv.get<Records>(keys.removed)) ?? {};
/** Forget a removed file, and delete what was kept of it, as when it has been put back. */
export async function forgetRemoved(key: string) {
  await kv.update<Records>(keys.removed, (old) => {
    const { [key]: _, ...rest } = old ?? {};
    return rest;
  });
  await (await removedDir()).removeEntry(key).catch(() => {});
}

/**
 * Keep score `id`'s file, which was at `path` in the library, in Recently removed, as its file is
 * removed from there: the key it is kept under, to forget it by if removing it fails.
 */
export async function keepRemoved(id: string, path: string, file: File): Promise<string> {
  const at = Date.now(), key = `${at}-${id}`;
  await writeFile(await removedDir(), key, file);
  await kv.update<Records>(keys.removed, (old) => ({ ...old, [key]: { key, id, path, at } }));
  return key;
}

/** The files removed in the last week, the latest first. */
export async function recentlyRemoved(): Promise<Removed[]> {
  return Object.values(await load()).sort((a, b) => b.at - a.at);
}

/** A removed file's file, as it was. */
export const removedFile = async (r: Removed) => (await (await removedDir()).getFileHandle(r.key)).getFile();

/** Delete for good the files removed a week ago or more, and any kept that nothing says where it was. */
export async function purgeRemoved(now = Date.now()): Promise<void> {
  const records = await load();
  const keep = new Set(Object.values(records).filter((r) => now - r.at < KEEP_MS).map((r) => r.key));
  const d = await removedDir(), there = new Set<string>();
  for await (const [name] of d.entries()) {
    if (keep.has(name)) there.add(name);
    else await d.removeEntry(name).catch(() => {});
  }
  // And what is no longer there.
  if (Object.keys(records).some((k) => !there.has(k))) {
    await kv.update<Records>(keys.removed, (old) => Object.fromEntries(Object.entries(old ?? {}).filter(([k]) => there.has(k) || !(k in records))));
  }
}

/** How much room the removed files take, in bytes. */
export async function removedBytes(): Promise<number> {
  let n = 0;
  for await (const [, h] of (await removedDir()).entries()) if (h.kind === 'file') n += (await (h as FileSystemFileHandle).getFile()).size;
  return n;
}
