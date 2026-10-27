// The library's root: the linked scores folder (File System Access) when there is one, and Volti's
// own folder in OPFS (folder.ts) when there isn't. Both are folders with true paths, read the same
// way; what differs is the linked folder's: linking it, asking for access to it, and the listing
// remembered for while access is locked. A file in the root is a source file that can be moved
// (renamed, or into another folder) and removed (into Recently removed), asking for the access that
// needs. The only code that holds the linked folder's handle.

import { keys, kv } from '../storage';
import { opfsRoot } from './folder';
import { walk } from './filesystem-utils';
import { rememberHash } from './hashes';
import { folderOf, nameOf, shownFolder, tidyPath, unfoundName } from './path-utils';
import type { Readable } from './internal-types';
import { readOriginal } from './original';
import { forgetRemoved, keepRemoved } from './removed';
import { NoAccess, type AskPassword, type FolderState, type Original, type SourceFile } from './types';

let dir: FileSystemDirectoryHandle | undefined;

/** The linked folder, if there is one. */
export const linked = async () => (dir ??= await kv.get<FileSystemDirectoryHandle>(keys.folder));

/** The library's root: the linked folder, or the app's own. Access to a linked one must be allowed. */
async function root(): Promise<FileSystemDirectoryHandle> {
  return (await linked()) ?? opfsRoot();
}

/** Where a file in the root is, for remembering its hash: the linked folder's and the app's are kept apart. */
export const whereIs = async (path: string) => ((await linked()) ? 'folder/' : 'app/') + path;

export const canLinkFolder = () => 'showDirectoryPicker' in window;

export async function folderState(): Promise<FolderState> {
  const dir = await linked();
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
  const dir = await linked();
  if (!dir) return false;
  if ((await dir.requestPermission({ mode: 'readwrite' }).catch(() => 'denied')) === 'granted') return true;
  return (await dir.requestPermission({ mode: 'read' })) === 'granted';
}

/**
 * Make sure the root can be read (`read`) or changed too (`readwrite`), asking for access to a
 * linked folder where it isn't allowed yet (the app's own needs none). Asking works only from a
 * tap: elsewhere, or when it is refused, throws NoAccess.
 */
export async function needAccess(mode: 'read' | 'readwrite'): Promise<void> {
  const dir = await linked();
  if (!dir) return;
  if ((await dir.queryPermission({ mode })) === 'granted') return;
  if ((await dir.requestPermission({ mode }).catch(() => 'denied')) !== 'granted') throw new NoAccess(`No access to the scores folder (${mode})`);
}

export async function unlinkFolder(): Promise<void> {
  dir = undefined;
  await kv.del(keys.folder);
  await kv.del(keys.folderListing);
}

/** A PDF in the linked folder, as last read: listed from this while access is locked. */
interface ListingEntry { path: string; id: string }

/** The file at `path` in the root. Access must be allowed. */
async function fileAt(path: string): Promise<File> {
  const [d, name] = await placeOf(path);
  return (await d.getFileHandle(name)).getFile();
}

/** The folder a path in the root is in, and the file's name. */
async function placeOf(path: string): Promise<[FileSystemDirectoryHandle, string]> {
  const parts = path.split('/');
  let d = await root();
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
  return [d, parts.at(-1)!];
}

/**
 * The subfolder `path` of the root ('' for the root itself), making the folders on it that aren't
 * there yet. Write access must have been allowed.
 */
export async function makeFolder(path: string): Promise<FileSystemDirectoryHandle> {
  let d = await root();
  for (const p of path ? path.split('/') : []) d = await d.getDirectoryHandle(p, { create: true });
  return d;
}

/** The PDFs and images in the root, read now, by path; access must be granted. */
export async function folderFiles(): Promise<{ path: string; file: File }[]> {
  const found: [string, FileSystemFileHandle][] = [];
  await walk(await root(), '', 0, found);
  return Promise.all(found.map(async ([path, h]) => ({ path, file: await h.getFile() })));
}

/** The linked folder's PDFs as last read; none while no folder is linked. */
export const rememberedListing = async () => (await kv.get<ListingEntry[]>(keys.folderListing)) ?? [];

/** Remember the root's PDFs, as just read, where it is a linked folder. */
export const saveListing = async (listing: ListingEntry[]) => { if (await linked()) await kv.set(keys.folderListing, listing); };

/**
 * Note in the remembered listing that score `id`'s file is at `path` now (renamed or moved), or
 * with no `path`, that it is gone.
 */
const relist = async (id: string, path?: string) => {
  if (await linked()) await kv.update<ListingEntry[]>(keys.folderListing, (old) => (old ?? []).flatMap((e) => (e.id !== id ? [e] : path ? [{ ...e, path }] : [])));
};

/* ---------- its files ---------- */

/** A file at its path in the library's root. */
class RootFile implements Readable {
  constructor(readonly id: string, public path: string) {}

  async file(): Promise<File> {
    await needAccess('read');
    return fileAt(this.path);
  }

  read(ask?: AskPassword): Promise<Original> {
    return readOriginal(this, ask);
  }

  async move(path: string): Promise<string | null> {
    const to = tidyPath(path);
    if (to === this.path) return null;
    const unfound = unfoundName(to);
    if (unfound) return unfound;
    return this.moveInRoot(to);
  }

  /** There is a file called `name` where it is being moved. */
  private taken(name: string, folder: string) {
    return folder === folderOf(this.path) ? `There is already a file called “${name}” there.` : `There is already a file called “${name}” in ${shownFolder(folder)}.`;
  }

  private async moveInRoot(to: string): Promise<string | null> {
    await needAccess('readwrite');
    const [from, old] = await placeOf(this.path);
    const folder = folderOf(to), name = nameOf(to);
    const into = folder === folderOf(this.path) ? from : await makeFolder(folder);
    // The same folder, even when written differently (as a folder that ignores case can be).
    const same = into === from || (await into.isSameEntry(from));
    const now = same ? (folderOf(this.path) ? folderOf(this.path) + '/' : '') + name : to;
    if (same && name === old) return null;
    // Changing only the case finds the file itself where the file system ignores case.
    const caseOnly = same && name.toLowerCase() === old.toLowerCase();
    if (!caseOnly && (await into.getFileHandle(name).then(() => true, () => false))) return this.taken(name, folder);
    const h = await from.getFileHandle(old);
    // Where it can't be moved (as in some of Android's folders), copy it there, then delete it here.
    const moved = h.move
      ? await (same ? h.move(name) : h.move(into, name)).then(() => true, (e) => { console.warn('Moving by copying, as moving failed:', e); return false; })
      : false;
    if (!moved) {
      if (caseOnly) return 'Only the case changes, and this folder can\'t do that. Change another letter too.';
      const copy = await into.getFileHandle(name, { create: true });
      try {
        const w = await copy.createWritable();
        await w.write(await h.getFile());
        await w.close();
      } catch (e) {
        await into.removeEntry(name).catch(() => {});
        throw e;
      }
      // Both are the same score now, so one left behind only shows twice in the Files app.
      if (!(await from.removeEntry(old).then(() => true, () => false))) {
        return same ? `Copied it as “${name}”, but couldn't delete “${old}”. Delete it in the Files app.`
          : `Copied it into ${shownFolder(folder)}, but couldn't delete it here. Delete it in the Files app.`;
      }
    }
    // The same contents, so the same id: no need to read it again.
    await rememberHash(await whereIs(now), await (await into.getFileHandle(name)).getFile(), this.id);
    await relist(this.id, now);
    this.path = now;
    return null;
  }

  async remove(): Promise<void> {
    await needAccess('readwrite');
    const [d, name] = await placeOf(this.path);
    const key = await keepRemoved(this.id, this.path, await (await d.getFileHandle(name)).getFile());
    try {
      await d.removeEntry(name);
    } catch (e) {
      // Still in the library: not removed after all.
      await forgetRemoved(key);
      throw e;
    }
    await relist(this.id);
  }
}

/** Each id's file in the root. */
const made = new Map<string, RootFile>();

/** The file in the root with id `id` at `path`: the one already made for it, brought up to date. */
export function sourceFileOf(id: string, path: string): SourceFile {
  let o = made.get(id);
  if (!o) made.set(id, (o = new RootFile(id, path)));
  else o.path = path;
  return o;
}
