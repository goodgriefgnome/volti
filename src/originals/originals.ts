// Scores' originals: the PDFs in the linked folder (folder.ts) and the copies imported into the app
// (imported.ts), listed together, each known by the hash of its contents (hashes.ts), and renamed.
// Only finding, reading and renaming files; the score made from an original is in scores/, and
// opening one's pages is open.ts.

import { keys } from '../storage/keys';
import { kv } from '../storage/kv';
import { folderFiles, folderOriginal, placeOf, rememberedListing, saveListing, type FolderState } from './folder';
import { Hasher, rememberHash } from './hashes';
import { importedFiles, importsDir, removeImported } from './imported';
import { endingOf, titleOf } from './names';

/** A score's original: a PDF in the linked folder or imported into the app. */
export interface Original {
  /** The SHA-256 of the file's contents, in hex; also the id of the score made from it. */
  id: string;
  title: string;
  /**
   * Subfolder within the linked folder ("Masses/Latin"), '' at its top. An imported original's is
   * the one it is filed under in the library (`fileAdded`), as it is in no folder.
   */
  folder: string;
  location: 'folder' | 'imported';
  /** Where the file is: its path within the linked folder, or its name among the imported copies. */
  path: string;
  getFile(): Promise<File>;
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

/**
 * Hears the originals known so far while new or changed files are read, and how many are `left`
 * to read.
 */
export type Progress = (originals: Original[], left: number) => void;

/** A file found, and the original it is once its id is known. */
export interface Found { where: string; file: File; make: (id: string) => Original }

const byTitle = (x: Original, y: Original) => x.title.localeCompare(y.title, undefined, { numeric: true, sensitivity: 'base' });

/**
 * Every original, each file once, sorted by title. Files new or changed since last time are
 * hashed, which reads them whole, one at a time; `progress` hears the originals known so far
 * before the first and after each. An imported copy of a file that is also in the folder is then
 * deleted: `removed` counts them. While the folder is locked, its PDFs are the ones remembered.
 */
export async function allOriginals(state: FolderState, progress?: Progress): Promise<{ originals: Original[]; removed: number }> {
  const hasher = await Hasher.load();
  const remembered = state.kind === 'locked' ? (await rememberedListing()).map(folderOriginal) : [];
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
  if (state.kind === 'ready') await saveListing(files.filter((f) => f.where.startsWith('folder/')).map((f) => ({ path: f.where.slice('folder/'.length), id: ids.get(f)! })));
  await hasher.save(state.kind === 'ready' ? undefined : 'folder/');
  const { originals, copies } = known(state.kind === 'ready');
  for (const c of copies) await removeImported(c);
  await kv.update<Record<string, string>>(keys.titles, (old) => ({ ...old, ...Object.fromEntries(originals.map((o) => [o.id, o.title])) }));
  return { originals: originals.sort(byTitle), removed: copies.length };
}

/** The file name `title` gives an original: with its ending, ".pdf" or an image's. */
const fileName = (o: Original, title: string) => title.trim() + (endingOf(o.path) || '.pdf');

/** The original as it is once renamed to `title` (by renameOriginal): the same score, under the new name. */
export function renamedOriginal(o: Original, title: string): Original {
  const name = fileName(o, title);
  if (o.location === 'folder') return folderOriginal({ path: o.path.slice(0, o.path.lastIndexOf('/') + 1) + name, id: o.id });
  return { ...o, title: titleOf(name), path: name, getFile: async () => (await (await importsDir()).getFileHandle(name)).getFile() };
}

/**
 * Rename an original's file to `title` (with its ending, ".pdf" or an image's), in the same folder; its score stays, as its
 * contents haven't changed. For the linked folder, write access must have been allowed. Says why
 * when it can't (a file of that name is there already).
 */
export async function renameOriginal(o: Original, title: string): Promise<string | null> {
  const name = fileName(o, title);
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
  await rememberHash(where, file, o.id);
  return null;
}
