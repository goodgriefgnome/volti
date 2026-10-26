// The library's scores in lists by subfolder, and the subfolders there are. Pure.

import { folderOf } from './names';
import type { SourceFile } from './original';

/**
 * The originals in lists by folder: the top of the folder (with what is filed under no folder)
 * first, then each subfolder, by path. Each list keeps the originals' order.
 */
export function byFolder(originals: readonly SourceFile[]): { folder: string; originals: SourceFile[] }[] {
  const lists = new Map<string, SourceFile[]>([['', []]]);
  for (const o of originals) lists.set(folderOf(o.path), [...(lists.get(folderOf(o.path)) ?? []), o]);
  return [...lists].map(([folder, originals]) => ({ folder, originals }))
    .sort((a, b) => (a.folder === '' ? -1 : b.folder === '' ? 1 : a.folder.localeCompare(b.folder, undefined, { numeric: true, sensitivity: 'base' })));
}

/** The subfolders the originals are in, by path. */
export const subfolders = (originals: readonly SourceFile[]) => [...new Set(originals.map((o) => folderOf(o.path)).filter(Boolean))].sort();
