import { kv } from './idb';
import { takeInbox } from './inbox';

/** A PDF the app can open: either in the linked folder or imported into the app. */
export interface Score {
  /** Stable key for annotations and reading position. */
  id: string;
  title: string;
  /** Subfolder within the linked folder, for display. */
  folder: string;
  source: 'folder' | 'imported';
  getFile(): Promise<File>;
}

export type FolderState =
  | { kind: 'none' }
  | { kind: 'ready'; name: string }
  | { kind: 'locked'; name: string }; // linked, but needs a tap to allow access this session

const MAX_DEPTH = 4;
const titleOf = (name: string) => name.replace(/\.pdf$/i, '');

/* ---------- linked folder ---------- */

let dir: FileSystemDirectoryHandle | undefined;

export const canLinkFolder = () => 'showDirectoryPicker' in window;

export async function folderState(): Promise<FolderState> {
  dir ??= await kv.get<FileSystemDirectoryHandle>('folder');
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
  await kv.set('folder', dir);
  return true;
}

/** Must be called from a tap. */
export async function unlockFolder(): Promise<boolean> {
  if (!dir) return false;
  return (await dir.requestPermission({ mode: 'read' })) === 'granted';
}

export async function unlinkFolder(): Promise<void> {
  dir = undefined;
  await kv.del('folder');
  await kv.del('folder-listing');
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

function folderScore(path: string): Score {
  const slash = path.lastIndexOf('/');
  return {
    id: 'folder:' + path,
    title: titleOf(path.slice(slash + 1)),
    folder: slash < 0 ? '' : path.slice(0, slash),
    source: 'folder',
    getFile: () => fileAt(path),
  };
}

/**
 * Scores in the linked folder. Reads the folder when access is granted;
 * otherwise returns the list remembered from last time.
 */
async function folderScores(state: FolderState): Promise<Score[]> {
  if (state.kind === 'none') return [];
  if (state.kind === 'locked') {
    const remembered = (await kv.get<ListingEntry[]>('folder-listing')) ?? [];
    return remembered.map((e) => folderScore(e.path));
  }
  const found: ListingEntry[] = [];
  await walk(dir!, '', 0, found);
  await kv.set('folder-listing', found);
  return found.map((f) => folderScore(f.path));
}

/* ---------- imported scores (origin private file system) ---------- */

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

export async function removeImported(score: Score): Promise<void> {
  const d = await importsDir();
  await d.removeEntry(score.id.slice('imported:'.length));
}

async function importedScores(): Promise<Score[]> {
  const d = await importsDir();
  const out: Score[] = [];
  for await (const [name, h] of d.entries()) {
    if (h.kind !== 'file') continue;
    out.push({
      id: 'imported:' + name,
      title: titleOf(name),
      folder: '',
      source: 'imported',
      getFile: () => (h as FileSystemFileHandle).getFile(),
    });
  }
  return out;
}

export async function allScores(state: FolderState): Promise<Score[]> {
  const [a, b] = await Promise.all([folderScores(state), importedScores()]);
  return [...a, ...b].sort((x, y) => x.title.localeCompare(y.title, undefined, { numeric: true, sensitivity: 'base' }));
}
