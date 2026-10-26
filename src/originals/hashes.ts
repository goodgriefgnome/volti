// Originals' ids: the SHA-256 of each file's contents, kept with the size and modified time it was
// worked out for, so a file is read whole again only when it changes.

import { keys, kv } from '../storage';

/** A file's hash, good while its size and modified time stay the same. */
interface Hashed { size: number; modified: number; id: string }

/** Hashes by where the file is: "folder/" + its path in the linked folder, or "app/" + its path in the app's own. */
type HashCache = Record<string, Hashed>;

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

/** The SHA-256 of some contents, in hex. */
export const hashBytes = async (bytes: ArrayBuffer) => hex(await crypto.subtle.digest('SHA-256', bytes));

/** The SHA-256 of `file`'s contents, in hex. */
export const hashFile = async (file: Blob) => hashBytes(await file.arrayBuffer());

/** Ids for files, hashing only those that changed since they were last hashed. */
export class Hasher {
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
  save(keep: readonly string[] = []) {
    const kept = Object.entries(this.before).filter(([k]) => keep.some((p) => k.startsWith(p)));
    return kv.set(keys.hashes, { ...Object.fromEntries(kept), ...this.now });
  }
}

/** Note the id of a file whose contents are known, such as one just renamed, so it isn't read again. */
export async function rememberHash(where: string, file: File, id: string) {
  await kv.update<HashCache>(keys.hashes, (old) => ({ ...old, [where]: { size: file.size, modified: file.lastModified, id } }));
}
