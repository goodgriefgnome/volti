// Copies of originals' bytes, by id, in OPFS bytes/ with an index (bytes/index.json): kept for
// the Drive root, evicted least recently used over a budget, except those pinned.

import { writeFile } from './_filesystem-utils';

export interface _ByteCache {
  /** The bytes kept for `id`, if any; noted as used. */
  get(id: string): Promise<File | undefined>;
  /** Whether bytes are kept for `id`, without noting it as used. */
  has(id: string): Promise<boolean>;
  /** Keep `bytes` as `id`'s, then keep within the budget. */
  put(id: string, bytes: Blob): Promise<void>;
  /** Keep exactly these ids' bytes for good, and let go of the others pinned before. */
  pin(ids: readonly string[]): Promise<void>;
  /** How many bytes are kept. */
  size(): Promise<number>;
  /** Delete everything kept. */
  clear(): Promise<void>;
}

/** What the index says of an id; `waiting` is a pinned id whose bytes haven't come yet. */
interface Entry { size: number; used: number; pinned: boolean; waiting?: true }
type Index = Record<string, Entry>;

const INDEX = 'index.json';

/** A cache in `dir`, keeping unpinned bytes within `budget()` bytes; `now` is the clock for "last used". */
export function _makeByteCache(dir: () => Promise<FileSystemDirectoryHandle>, budget: () => Promise<number>, now: () => number = Date.now): _ByteCache {
  let index: Index | undefined;
  /** Operations run one at a time, so the index is never changed by two at once. */
  let turn: Promise<unknown> = Promise.resolve();
  /** Whether files the index doesn't list should be deleted on the next put: the index couldn't be read. */
  let sweep = false;

  const load = async (): Promise<Index> => {
    if (index) return index;
    try {
      const file = await (await (await dir()).getFileHandle(INDEX)).getFile();
      index = JSON.parse(await file.text()) as Index;
    } catch (e) {
      // No index yet is the start; one that can't be read is taken as empty, and what it listed is swept.
      index = {};
      if ((e as DOMException)?.name !== 'NotFoundError') sweep = true;
    }
    return index;
  };
  const save = async () => writeFile(await dir(), INDEX, new Blob([JSON.stringify(index)]));

  /** Run `f` after the operations before it, never failing: what goes wrong is logged, and `fallback` given. */
  const run = <T>(what: string, fallback: T, f: () => Promise<T>): Promise<T> => {
    const next = turn.then(f).catch((e) => { console.warn(`Byte cache: could not ${what}:`, e); return fallback; });
    turn = next;
    return next;
  };

  const remove = async (id: string) => {
    delete index![id];
    await (await dir()).removeEntry(id).catch(() => {});
  };

  /** Delete unpinned bytes, least recently used first, until what is kept fits the budget. */
  const evict = async () => {
    const limit = await budget();
    const kept = Object.entries(index!).filter(([, e]) => !e.waiting);
    let total = kept.reduce((n, [, e]) => n + e.size, 0);
    for (const [id, e] of kept.filter(([, e]) => !e.pinned).sort((a, b) => a[1].used - b[1].used)) {
      if (total <= limit) break;
      total -= e.size;
      await remove(id);
    }
  };

  return {
    get: (id) => run('read', undefined, async () => {
      const entry = (await load())[id];
      if (!entry || entry.waiting) return undefined;
      let file: File;
      try {
        file = await (await (await dir()).getFileHandle(id)).getFile();
      } catch (e) {
        // The bytes are gone: forget them, and say there are none.
        if (entry.pinned) index![id] = { ...entry, size: 0, waiting: true }; else delete index![id];
        await save().catch(() => {});
        throw e;
      }
      entry.used = now();
      await save().catch(() => {});
      return file;
    }),

    has: (id) => run('look', false, async () => {
      const entry = (await load())[id];
      return !!entry && !entry.waiting;
    }),

    put: (id, bytes) => run('keep', undefined, async () => {
      await load();
      const d = await dir();
      await writeFile(d, id, bytes);
      index![id] = { size: bytes.size, used: now(), pinned: index![id]?.pinned ?? false };
      await save();
      if (sweep) {
        sweep = false;
        for await (const [name] of d.entries()) if (name !== INDEX && !index![name]) await d.removeEntry(name).catch(() => {});
      }
      await evict();
      await save();
    }),

    pin: (ids) => run('pin', undefined, async () => {
      const idx = await load();
      const want = new Set(ids);
      for (const [id, e] of Object.entries(idx)) {
        if (want.has(id) || !e.pinned) continue;
        if (e.waiting) delete idx[id]; else e.pinned = false;
      }
      for (const id of want) idx[id] = idx[id] ? { ...idx[id], pinned: true } : { size: 0, used: 0, pinned: true, waiting: true };
      await save();
      await evict();
      await save();
    }),

    size: () => run('measure', 0, async () => Object.values(await load()).reduce((n, e) => n + (e.waiting ? 0 : e.size), 0)),

    clear: () => run('clear', undefined, async () => {
      const d = await dir();
      for await (const [name] of d.entries()) await d.removeEntry(name).catch(() => {});
      index = {};
      sweep = false;
    }),
  };
}

/** The app's: OPFS bytes/, a quarter of the quota (none kept beyond the pinned when the browser won't say). */
export const _byteCache: _ByteCache = _makeByteCache(
  async () => (await navigator.storage.getDirectory()).getDirectoryHandle('bytes', { create: true }),
  async () => Math.floor(((await navigator.storage.estimate?.().catch(() => undefined))?.quota ?? 0) / 4),
);
