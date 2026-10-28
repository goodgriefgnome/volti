// Paths of originals' files (PDFs and images) and the library grouped by them. Pure: no DOM, no storage.
// A score's title and folder from its file's path, the paths a rename or a move gives, the name a
// file coming in is kept under, what a file name can't be, folders as the user reads them and
// tidied, the library in lists by folder, sorting by title, and what happens to files arriving at
// paths. A name says which files are scores, never how one is read: that is what its contents say.

import type { SourceFile } from './types';

/** An original's file name ending: ".pdf", or an image's. */
const ENDING = /\.(pdf|jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i;

/** The file name at the end of a path ("Masses/Mass in G.pdf" → "Mass in G.pdf"). */
export const _nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** A score's title: its file's name without ".pdf" (or its image ending), whatever folder it is in. */
export const titleOf = (path: string) => _nameOf(path).replace(ENDING, '');

/** The folder a path is in ("Masses/Latin/Mass.pdf" → "Masses/Latin"), '' at the top. */
export const folderOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')));

/** The path an original at `path` has once renamed to `title`: in the same folder, with the same ending. */
export const pathWithTitle = (path: string, title: string) => joinPath(folderOf(path), title.trim() + (_endingOf(_nameOf(path)) || '.pdf'));

/** The path an original at `path` has once moved into `folder` ('' for the top), with the same name. */
export const pathInFolder = (path: string, folder: string) => joinPath(_tidyFolder(folder), _nameOf(path));

const joinPath = (folder: string, name: string) => (folder ? folder + '/' : '') + name;

/** A path tidied: its folders' names trimmed, empty ones dropped. */
export const _tidyPath = (path: string) => joinPath(_tidyFolder(folderOf(path)), _nameOf(path));

/** Whether a file's name says it is an original: a PDF or an image. */
export const _isOriginalName = (name: string) => ENDING.test(name);

/** Why a file can't be moved to `path`, as Volti wouldn't find it there; null when it can. */
export const _unfoundName = (path: string) =>
  _isOriginalName(path) ? null : `“${_nameOf(path)}” doesn’t end in .pdf or an image’s ending, so Volti wouldn’t find it.`;

/** A folder as the user reads it, for saying where a file is: "Masses / Latin", or the top. */
export const _shownFolder = (folder: string) => (folder ? folder.split('/').join(' / ') : 'the top of the library');

/** The ending of an original's file name (".pdf", ".jpg"), or "". */
export const _endingOf = (name: string) => ENDING.exec(name)?.[0] ?? '';

/**
 * The name to keep a file coming in under: its own, with an ending added if it hasn't one (".pdf",
 * or for an image, one for its type).
 */
export function _importName(name: string, type = ''): string {
  if (_isOriginalName(name)) return name;
  const image = /^image\/(\w+)/.exec(type)?.[1];
  return name + (image ? '.' + (image === 'jpeg' ? 'jpg' : image) : '.pdf');
}

/** Why `title` can't be a file name, or null if it can. */
export function fileNameProblem(title: string): string | null {
  const t = title.trim();
  if (!t) return 'Type a name.';
  if (/[\\/:*?"<>|]/.test(t)) return 'A file name can\'t have any of \\ / : * ? " < > |';
  if (t.startsWith('.')) return 'A file name can\'t start with a dot.';
  return null;
}

/** A folder path tidied: parts trimmed, empty ones dropped, joined with "/". */
export const _tidyFolder = (path: string) => path.split('/').map((p) => p.trim()).filter(Boolean).join('/');

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

/** In the library's order: by title, numbers by value. */
export const byTitle = (x: SourceFile, y: SourceFile) => titleOf(x.path).localeCompare(titleOf(y.path), undefined, { numeric: true, sensitivity: 'base' });

/** A file by its id (the hash of its contents) and its path in the library. */
export interface _At { id: string; path: string }

/** What happens to a file coming in, given the library's files `T`. */
export type Arrival<T extends _At = _At> =
  | { kind: 'new' }
  /** The library has it, at `path`: it is left out. */
  | { kind: 'have'; path: string }
  /** A different file is at its path: in the library (`by`, which may be replaced), or another coming in. */
  | { kind: 'taken'; by?: T };

/**
 * What happens to each file coming in, at its path. Paths are compared ignoring case, as a folder
 * may; of two coming in at one path, the first takes it.
 */
export function arrivals<T extends _At>(coming: readonly _At[], library: readonly T[]): Arrival<T>[] {
  const have = new Map(library.map((o) => [o.id, o.path]));
  const at = new Map(library.map((o) => [o.path.toLowerCase(), o]));
  const claimed = new Set<string>();
  return coming.map((c): Arrival<T> => {
    const there = have.get(c.id);
    if (there !== undefined) return { kind: 'have', path: there };
    const key = c.path.toLowerCase();
    const by = at.get(key);
    if (by) return { kind: 'taken', by };
    if (claimed.has(key)) return { kind: 'taken' };
    claimed.add(key);
    return { kind: 'new' };
  });
}
