// Saved pictures of the original pages setlists play, so they show at once instead of being drawn:
// each a page as drawn for this tablet's screen, as WebP in the private storage (OPFS), named by
// score id, page and width in device pixels. A score's id is its PDF's contents and a picture is of
// a whole page, so one is never out of date; it goes when no setlist plays its page any more.

import type { PagePictures } from '../originals/types';

const DIR = 'page-pictures';
const fileName = (id: string, num: number, width: number) => `${id}-${num}-${width}.webp`;

const dir = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(DIR, { create: true });

/** The names of the pictures saved, read once. */
let saved: Promise<Set<string>> | undefined;
function names(): Promise<Set<string>> {
  return (saved ??= (async () => {
    const out = new Set<string>();
    try {
      for await (const name of (await dir()).keys()) out.add(name);
    } catch (e) {
      console.warn('No saved pictures:', e);
    }
    return out;
  })());
}

/** The pages each score's setlists play (1-based), by score id; as last worked out. */
let wanted = new Map<string, Set<number>>();
export const _setWanted = (w: Map<string, Set<number>>) => { wanted = w; };

/** Whether there is a picture of any of the score's pages. */
export const hasPictures = async (id: string) => [...(await names())].some((n) => n.startsWith(id + '-'));

/** Whether there is a picture of the page at this width. */
export const _hasPicture = async (id: string, num: number, width: number) => (await names()).has(fileName(id, num, width));

async function read(name: string): Promise<HTMLCanvasElement | null> {
  try {
    const bitmap = await createImageBitmap(await (await (await dir()).getFileHandle(name)).getFile());
    const canvas = Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height });
    canvas.getContext('2d', { alpha: false })!.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas;
  } catch (e) {
    console.warn('Could not read a saved picture:', e);
    (await names()).delete(name);
    return null;
  }
}

async function write(name: string, canvas: HTMLCanvasElement) {
  const all = await names();
  if (all.has(name)) return;
  all.add(name); // taken, so it is written once
  try {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
    if (!blob) throw new Error('Could not encode it');
    const w = await (await (await dir()).getFileHandle(name, { create: true })).createWritable();
    await w.write(blob);
    await w.close();
  } catch (e) {
    console.warn('Could not save a picture:', e);
    all.delete(name);
  }
}

/** A score's saved pictures, for its page cache: pages a setlist plays are kept as they are drawn. */
export function picturesOf(id: string): PagePictures {
  return {
    get: async (num, width) => ((await names()).has(fileName(id, num, width)) ? read(fileName(id, num, width)) : null),
    put: (num, width, canvas) => { if (wanted.get(id)?.has(num)) void write(fileName(id, num, width), canvas); },
  };
}

/** How much room the saved pictures take, in bytes. */
export async function picturesBytes(): Promise<number> {
  let n = 0;
  for await (const [, h] of (await dir()).entries()) if (h.kind === 'file') n += (await (h as FileSystemFileHandle).getFile()).size;
  return n;
}

/** Delete the pictures of pages no setlist plays, but not those of the scores in `unsure`. */
export async function _tidyPictures(keep: Map<string, Set<number>>, unsure: Set<string>) {
  const all = await names();
  const d = await dir();
  for (const name of [...all]) {
    const m = /^(.+)-(\d+)-(\d+)\.webp$/.exec(name);
    if (!m || unsure.has(m[1]) || keep.get(m[1])?.has(Number(m[2]))) continue;
    all.delete(name);
    await d.removeEntry(name).catch(() => {});
  }
}
