// Scores' originals: the PDFs in the linked folder (File System Access) and the copies imported into
// the app (the origin private file system), listed together. Only finding, reading and removing
// files; the score made from an original is in scores/.

import { keys } from '../storage/keys';
import { kv } from '../storage/kv';
import { takeInbox } from './inbox';

/** A score's original: a PDF in the linked folder or imported into the app. */
export interface Original {
  /** Also the id of the score made from it. */
  id: string;
  title: string;
  /** Subfolder within the linked folder, for display. */
  folder: string;
  location: 'folder' | 'imported';
  getFile(): Promise<File>;
}

export type FolderState =
  | { kind: 'none' }
  | { kind: 'ready'; name: string }
  | { kind: 'locked'; name: string }; // linked, but needs a tap to allow access this session

const MAX_DEPTH = 4;
const titleOf = (name: string) => name.replace(/\.pdf$/i, '');

/** A score's title from its id alone, for a score whose original can't be found. */
export const titleFromId = (id: string) => titleOf(id.slice(id.lastIndexOf('/') + 1).replace(/^(folder|imported):/, ''));

/* ---------- linked folder ---------- */

let dir: FileSystemDirectoryHandle | undefined;

export const canLinkFolder = () => 'showDirectoryPicker' in window;

export async function folderState(): Promise<FolderState> {
  dir ??= await kv.get<FileSystemDirectoryHandle>(keys.folder);
  if (!dir) return { kind: 'none' };
  const perm = await dir.queryPermission({ mode: 'read' });
  return perm === 'granted' ? { kind: 'ready', name: dir.name } : { kind: 'locked', name: dir.name };
}

/** Must be called from a tap. */
export async function linkFolder(): Promise<boolean> {
  try {
    dir = await window.showDirectoryPicker({ id: 'volti-scores', mode: 'read' });
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return false;
    throw e;
  }
  await kv.set(keys.folder, dir);
  return true;
}

/** Must be called from a tap. */
export async function unlockFolder(): Promise<boolean> {
  if (!dir) return false;
  return (await dir.requestPermission({ mode: 'read' })) === 'granted';
}

export async function unlinkFolder(): Promise<void> {
  dir = undefined;
  await kv.del(keys.folder);
  await kv.del(keys.folderListing);
}

interface ListingEntry { path: string }

async function walk(d: FileSystemDirectoryHandle, prefix: string, depth: number, out: ListingEntry[]) {
  for await (const [name, h] of d.entries()) {
    if (name.startsWith('.')) continue;
    if (h.kind === 'file' && /\.pdf$/i.test(name)) out.push({ path: prefix + name });
    else if (h.kind === 'directory' && depth < MAX_DEPTH) await walk(h as FileSystemDirectoryHandle, `${prefix}${name}/`, depth + 1, out);
  }
}

async function fileAt(path: string): Promise<File> {
  if (!dir) throw new Error('No folder linked');
  const parts = path.split('/');
  let d = dir;
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
  return (await d.getFileHandle(parts.at(-1)!)).getFile();
}

function folderOriginal(path: string): Original {
  const slash = path.lastIndexOf('/');
  return {
    id: 'folder:' + path,
    title: titleOf(path.slice(slash + 1)),
    folder: slash < 0 ? '' : path.slice(0, slash),
    location: 'folder',
    getFile: () => fileAt(path),
  };
}

/**
 * Originals in the linked folder. Reads the folder when access is granted;
 * otherwise returns the list remembered from last time.
 */
async function folderOriginals(state: FolderState): Promise<Original[]> {
  if (state.kind === 'none') return [];
  if (state.kind === 'locked') {
    const remembered = (await kv.get<ListingEntry[]>(keys.folderListing)) ?? [];
    return remembered.map((e) => folderOriginal(e.path));
  }
  const found: ListingEntry[] = [];
  await walk(dir!, '', 0, found);
  await kv.set(keys.folderListing, found);
  return found.map((f) => folderOriginal(f.path));
}

/* ---------- imported originals (origin private file system) ---------- */

const importsDir = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('imported', { create: true });

export async function importFiles(files: Iterable<File>): Promise<number> {
  const d = await importsDir();
  let n = 0;
  for (const f of files) {
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') continue;
    const name = /\.pdf$/i.test(f.name) ? f.name : f.name + '.pdf';
    const w = await (await d.getFileHandle(name, { create: true })).createWritable();
    await w.write(f);
    await w.close();
    n++;
  }
  return n;
}

export async function importShared(): Promise<number> {
  const files = await takeInbox();
  return files.length ? importFiles(files) : 0;
}

export async function removeImported(o: Original): Promise<void> {
  const d = await importsDir();
  await d.removeEntry(o.id.slice('imported:'.length));
}

async function importedOriginals(): Promise<Original[]> {
  const d = await importsDir();
  const out: Original[] = [];
  for await (const [name, h] of d.entries()) {
    if (h.kind !== 'file') continue;
    out.push({
      id: 'imported:' + name,
      title: titleOf(name),
      folder: '',
      location: 'imported',
      getFile: () => (h as FileSystemFileHandle).getFile(),
    });
  }
  return out;
}

export async function allOriginals(state: FolderState): Promise<Original[]> {
  const [a, b] = await Promise.all([folderOriginals(state), importedOriginals()]);
  return [...a, ...b].sort((x, y) => x.title.localeCompare(y.title, undefined, { numeric: true, sensitivity: 'base' }));
}
