// Volti's own folder in the origin private file system (OPFS), which is the library's root while no
// folder is linked (library-files.ts) and keeps the files left in it when one is.
// It also keeps an exact record of each file's id, as only Volti changes the files there.

import { keys, kv } from '../storage';
import { hashFile, walk } from './filesystem-utils';
import type { Ids } from './internal-types';

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
  await kv.update<IdRecord>(keys.internalIds, (old) => without(old, path));
}

/** How much room the files in Volti's own folder take, in bytes. */
export async function internalBytes(): Promise<number> {
  const found: [string, FileSystemFileHandle][] = [];
  await walk(await opfsRoot(), '', 0, found);
  let n = 0;
  for (const [, h] of found) n += (await h.getFile()).size;
  return n;
}

/* ---------- its ids ---------- */

/** Each file's id by its path in Volti's own folder. */
export type IdRecord = Record<string, string>;

const without = (record: IdRecord | undefined, path: string): IdRecord => Object.fromEntries(Object.entries(record ?? {}).filter(([p]) => p !== path));

/** The record kept after a listing that found files at `found`: the ids of those paths only. */
export function keptIds(record: IdRecord, found: Iterable<string>): IdRecord {
  const there = new Set(found);
  return Object.fromEntries(Object.entries(record).filter(([path]) => there.has(path)));
}

/**
 * The record of the ids in Volti's own folder. Only Volti writes, moves or removes files there, and
 * each tells the record, so an id is trusted without looking at the file. A file with no record is
 * hashed and recorded at a listing, and records for paths no longer there are dropped.
 */
class InternalIds implements Ids {
  private seen = new Set<string>();
  private constructor(private record: IdRecord) {}
  static async load() { return new InternalIds((await kv.get<IdRecord>(keys.internalIds)) ?? {}); }

  known(path: string) { return this.record[path]; }

  async id(path: string, file: File): Promise<string> {
    const id = this.known(path) ?? await hashFile(file);
    this.record[path] = id;
    this.seen.add(path);
    return id;
  }

  async remember(path: string, _file: File, id: string) {
    await kv.update<IdRecord>(keys.internalIds, (old) => ({ ...old, [path]: id }));
  }

  async moved(from: string, to: string, _file: File, id: string) {
    await kv.update<IdRecord>(keys.internalIds, (old) => ({ ...without(old, from), [to]: id }));
  }

  async forget(path: string) {
    await kv.update<IdRecord>(keys.internalIds, (old) => without(old, path));
  }

  save() { return kv.set(keys.internalIds, keptIds(this.record, this.seen)); }
}

export const internalIds = (): Promise<Ids> => InternalIds.load();
