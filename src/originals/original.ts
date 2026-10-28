// Reading a source file into an original. `_readOriginal` picks how the file is read by its first
// bytes (a PDF: _pdf-source.ts, else an image: _image-source.ts) and wraps what that gives with the
// file in an original that passes its id, path, moving and removing to the file, draws its pages
// through the page cache (page-cache/), and stores their aspects by id.

import { readImage } from './_image-source';
import { drawPage, drawPageProgressive, keepOffline } from '../page-cache/cache';
import type { DrawRequest, OfflinePage, OfflineProgress, PageSource } from '../page-cache/types';
import type { Content, Readable } from './_types';
import { _contents, _noteContents } from './_record-store';
import { sourceFor } from './_sources';
import { isPdf, readPdf } from './_pdf-source';
import type { AskPassword, DrawOptions, Original, RenderedPdf } from './types';

/**
 * Read a source file: an image as it is; a PDF asks for its password now if it has one Volti
 * doesn't know yet, and otherwise reads its music only when its pages or its PDF are wanted.
 */
export async function _readOriginal(f: Readable, ask?: AskPassword): Promise<Original> {
  const file = await f.file();
  const bytes = new Uint8Array(await file.slice(0, 2048).arrayBuffer());
  return new FileOriginal(f, isPdf(bytes) ? await readPdf(f, ask) : readImage(f), file.size);
}

/** The aspects (each page's height / width) stored for an original, without reading its file. */
export function knownAspects(id: string): Promise<number[] | undefined> {
  return Promise.resolve(_contents(id).aspects);
}

/** Store an original's aspects, if they aren't as stored. */
async function storeAspects(id: string, aspects: number[]) {
  await _noteContents(id, { aspects });
}

/** page-cache's keepOffline, for originals: each entry's source is its Original's, if it has one. */
export function keepPagesOffline(
  entries: readonly { id: string; original?: Original; pages: OfflinePage[] }[],
  keep: readonly string[],
  signal?: AbortSignal,
): AsyncIterable<OfflineProgress> {
  return keepOffline(entries.map((e) => ({ id: e.id, source: e.original instanceof FileOriginal ? e.original.source : undefined, pages: e.pages })), keep, signal);
}

/** An original: its file's id, path, moving and removing, and itself as what reading it gives. */
class FileOriginal implements Original {
  readonly source: PageSource;
  constructor(private f: Readable, private content: Content, size: number) {
    this.source = sourceFor(f.id, size, content);
  }
  get id() { return this.f.id; }
  get path() { return this.f.path; }
  move(path: string) { return this.f.move(path); }
  remove() { return this.f.remove(); }
  async read() { return this; }
  pdf(): Promise<RenderedPdf> { return this.content.pdf(); }
  private shapes?: number[];
  async aspects(): Promise<number[]> {
    if (this.shapes) return this.shapes;
    let aspects = await knownAspects(this.id);
    if (!aspects) {
      const pages = await this.content.pages();
      try {
        aspects = await Promise.all(Array.from({ length: pages.pages }, (_, i) => pages.aspect(i + 1)));
      } finally {
        pages.destroy();
      }
      await storeAspects(this.id, aspects);
    }
    return (this.shapes = aspects);
  }
  private async request(page: number, pxWidth: number, o?: DrawOptions): Promise<DrawRequest> {
    const aspect = (await this.aspects())[page - 1];
    return { id: this.id, source: this.source, page, pxWidth, aspect, crop: o?.crop, priority: o?.priority ?? 'now', signal: o?.signal };
  }
  async draw(page: number, pxWidth: number, options?: DrawOptions) { return drawPage(await this.request(page, pxWidth, options)); }
  async *drawProgressive(page: number, pxWidth: number, options?: DrawOptions) {
    yield* drawPageProgressive(await this.request(page, pxWidth, options));
  }
}
