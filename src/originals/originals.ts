// The library's files: the PDFs and images in its root (library-root.ts: the linked folder, or
// Volti's own), known by the hash of their contents (hashes.ts). Only finding them; a file itself is
// library-root.ts, the original reading it gives is original.ts, and the score made from one is in
// scores/.

import { keys, kv } from '../storage';
import { rememberedListing, saveListing } from './device-score-fs';
import { folderFiles, sourceFileOf, whereIs } from './library-root';
import { Hasher } from './hashes';
import { byTitle, titleOf } from './path-utils';
import type { FolderState, SourceFile } from './types';

/** Every file's title as last seen, by id: for a score whose file can't be found. */
export const knownTitles = async () => (await kv.get<Record<string, string>>(keys.titles)) ?? {};

/**
 * Hears the files known so far while new or changed files are read, and how many are `left`
 * to read.
 */
type Progress = (originals: SourceFile[], left: number) => void;

/**
 * The library's files, sorted by title: the same SourceFile for an id as before; two of the same file show
 * the first. Files new or changed since last time are hashed, which reads them whole, one at a
 * time; `progress` hears the files known so far before the first and after each. While the
 * linked folder is locked, its PDFs are the ones remembered.
 */
export async function libraryFiles(state: FolderState, progress?: Progress): Promise<SourceFile[]> {
  const hasher = await Hasher.load();
  const locked = state.kind === 'locked';
  const remembered = locked ? await rememberedListing() : [];
  const files = locked ? [] : await folderFiles();
  const where = await Promise.all(files.map((f) => whereIs(f.path)));
  const ids = new Map<string, string>();
  const known = () => {
    const seen = new Map<string, string>();
    for (const e of [...remembered, ...files.filter((f) => ids.has(f.path)).map((f) => ({ id: ids.get(f.path)!, path: f.path }))]) if (!seen.has(e.id)) seen.set(e.id, e.path);
    return [...seen].map(([id, path]) => sourceFileOf(id, path)).sort(byTitle);
  };
  const fresh: number[] = [];
  for (const [i, f] of files.entries()) {
    if (hasher.known(where[i], f.file)) ids.set(f.path, await hasher.id(where[i], f.file)); else fresh.push(i);
  }
  for (const [n, i] of fresh.entries()) {
    if (n === 0) progress?.(known(), fresh.length);
    ids.set(files[i].path, await hasher.id(where[i], files[i].file));
    progress?.(known(), fresh.length - n - 1);
  }
  if (!locked) await saveListing(files.map((f) => ({ path: f.path, id: ids.get(f.path)! })));
  // The hashes of the root not read this time are kept: the app's while a folder is linked, and the other way round.
  await hasher.save(locked ? ['folder/', 'app/'] : [state.kind === 'none' ? 'folder/' : 'app/']);
  const found = known();
  await kv.update<Record<string, string>>(keys.titles, (old) => ({ ...old, ...Object.fromEntries(found.map((f) => [f.id, titleOf(f.path)])) }));
  return found;
}
