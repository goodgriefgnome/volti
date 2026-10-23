// Scores' originals: the PDFs in the linked folder (File System Access) and the copies imported into
// the app (the origin private file system), listed together, each known by the hash of its
// contents. Only finding, reading, hashing and removing files; the score made from an original is
// in scores/.

import { keys } from '../storage/keys';
import { kv } from '../storage/kv';
import { takeInbox } from './inbox';

/** A score's original: a PDF in the linked folder or imported into the app. */
export interface Original {
  /** The SHA-256 of the file's contents, in hex; also the id of the score made from it. */
  id: string;
  title: string;
  /** Subfolder within the linked folder, for display. */
  folder: string;
  location: 'folder' | 'imported';
  /** Where the file is: its path within the linked folder, or its name among the imported copies. */
  path: string;
  getFile(): Promise<File>;
}

export type FolderState =
  | { kind: 'none' }
  | { kind: 'ready'; name: string }
  | { kind: 'locked'; name: string }; // linked, but needs a tap to allow access this session

const MAX_DEPTH = 4;
const titleOf = (name: string) => name.replace(/\.pdf$/i, '');

/* ---------- ids: hashes of the contents ---------- */

/** A file's hash, good while its size and modified time stay the same. */
interface Hashed { size: number; modified: number; id: string }

/** Hashes by where the file is: "folder/" + path or "imported/" + name. */
type HashCache = Record<string, Hashed>;

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

/** The SHA-256 of `file`'s contents, in hex. */
export const hashFile = async (file: Blob) => hex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));

/** Ids for files, hashing only those that changed since they were last hashed. */
class Hasher {
  private constructor(private before: HashCache, readonly now: HashCache) {}
  static async load() { return new Hasher((await kv.get<HashCache>(keys.hashes)) ?? {}, {}); }

  /** The id worked out before for this file, while it hasn't changed. */
  known(where: string, file: File): string | undefined {
    const was = this.before[where];
    return was && was.size === file.size && was.modified === file.lastModified ? was.id : undefined;
  }

  async id(where: string, file: File): Promise<string> {
    const id = this.known(where, file) ?? await hashFile(file);
    this.now[where] = { size: file.size, modified: file.lastModified, id };
    return id;
  }

  /** Remember the files hashed this time, and those under `keep` (places not looked at this time). */
  save(keep?: string) {
    const kept = keep ? Object.entries(this.before).filter(([k]) => k.startsWith(keep)) : [];
    return kv.set(keys.hashes, { ...Object.fromEntries(kept), ...this.now });
  }
}

/**
 * The originals, each once: when the same file is both in the folder and imported, the folder's
 * copy, and `copies` are the imported ones to delete. Two of the same file in one place show the
 * first.
 */
export function oneEach(folder: readonly Original[], imported: readonly Original[], deleteCopies: boolean): { originals: Original[]; copies: Original[] } {
  const seen = new Map<string, Original>();
  const copies: Original[] = [];
  for (const o of [...folder, ...imported]) {
    const first = seen.get(o.id);
    if (!first) seen.set(o.id, o);
    else if (deleteCopies && o.location === 'imported' && first.location === 'folder') copies.push(o);
  }
  return { originals: [...seen.values()], copies };
}

/** Every original's title as last seen, by id: for a score whose original can't be found. */
export const knownTitles = async () => (await kv.get<Record<string, string>>(keys.titles)) ?? {};

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

/** Ask to change files in the linked folder as well as read them. Must be called from a tap. */
export async function allowWriting(): Promise<boolean> {
  if (!dir) return false;
  return (await dir.requestPermission({ mode: 'readwrite' })) === 'granted';
}

export async function unlinkFolder(): Promise<void> {
  dir = undefined;
  await kv.del(keys.folder);
  await kv.del(keys.folderListing);
}

/** A PDF in the linked folder, as last read: listed from this while access is locked. */
interface ListingEntry { path: string; id: string }

async function walk(d: FileSystemDirectoryHandle, prefix: string, depth: number, out: [string, FileSystemFileHandle][]) {
  for await (const [name, h] of d.entries()) {
    if (name.startsWith('.')) continue;
    if (h.kind === 'file' && /\.pdf$/i.test(name)) out.push([prefix + name, h as FileSystemFileHandle]);
    else if (h.kind === 'directory' && depth < MAX_DEPTH) await walk(h as FileSystemDirectoryHandle, `${prefix}${name}/`, depth + 1, out);
  }
}

async function fileAt(path: string): Promise<File> {
  const [d, name] = await placeOf(path);
  return (await d.getFileHandle(name)).getFile();
}

/** The folder a path in the linked folder is in, and the file's name. */
async function placeOf(path: string): Promise<[FileSystemDirectoryHandle, string]> {
  if (!dir) throw new Error('No folder linked');
  const parts = path.split('/');
  let d = dir;
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
  return [d, parts.at(-1)!];
}

function folderOriginal({ path, id }: ListingEntry): Original {
  const slash = path.lastIndexOf('/');
  return {
    id,
    title: titleOf(path.slice(slash + 1)),
    folder: slash < 0 ? '' : path.slice(0, slash),
    location: 'folder',
    path,
    getFile: () => fileAt(path),
  };
}

/** Reports how many of the files that need hashing are done. */
export type Progress = (done: number, of: number) => void;

/** A file found, and what to make of it once its id is known. */
interface Found<T> { where: string; file: File; make: (id: string) => T }

/** Give each file its id, hashing those new or changed one at a time, as each is read whole. */
async function identify<T>(files: Found<T>[], hasher: Hasher, progress?: Progress): Promise<T[]> {
  const of = files.filter((f) => !hasher.known(f.where, f.file)).length;
  let done = 0;
  const out: T[] = [];
  for (const f of files) {
    const fresh = !hasher.known(f.where, f.file);
    out.push(f.make(await hasher.id(f.where, f.file)));
    if (fresh) progress?.(++done, of);
  }
  return out;
}

/**
 * Originals in the linked folder. Reads the folder when access is granted;
 * otherwise returns the list remembered from last time.
 */
async function folderOriginals(state: FolderState, hasher: Hasher, progress?: Progress): Promise<Original[]> {
  if (state.kind === 'none') return [];
  if (state.kind === 'locked') {
    const remembered = (await kv.get<ListingEntry[]>(keys.folderListing)) ?? [];
    return remembered.map(folderOriginal);
  }
  const found: [string, FileSystemFileHandle][] = [];
  await walk(dir!, '', 0, found);
  const files = await Promise.all(found.map(async ([path, h]) => ({ where: 'folder/' + path, file: await h.getFile(), make: (id: string): ListingEntry => ({ path, id }) })));
  const listing = await identify(files, hasher, progress);
  await kv.set(keys.folderListing, listing);
  return listing.map(folderOriginal);
}

/* ---------- imported originals (origin private file system) ---------- */

const importsDir = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('imported', { create: true });

/** A name for a new imported file that no other has: "Mass.pdf", then "Mass (2).pdf". */
function freeName(name: string, taken: ReadonlySet<string>): string {
  const base = titleOf(name);
  for (let n = 1; ; n++) {
    const next = n === 1 ? `${base}.pdf` : `${base} (${n}).pdf`;
    if (!taken.has(next.toLowerCase())) return next;
  }
}

/**
 * Keep copies of PDFs in the app. A file the library already has, in the folder or imported, isn't
 * copied again: `already` has their titles.
 */
export async function importFiles(files: Iterable<File>): Promise<{ added: number; already: string[] }> {
  const d = await importsDir();
  const hasher = await Hasher.load();
  const imported = await importedOriginals(hasher);
  const listed = (await kv.get<ListingEntry[]>(keys.folderListing)) ?? [];
  const have = new Set([...imported.map((o) => o.id), ...listed.map((e) => e.id)]);
  const taken = new Set(imported.map((o) => o.path.toLowerCase()));
  let added = 0;
  const already: string[] = [];
  for (const f of files) {
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') continue;
    const id = await hashFile(f);
    if (have.has(id)) { already.push(titleOf(f.name)); continue; }
    const name = freeName(f.name, taken);
    const h = await d.getFileHandle(name, { create: true });
    const w = await h.createWritable();
    await w.write(f);
    await w.close();
    await hasher.id('imported/' + name, await h.getFile());
    have.add(id);
    taken.add(name.toLowerCase());
    added++;
  }
  await hasher.save('folder/');
  return { added, already };
}

export async function importShared(): Promise<number> {
  const files = await takeInbox();
  return files.length ? (await importFiles(files)).added : 0;
}

export async function removeImported(o: Original): Promise<void> {
  const d = await importsDir();
  await d.removeEntry(o.path);
}

async function importedOriginals(hasher: Hasher, progress?: Progress): Promise<Original[]> {
  const d = await importsDir();
  const files: Found<Original>[] = [];
  for await (const [name, h] of d.entries()) {
    if (h.kind !== 'file') continue;
    const handle = h as FileSystemFileHandle;
    files.push({
      where: 'imported/' + name,
      file: await handle.getFile(),
      make: (id) => ({ id, title: titleOf(name), folder: '', location: 'imported', path: name, getFile: () => handle.getFile() }),
    });
  }
  return identify(files, hasher, progress);
}

/**
 * Every original, each file once, sorted by title. An imported copy of a file that is also in the
 * folder is deleted: `removed` counts them. Files new or changed since last time are hashed, which
 * reads them whole; `progress` hears how that goes.
 */
export async function allOriginals(state: FolderState, progress?: Progress): Promise<{ originals: Original[]; removed: number }> {
  const hasher = await Hasher.load();
  const folder = await folderOriginals(state, hasher, progress);
  const imported = await importedOriginals(hasher, progress);
  await hasher.save(state.kind === 'ready' ? undefined : 'folder/');
  const { originals, copies } = oneEach(folder, imported, state.kind === 'ready');
  for (const c of copies) await removeImported(c);
  await kv.update<Record<string, string>>(keys.titles, (old) => ({ ...old, ...Object.fromEntries(originals.map((o) => [o.id, o.title])) }));
  originals.sort((x, y) => x.title.localeCompare(y.title, undefined, { numeric: true, sensitivity: 'base' }));
  return { originals, removed: copies.length };
}

/* ---------- renaming ---------- */

/** Why `title` can't be a file name, or null if it can. */
export function fileNameProblem(title: string): string | null {
  const t = title.trim();
  if (!t) return 'Type a name.';
  if (/[\\/:*?"<>|]/.test(t)) return 'A file name can\'t have any of \\ / : * ? " < > |';
  if (t.startsWith('.')) return 'A file name can\'t start with a dot.';
  return null;
}

/**
 * Rename an original's file to `title` + ".pdf", in the same folder; its score stays, as its
 * contents haven't changed. For the linked folder, write access must have been allowed. Says why
 * when it can't (a file of that name is there already).
 */
export async function renameOriginal(o: Original, title: string): Promise<string | null> {
  const name = title.trim() + '.pdf';
  const [d, old] = o.location === 'folder' ? await placeOf(o.path) : [await importsDir(), o.path];
  if (name === old) return null;
  const h = await d.getFileHandle(old);
  // Changing only the case finds the file itself where the file system ignores case.
  const caseOnly = name.toLowerCase() === old.toLowerCase();
  if (!caseOnly && (await d.getFileHandle(name).then(() => true, () => false))) return `There is already a file called “${name}” there.`;
  // Where it can't be moved (as in some of Android's folders), copy it under the new name, then delete the old one.
  const moved = h.move ? await h.move(name).then(() => true, (e) => { console.warn('Renaming by copying, as moving failed:', e); return false; }) : false;
  if (!moved) {
    if (caseOnly) return 'Only the case changes, and this folder can\'t do that. Change another letter too.';
    const copy = await d.getFileHandle(name, { create: true });
    try {
      const w = await copy.createWritable();
      await w.write(await h.getFile());
      await w.close();
    } catch (e) {
      await d.removeEntry(name).catch(() => {});
      throw e;
    }
    // Both are the same score now, so one left behind only shows twice in the Files app.
    if (!(await d.removeEntry(old).then(() => true, () => false))) return `Copied it as “${name}”, but couldn't delete “${old}”. Delete it in the Files app.`;
  }
  // The same contents, so the same id: no need to read it again.
  const file = await (await d.getFileHandle(name)).getFile();
  const where = (o.location === 'folder' ? 'folder/' + o.path.slice(0, o.path.length - old.length) : 'imported/') + name;
  await kv.update<HashCache>(keys.hashes, (old) => ({ ...old, [where]: { size: file.size, modified: file.lastModified, id: o.id } }));
  return null;
}

/* ---------- exports ---------- */

/** The folder inside the linked folder that exported PDFs are written to. */
export const EXPORTS = 'Exports';

const exportsDir = async () => {
  if (!dir) throw new Error('No folder linked');
  return dir.getDirectoryHandle(EXPORTS, { create: true });
};

/** Whether `name`.pdf is in the exports folder. Write access must have been allowed. */
export async function exportExists(name: string): Promise<boolean> {
  return (await exportsDir()).getFileHandle(name.trim() + '.pdf').then(() => true, () => false);
}

/** Write `name`.pdf into the exports folder, replacing one of that name. Write access must have been allowed. */
export async function saveExport(name: string, data: Blob): Promise<void> {
  const w = await (await (await exportsDir()).getFileHandle(name.trim() + '.pdf', { create: true })).createWritable();
  await w.write(data);
  await w.close();
}
