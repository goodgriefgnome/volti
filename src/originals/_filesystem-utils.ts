// General helpers with no knowledge of any one score filesystem: walking a folder for its PDFs and
// images (the names in path-utils.ts say which files are scores), writing a file, and hashing bytes.

import { _isOriginalName } from './path-utils';

const MAX_DEPTH = 4;

/** The PDFs and images in `d` and its subfolders, a few deep, by path from it (after `prefix`). */
export async function walk(d: FileSystemDirectoryHandle, prefix: string, depth: number, out: [string, FileSystemFileHandle][]) {
  for await (const [name, h] of d.entries()) {
    if (name.startsWith('.')) continue;
    if (h.kind === 'file' && _isOriginalName(name)) out.push([prefix + name, h as FileSystemFileHandle]);
    else if (h.kind === 'directory' && depth < MAX_DEPTH) await walk(h as FileSystemDirectoryHandle, `${prefix}${name}/`, depth + 1, out);
  }
}

/** Write a new file `name` in `d`, or over the one of that name; one that fails part way is deleted. */
export async function writeFile(d: FileSystemDirectoryHandle, name: string, data: Blob | ArrayBuffer) {
  const h = await d.getFileHandle(name, { create: true });
  try {
    const w = await h.createWritable();
    await w.write(data);
    await w.close();
  } catch (e) {
    await d.removeEntry(name).catch(() => {});
    throw e;
  }
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

/** The SHA-256 of some contents, in hex. */
export const hashBytes = async (bytes: ArrayBuffer) => hex(await crypto.subtle.digest('SHA-256', bytes));

/** The SHA-256 of `file`'s contents, in hex. */
export const hashFile = async (file: Blob) => hashBytes(await file.arrayBuffer());

/**
 * Run `f` on every item with at most `atOnce` running, giving the results in the items' order. Once
 * `signal` aborts it starts no more, and rejects with an AbortError when those running have ended.
 */
export async function inTurns<T, R>(items: readonly T[], atOnce: number, f: (item: T, i: number) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length && !signal?.aborted) {
      const i = next++;
      results[i] = await f(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(atOnce, items.length) }, worker));
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return results;
}
