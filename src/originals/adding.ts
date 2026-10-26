// Files coming into the library, from Add PDFs, shared from other apps (the inbox), put back from
// Recently removed, or left in the app's own folder when a folder is linked: each a source file held
// outside the library (a HeldFile), known by its id, which moving puts at the path chosen for it in
// the library's root (arrivals.ts says what happens to each there).

import type { AskPassword } from './contents';
import { appFiles, makeFolder, needAccess, removeAppFile, whereIs, writeFile } from './folder';
import { Hasher, hashBytes, rememberHash } from './hashes';
import { folderOf, importName, nameOf, shownFolder, tidyPath, unfoundName } from './names';
import { readAs, sourceFileOf, type Original, type Readable, type SourceFile } from './original';
import { forgetRemoved, removedFile, type Removed } from './removed';

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
    const unfound = unfoundName(to);
    if (unfound) return unfound;
    await needAccess('readwrite');
    const d = await makeFolder(folder);
    if (await d.getFileHandle(name).then(() => true, () => false)) return `There is already a file called “${name}” in ${shownFolder(folder)}.`;
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
const heldFile = (id: string, path: string, bytes: File, drop: () => Promise<void> = async () => {}): SourceFile =>
  new HeldFile(id, path, bytes, drop);

/**
 * A file coming in, read once (on Android a picked file may not be readable a second time), with
 * an ending its name says it is a PDF or an image by; it would go at `path`, by default its own
 * name at the top.
 */
export async function readIncoming(f: File, path?: string): Promise<SourceFile> {
  const bytes = await f.arrayBuffer();
  const file = new File([bytes], importName(f.name, f.type), { type: f.type, lastModified: f.lastModified });
  return heldFile(await hashBytes(bytes), path ?? file.name, file);
}

/**
 * The files in the app's own folder while a folder is linked: those not moved into it yet, each at
 * its path there, which moving it into the linked folder, or removing it, deletes. Each is known
 * by its hash, as last worked out where it hasn't changed.
 */
export async function leftInApp(): Promise<SourceFile[]> {
  const hasher = await Hasher.load();
  const out: SourceFile[] = [];
  for (const { path, file } of await appFiles()) out.push(heldFile(await hasher.id('app/' + path, file), path, file, () => removeAppFile(path)));
  return out;
}

/** A file in Recently removed, at the path it had: moving it puts it back, and forgets it there. */
export async function removedSource(r: Removed): Promise<SourceFile> {
  return heldFile(r.id, r.path, await removedFile(r), () => forgetRemoved(r.key));
}
