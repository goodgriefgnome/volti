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

/** The SHA-256 of some contents, in hex. */
export const hashBytes = async (bytes: ArrayBuffer) => hex(await crypto.subtle.digest('SHA-256', bytes));

/** The SHA-256 of `file`'s contents, in hex. */
export const hashFile = async (file: Blob) => hashBytes(await file.arrayBuffer());

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

/** Must be called from a tap. Asks to change files too (renaming, exports), so that's asked once. */
export async function linkFolder(): Promise<boolean> {
  try {
    dir = await window.showDirectoryPicker({ id: 'volti-scores', mode: 'readwrite' });
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return false;
    throw e;
  }
  await kv.set(keys.folder, dir);
  return true;
}

/**
 * Must be called from a tap. Asks to change files as well as read them, so renaming and exporting
 * don't ask again this session; when that is refused, asks to read them only.
 */
export async function unlockFolder(): Promise<boolean> {
  if (!dir) return false;
  if ((await dir.requestPermission({ mode: 'readwrite' }).catch(() => 'denied')) === 'granted') return true;
  return (await dir.requestPermission({ mode: 'read' })) === 'granted';
}

/** Ask to change files in the linked folder as well as read them. Must be called from a tap. */
export async function allowWriting(): Promise<boolean> {
  if (!dir) return false;
  if ((await dir.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
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

/**
 * Hears the originals known so far while new or changed files are read, and how many are `left`
 * to read.
 */
export type Progress = (originals: Original[], left: number) => void;

/** A file found, and the original it is once its id is known. */
interface Found { where: string; file: File; make: (id: string) => Original }

/** The PDFs in the linked folder, read now; access must be granted. */
async function folderFiles(): Promise<Found[]> {
  const found: [string, FileSystemFileHandle][] = [];
  await walk(dir!, '', 0, found);
  return Promise.all(found.map(async ([path, h]) => ({ where: 'folder/' + path, file: await h.getFile(), make: (id: string) => folderOriginal({ path, id }) })));
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

/** The name to keep an added PDF under: its own, with ".pdf" added if it hasn't one. */
export const importName = (name: string) => (/\.pdf$/i.test(name) ? name : name + '.pdf');

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
    // Read once: on Android a picked file may not be readable a second time.
    const bytes = await f.arrayBuffer();
    const id = await hashBytes(bytes);
    if (have.has(id)) { already.push(titleOf(importName(f.name))); continue; }
    const name = freeName(importName(f.name), taken);
    const h = await d.getFileHandle(name, { create: true });
    try {
      const w = await h.createWritable();
      await w.write(bytes);
      await w.close();
    } catch (e) {
      await d.removeEntry(name).catch(() => {});
      throw e;
    }
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

/** The copies imported into the app. Empty ones, which failed to be written as they were added, are deleted. */
async function importedFiles(): Promise<Found[]> {
  const d = await importsDir();
  const files: Found[] = [];
  for await (const [name, h] of d.entries()) {
    if (h.kind !== 'file') continue;
    const handle = h as FileSystemFileHandle, file = await handle.getFile();
    if (!file.size) { await d.removeEntry(name).catch(() => {}); continue; }
    files.push({
      where: 'imported/' + name,
      file,
      make: (id) => ({ id, title: titleOf(name), folder: '', location: 'imported', path: name, getFile: () => handle.getFile() }),
    });
  }
  return files;
}

/** The imported copies, with their ids. */
async function importedOriginals(hasher: Hasher): Promise<Original[]> {
  return Promise.all((await importedFiles()).map(async (f) => f.make(await hasher.id(f.where, f.file))));
}

const byTitle = (x: Original, y: Original) => x.title.localeCompare(y.title, undefined, { numeric: true, sensitivity: 'base' });

/**
 * Every original, each file once, sorted by title. Files new or changed since last time are
 * hashed, which reads them whole, one at a time; `progress` hears the originals known so far
 * before the first and after each. An imported copy of a file that is also in the folder is then
 * deleted: `removed` counts them. While the folder is locked, its PDFs are the ones remembered.
 */
export async function allOriginals(state: FolderState, progress?: Progress): Promise<{ originals: Original[]; removed: number }> {
  const hasher = await Hasher.load();
  const remembered = state.kind === 'locked' ? ((await kv.get<ListingEntry[]>(keys.folderListing)) ?? []).map(folderOriginal) : [];
  const files = [...(state.kind === 'ready' ? await folderFiles() : []), ...await importedFiles()];
  const ids = new Map<Found, string>();
  const known = (deleteCopies: boolean) => {
    const done = files.filter((f) => ids.has(f)).map((f) => f.make(ids.get(f)!));
    return oneEach([...remembered, ...done.filter((o) => o.location === 'folder')], done.filter((o) => o.location === 'imported'), deleteCopies);
  };
  const fresh: Found[] = [];
  for (const f of files) {
    if (hasher.known(f.where, f.file)) ids.set(f, await hasher.id(f.where, f.file)); else fresh.push(f);
  }
  for (const [i, f] of fresh.entries()) {
    if (i === 0) progress?.(known(false).originals.sort(byTitle), fresh.length);
    ids.set(f, await hasher.id(f.where, f.file));
    progress?.(known(false).originals.sort(byTitle), fresh.length - i - 1);
  }
  if (state.kind === 'ready') await kv.set(keys.folderListing, files.filter((f) => f.where.startsWith('folder/')).map((f) => ({ path: f.where.slice('folder/'.length), id: ids.get(f)! })));
  await hasher.save(state.kind === 'ready' ? undefined : 'folder/');
  const { originals, copies } = known(state.kind === 'ready');
  for (const c of copies) await removeImported(c);
  await kv.update<Record<string, string>>(keys.titles, (old) => ({ ...old, ...Object.fromEntries(originals.map((o) => [o.id, o.title])) }));
  return { originals: originals.sort(byTitle), removed: copies.length };
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
