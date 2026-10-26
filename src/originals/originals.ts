// The library's originals: the PDFs and images in the linked folder (folder.ts) and those added to
// Volti (imported.ts), listed together, each once, with the scores folder's known by the hash of
// their contents (hashes.ts). Only finding them; an original itself is original.ts, and the score
// made from one is in scores/.

import { keys, kv } from '../storage';
import { folderFiles, rememberedListing, saveListing, type FolderState } from './folder';
import { Hasher } from './hashes';
import { addedScores, removeAdded } from './imported';
import { titleOf } from './names';
import { originalOf, type Original } from './original';

/** An original found, before it is made: its id, whether it is added, and where it is. */
export interface Place { id: string; added: boolean; path: string }

/**
 * The originals, each once: when the same file is both in the folder and added, the folder's copy,
 * and `copies` are the added ones to delete. Two of the same file in one place show the first.
 */
export function oneEach(folder: readonly Place[], added: readonly Place[], deleteCopies: boolean): { originals: Place[]; copies: Place[] } {
  const seen = new Map<string, Place>();
  const copies: Place[] = [];
  for (const o of [...folder, ...added]) {
    const first = seen.get(o.id);
    if (!first) seen.set(o.id, o);
    else if (deleteCopies && o.added && !first.added) copies.push(o);
  }
  return { originals: [...seen.values()], copies };
}

/** Every original's title as last seen, by id: for a score whose original can't be found. */
export const knownTitles = async () => (await kv.get<Record<string, string>>(keys.titles)) ?? {};

/**
 * Hears the originals known so far while new or changed files are read, and how many are `left`
 * to read.
 */
export type Progress = (originals: Original[], left: number) => void;

/** In the library's order: by title, numbers by value. */
export const byTitle = (x: Original, y: Original) => titleOf(x.path).localeCompare(titleOf(y.path), undefined, { numeric: true, sensitivity: 'base' });

/**
 * Every original, each file once, sorted by title: the same Original for an id as before. Files in
 * the scores folder new or changed since last time are hashed, which reads them whole, one at a
 * time; `progress` hears the originals known so far before the first and after each. An added copy
 * of a file that is also in the folder is then deleted: `removed` counts them. While the folder is
 * locked, its PDFs are the ones remembered.
 */
export async function allOriginals(state: FolderState, progress?: Progress): Promise<{ originals: Original[]; removed: number }> {
  const hasher = await Hasher.load();
  const remembered: Place[] = state.kind === 'locked' ? (await rememberedListing()).map((e) => ({ ...e, added: false })) : [];
  const files = state.kind === 'ready' ? await folderFiles() : [];
  const added: Place[] = (await addedScores()).map((a) => ({ ...a, added: true }));
  const ids = new Map<string, string>();
  const known = (deleteCopies: boolean) => {
    const found = files.filter((f) => ids.has(f.path)).map((f): Place => ({ id: ids.get(f.path)!, added: false, path: f.path }));
    const { originals, copies } = oneEach([...remembered, ...found], added, deleteCopies);
    return { originals: originals.map((p) => originalOf(p.id, p.added, p.path)).sort(byTitle), copies };
  };
  const where = (path: string) => 'folder/' + path;
  const fresh: typeof files = [];
  for (const f of files) {
    if (hasher.known(where(f.path), f.file)) ids.set(f.path, await hasher.id(where(f.path), f.file)); else fresh.push(f);
  }
  for (const [i, f] of fresh.entries()) {
    if (i === 0) progress?.(known(false).originals, fresh.length);
    ids.set(f.path, await hasher.id(where(f.path), f.file));
    progress?.(known(false).originals, fresh.length - i - 1);
  }
  if (state.kind === 'ready') await saveListing(files.map((f) => ({ path: f.path, id: ids.get(f.path)! })));
  await hasher.save(state.kind === 'ready' ? undefined : 'folder/');
  const { originals, copies } = known(state.kind === 'ready');
  for (const c of copies) await removeAdded(c.id);
  await kv.update<Record<string, string>>(keys.titles, (old) => ({ ...old, ...Object.fromEntries(originals.map((o) => [o.id, titleOf(o.path)])) }));
  return { originals, removed: copies.length };
}
