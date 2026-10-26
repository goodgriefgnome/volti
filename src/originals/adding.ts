// Files coming into the library, from Add PDFs, shared from other apps (the inbox), put back from
// Recently removed, or left in the app's own folder when a folder is linked: each a source file held
// outside the library, read once and known by its id, and put at the path chosen for it in the
// library's root (arrivals.ts says what happens to each there).

import { appFiles, makeFolder, needAccess, removeAppFile, whereIs, writeFile } from './folder';
import { Hasher, hashBytes, rememberHash } from './hashes';
import { folderOf, importName } from './names';
import { fileOf, heldFile, type SourceFile } from './original';

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
 * Put a file coming in at `path` in the library's root, making the folders that aren't there; with
 * `replacing`, the library's file there now, that one goes to Recently removed first. Says why when
 * it can't (another file is there); asks for write access (from a tap), or throws NoAccess.
 */
export async function putIncoming(f: SourceFile, path: string, replacing?: SourceFile): Promise<string | null> {
  await needAccess('readwrite');
  const d = await makeFolder(folderOf(path));
  const name = path.slice(path.lastIndexOf('/') + 1);
  if (replacing) await replacing.remove();
  if (await d.getFileHandle(name).then(() => true, () => false)) return `There is another file called “${name}” there.`;
  await writeFile(d, name, await fileOf(f));
  // Its contents are known: no need to read it again.
  await rememberHash(await whereIs(path), await (await d.getFileHandle(name)).getFile(), f.id);
  return null;
}

/**
 * The files in the app's own folder while a folder is linked: those not moved into it yet, each at
 * its path there, which removing it deletes. Each is known by its hash, as last worked out where it
 * hasn't changed.
 */
export async function leftInApp(): Promise<SourceFile[]> {
  const hasher = await Hasher.load();
  const out: SourceFile[] = [];
  for (const { path, file } of await appFiles()) out.push(heldFile(await hasher.id('app/' + path, file), path, file, () => removeAppFile(path)));
  return out;
}
