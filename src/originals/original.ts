// Source files and originals. A source file is bytes Volti can read as music, known by the hash of
// its contents: a file at its path in the library's root (the linked scores folder, or the app's
// own), which can be moved (renamed, or into another folder) and removed (into Recently removed),
// asking for the access to the scores folder that needs; or a file Volti holds outside the library
// (coming in, left in its own folder while one is linked, or in Recently removed), which moving puts
// into the library. Reading one gives its original: its
// pages to draw, and its music as a PDF for export. A PDF is read with pdf.js (contents.ts), asking
// for its password the first time it needs one; an image is drawn from its decoded bitmap
// (image.ts). There is one source file for each id in the root, so a move shows wherever it is held.

import { encrypted, imagePdf, pdfOf, type OriginalPdf } from './contents';
import { isPdf } from './file-kind';
import { fileAt, makeFolder, needAccess, placeOf, relist, whereIs, writeFile } from './folder';
import { rememberHash } from './hashes';
import { openImage } from './image';
import { folderOf, isOriginalName, tidyPath } from './names';
import { savedPassword, type AskPassword } from './open';
import type { PageCache } from './pages';
import { openPdf } from './pdf';
import { removeFile } from './removed';

/** Bytes Volti can read as music: a PDF or an image. */
export interface SourceFile {
  /** The SHA-256 of the file's contents, in hex; also the id of the score made from it. */
  readonly id: string;
  /** Where it is in the library's root ("Masses/Latin/Mass in G.pdf"), or would go. */
  readonly path: string;
  /**
   * Rename it, or move it into another folder ('' at the top), or both, making the folders that
   * aren't there yet; its score stays, as its contents don't change. One held outside the library
   * is moved into it. Says why when it can't (a file of that name is there already); throws
   * NoAccess when the scores folder can't be changed.
   */
  move(path: string): Promise<string | null>;
  /** Move it out of the library, into Recently removed; or drop one held outside it. Throws NoAccess when the scores folder can't be changed. */
  remove(): Promise<void>;
  /**
   * Read it as music: its original. A PDF with a password not known yet asks `ask` for it, and
   * remembers it (without `ask`, it throws PasswordNotGiven); throws NoAccess when the scores
   * folder can't be read.
   */
  read(ask?: AskPassword): Promise<Original>;
}

/** A source file Volti has read: what a score is made from. */
export interface Original extends SourceFile {
  /** Its pages, to draw. */
  pages(): Promise<PageCache>;
  /** Its music as a PDF, for export (contents.ts). */
  pdf(): Promise<OriginalPdf>;
}

/** The name at the end of a path. */
const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** A folder as the user reads it, for saying where a file is. */
const shown = (folder: string) => (folder ? folder.split('/').join(' / ') : 'the top of the library');

/** A source file's bytes, for reading what only originals/ reads from it. */
interface Readable extends SourceFile { file(): Promise<File> }

/** A file at its path in the library's root. */
class RootFile implements Readable {
  constructor(readonly id: string, public path: string) {}

  async file(): Promise<File> {
    await needAccess('read');
    return fileAt(this.path);
  }

  read(ask?: AskPassword): Promise<Original> {
    return readAs(this, ask);
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

/**
 * A file Volti holds outside the library: coming in, left in its own folder, or in Recently
 * removed. Moving it puts it into the library, and drops it from where it was held; from then on
 * it is the library's file there.
 */
class HeldFile implements Readable {
  /** Once moved into the library, the file there, which does the rest. */
  private moved?: SourceFile;

  constructor(readonly id: string, private at: string, private bytes: File, private drop: () => Promise<void>) {}

  get path() { return this.moved?.path ?? this.at; }
  async file() { return this.bytes; }
  read(ask?: AskPassword): Promise<Original> { return this.moved ? this.moved.read(ask) : readAs(this, ask); }
  remove() { return this.moved ? this.moved.remove() : this.drop(); }

  async move(path: string): Promise<string | null> {
    if (this.moved) return this.moved.move(path);
    const to = tidyPath(path), folder = folderOf(to), name = nameOf(to);
    if (!isOriginalName(to)) return `“${name}” doesn’t end in .pdf or an image’s ending, so Volti wouldn’t find it.`;
    await needAccess('readwrite');
    const d = await makeFolder(folder);
    if (await d.getFileHandle(name).then(() => true, () => false)) return `There is already a file called “${name}” in ${shown(folder)}.`;
    await writeFile(d, name, this.bytes);
    // Its contents are known: no need to read it again.
    await rememberHash(await whereIs(to), await (await d.getFileHandle(name)).getFile(), this.id);
    this.moved = sourceFileOf(this.id, to);
    await this.drop();
    return null;
  }
}

/**
 * A file Volti holds outside the library, `bytes`, at `path` (where it would go); `drop` is what
 * removing it does, and what moving it into the library does once it is there.
 */
export const heldFile = (id: string, path: string, bytes: File, drop: () => Promise<void> = async () => {}): SourceFile =>
  new HeldFile(id, path, bytes, drop);

/**
 * Read a source file: an image as it is; a PDF asks for its password now if it has one Volti
 * doesn't know yet (its music, worked out to try it, is kept for its pages), and otherwise reads
 * its music only when its pages or its PDF are wanted.
 */
async function readAs(f: Readable, ask?: AskPassword): Promise<Original> {
  const file = await f.file();
  if (!isPdf(new Uint8Array(await file.slice(0, 2048).arrayBuffer()))) return new ImageOriginal(f);
  const known = !(await encrypted(file)) || (await savedPassword(f.id)) !== undefined;
  return new PdfOriginal(f, known ? undefined : await pdfOf(f, file, ask));
}

/** An original: its file's id, path, moving and removing, and itself as what reading it gives. */
abstract class BaseOriginal implements Original {
  constructor(protected f: Readable) {}
  get id() { return this.f.id; }
  get path() { return this.f.path; }
  move(path: string) { return this.f.move(path); }
  remove() { return this.f.remove(); }
  async read() { return this; }
  abstract pages(): Promise<PageCache>;
  abstract pdf(): Promise<OriginalPdf>;
}

class PdfOriginal extends BaseOriginal {
  /** Its music, worked out when it was read, until its pages or its PDF take it. */
  constructor(f: Readable, private held?: OriginalPdf) { super(f); }

  async pdf(): Promise<OriginalPdf> {
    const held = this.held;
    this.held = undefined; // pdf.js takes the bytes it is given
    return held ?? pdfOf(this.f, await this.f.file());
  }

  async pages(): Promise<PageCache> {
    return openPdf((await this.pdf()).bytes);
  }
}

class ImageOriginal extends BaseOriginal {
  async pdf(): Promise<OriginalPdf> { return imagePdf(await this.f.file()); }
  async pages(): Promise<PageCache> { return openImage(await this.f.file()); }
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
