// Files coming into the library, from Add PDFs, shared from other apps (the inbox), put back from
// Recently removed, or left in the app's own folder when a folder is linked: each a source file held
// outside the library, known by its id, which moving puts at the path chosen for it in the
// library's root (arrivals.ts says what happens to each there).

import { appFiles, removeAppFile } from './folder';
import { Hasher, hashBytes } from './hashes';
import { importName } from './names';
import { heldFile, type SourceFile } from './original';
import { forgetRemoved, removedFile, type Removed } from './removed';

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
