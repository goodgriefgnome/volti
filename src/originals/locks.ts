// Which originals are locked: PDFs that need a password Volti doesn't know yet. A locked score
// can't be read, nor its pages saved as pictures, until its password is given, so it goes into a
// setlist only once it has been.

import { keys, kv } from '../storage';
import { isImageName } from './names';
import { openOriginal, PasswordNotGiven, savedPassword } from './open';
import type { Original } from './originals';

/** Whether each original needs a password, by id; one not in it hasn't been looked at yet. */
type Locks = Record<string, boolean>;

/** How much of each end of a file to look through for its encryption. */
const ENDS = 64 * 1024;
const ENCRYPT = new TextEncoder().encode('/Encrypt');

/** Whether `bytes` holds `word`. */
export function holds(bytes: Uint8Array, word: Uint8Array): boolean {
  outer: for (let i = 0; i + word.length <= bytes.length; i++) {
    for (let j = 0; j < word.length; j++) if (bytes[i + j] !== word[j]) continue outer;
    return true;
  }
  return false;
}

/**
 * Whether a PDF is encrypted: its trailer names an /Encrypt dictionary. The trailer is at the end
 * of the file, or for one laid out for the web (linearized), at the start too, so only the ends are
 * read.
 */
async function encrypted(file: File): Promise<boolean> {
  const ends = file.size <= 2 * ENDS ? [file] : [file.slice(0, ENDS), file.slice(file.size - ENDS)];
  for (const part of ends) if (holds(new Uint8Array(await part.arrayBuffer()), ENCRYPT)) return true;
  return false;
}

/** Whether an encrypted original needs a password: pdf.js tries it without one. */
async function needsPassword(o: Original): Promise<boolean> {
  if ((await savedPassword(o.id)) !== undefined) return true;
  try {
    (await openOriginal(o)).destroy();
    return false;
  } catch (e) {
    if (e instanceof PasswordNotGiven) return true;
    throw e;
  }
}

/**
 * The ids of the originals that are locked: they need a password, and none is remembered. Each is
 * worked out once (reading the ends of its file, and trying an encrypted one without a password);
 * one not `readable` now (the folder's access not allowed yet) is left out until it is.
 */
export async function lockedOriginals(originals: readonly Original[], readable: (o: Original) => boolean): Promise<Set<string>> {
  const locks = (await kv.get<Locks>(keys.locks)) ?? {};
  let found = false;
  for (const o of originals) {
    if (o.id in locks || !readable(o)) continue;
    if (isImageName(o.path)) { locks[o.id] = false; found = true; continue; }
    try {
      locks[o.id] = (await encrypted(await o.getFile())) && (await needsPassword(o));
      found = true;
    } catch (e) {
      console.warn(`Could not tell whether “${o.title}” has a password:`, e);
    }
  }
  if (found) await kv.update<Locks>(keys.locks, (old) => ({ ...old, ...locks }));
  const ids = originals.filter((o) => locks[o.id]).map((o) => o.id);
  const known = await Promise.all(ids.map(savedPassword));
  return new Set(ids.filter((_, i) => known[i] === undefined));
}
