// An original: a score's file, at its path in the library's root (the linked scores folder, or the
// app's own), known by the hash of its contents. What it holds is read only as a PDF (contents.ts),
// whatever the file is; it can be moved (renamed, or into another folder) and removed (into Recently
// removed), asking for the access to the scores folder that needs. There is one Original for each
// id, so a move shows wherever it is held.

import { pdfOf, type OriginalPdf } from './contents';
import { fileAt, makeFolder, needAccess, placeOf, relist, whereIs } from './folder';
import { rememberHash } from './hashes';
import { folderOf, isOriginalName, tidyPath } from './names';
import type { AskPassword } from './open';
import { removeFile } from './removed';

/** What names an original: its id, and where it is. A file coming into the library has them too. */
export type Named = Pick<Original, 'id' | 'path'>;

/** A score's original: a PDF or an image in the library. */
export interface Original {
  /** The SHA-256 of the file's contents, in hex; also the id of the score made from it. */
  readonly id: string;
  /** Where it is in the library's root: "Masses/Latin/Mass in G.pdf". */
  readonly path: string;
  /**
   * What it holds, as a PDF (contents.ts): a password it needs is asked of `ask`. Throws
   * PasswordNotGiven when it isn't given, and NoAccess when the scores folder can't be read.
   */
  pdf(ask?: AskPassword): Promise<OriginalPdf>;
  /**
   * Rename it, or move it into another folder ('' at the top), or both, making the folders that
   * aren't there yet; its score stays, as its contents don't change. Says why when it can't (a file
   * of that name is there already); throws NoAccess when the scores folder can't be changed.
   */
  move(path: string): Promise<string | null>;
  /** Move its file into Recently removed. Throws NoAccess when the scores folder can't be changed. */
  remove(): Promise<void>;
}

/** The name at the end of a path. */
const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** A folder as the user reads it, for saying where a file is. */
const shown = (folder: string) => (folder ? folder.split('/').join(' / ') : 'the top of the library');

class FileOriginal implements Original {
  constructor(readonly id: string, public path: string) {}

  /** Its file. */
  async file(): Promise<File> {
    await needAccess('read');
    return fileAt(this.path);
  }

  async pdf(ask?: AskPassword): Promise<OriginalPdf> {
    return pdfOf(this, await this.file(), ask);
  }

  async move(path: string): Promise<string | null> {
    const to = tidyPath(path);
    if (to === this.path) return null;
    if (!isOriginalName(to)) return `“${nameOf(to)}” doesn’t end in .pdf or an image’s ending, so Volti wouldn’t find it.`;
    return this.moveInRoot(to);
  }

  /** There is a file called `name` where it is being moved. */
  private taken(name: string, folder: string) {
    return folder === folderOf(this.path) ? `There is already a file called “${name}” there.` : `There is already a file called “${name}” in ${shown(folder)}.`;
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
          : `Copied it into ${shown(folder)}, but couldn't delete it here. Delete it in the Files app.`;
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
    await removeFile(this.id, this.path);
    await relist(this.id);
  }
}

/** Each id's Original. */
const made = new Map<string, FileOriginal>();

/** The Original with id `id` at `path`: the one already made for it, brought up to date. */
export function originalOf(id: string, path: string): Original {
  let o = made.get(id);
  if (!o) made.set(id, (o = new FileOriginal(id, path)));
  else o.path = path;
  return o;
}

/** An original's file, for reading what only originals/ reads from it. */
export const fileOf = (o: Original) => (o as FileOriginal).file();
