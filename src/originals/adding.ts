// Files coming into the library, from Add PDFs, shared from other apps (the inbox), put back from
// Recently removed, or left in the app's own folder when a folder is linked: each read once and
// known by its id, previewed, and put at the path chosen for it in the library's root (arrivals.ts
// says what happens to each there).

import { pdfOf } from './contents';
import { appFiles, makeFolder, needAccess, removeAppFile, whereIs, writeFile } from './folder';
import { Hasher, hashBytes, rememberHash } from './hashes';
import { folderOf, importName } from './names';
import type { AskPassword } from './open';
import { originalOf, type Named } from './original';
import type { PageCache } from './pages';
import { openPdf } from './pdf';

/** A file coming into the library: its contents, read once, and its id. */
export interface Incoming { id: string; file: File }

/**
 * Read a file coming in, once (on Android a picked file may not be readable a second time), with
 * an ending its name says it is a PDF or an image by.
 */
export async function readIncoming(f: File): Promise<Incoming> {
  const bytes = await f.arrayBuffer();
  const file = new File([bytes], importName(f.name, f.type), { type: f.type, lastModified: f.lastModified });
  return { id: await hashBytes(bytes), file };
}

/**
 * Open the pages of a file coming in, to preview; `at` is where it would go. Its password, as an
 * original's, is remembered by its id, asked of `ask`: without one, it throws PasswordNotGiven.
 */
export async function previewIncoming(at: Named, file: File, ask?: AskPassword): Promise<PageCache> {
  return openPdf((await pdfOf(at, file, ask)).bytes);
}

/**
 * Put a file coming in at `path` in the library's root, making the folders that aren't there; with
 * `replacing`, the file there now, that one goes to Recently removed first. Says why when
 * it can't (another file is there); asks for write access (from a tap), or throws NoAccess.
 */
export async function putIncoming(f: Incoming, path: string, replacing?: Named): Promise<string | null> {
  await needAccess('readwrite');
  const d = await makeFolder(folderOf(path));
  const name = path.slice(path.lastIndexOf('/') + 1);
  if (replacing) await originalOf(replacing.id, replacing.path).remove();
  if (await d.getFileHandle(name).then(() => true, () => false)) return `There is another file called “${name}” there.`;
  await writeFile(d, name, f.file);
  // Its contents are known: no need to read it again.
  await rememberHash(await whereIs(path), await (await d.getFileHandle(name)).getFile(), f.id);
  return null;
}

/** A file left in the app's own folder, with its path there. */
export interface LeftInApp extends Incoming { path: string }

/**
 * The scores in the app's own folder while a folder is linked: those not moved into it yet. Each
 * is known by its hash, as last worked out where it hasn't changed.
 */
export async function leftInApp(): Promise<LeftInApp[]> {
  const hasher = await Hasher.load();
  const out: LeftInApp[] = [];
  for (const { path, file } of await appFiles()) out.push({ path, file, id: await hasher.id('app/' + path, file) });
  return out;
}

/** Delete a file left in the app's own folder, once it is in the linked folder (or was already). */
export const dropLeftInApp = (f: LeftInApp) => removeAppFile(f.path);
