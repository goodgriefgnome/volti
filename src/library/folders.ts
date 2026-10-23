// The library's scores in lists by subfolder. Pure.

import type { Original } from '../originals/originals';

/**
 * The originals in lists by folder: the top of the folder (with what is filed under no folder)
 * first, then each subfolder, by path. Each list keeps the originals' order.
 */
export function byFolder(originals: readonly Original[]): { folder: string; originals: Original[] }[] {
  const lists = new Map<string, Original[]>([['', []]]);
  for (const o of originals) lists.set(o.folder, [...(lists.get(o.folder) ?? []), o]);
  return [...lists].map(([folder, originals]) => ({ folder, originals }))
    .sort((a, b) => (a.folder === '' ? -1 : b.folder === '' ? 1 : a.folder.localeCompare(b.folder, undefined, { numeric: true, sensitivity: 'base' })));
}
