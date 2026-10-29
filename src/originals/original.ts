// Reading a source file into an original. `_readOriginal` picks how the file is read by its first
// bytes (a PDF: _pdf-source.ts, else an image: _image-source.ts) and wraps what that gives with the
// file in an original that passes its id, path, moving and removing to the file, draws its pages
// through the page cache (page-cache/), and stores their aspects by id.

import { readImage } from './_image-source';
import { drawPage, drawPageProgressive, hasSaved, saveOffline } from '../page-cache/cache';
import { NotSaved, type DrawRequest, type OfflinePage, type PageSource } from '../page-cache/types';
import type { Content, Readable } from './_types';
import { _contents, _noteContents } from './_record-store';
import { sourceFor } from './_sources';
import { isPdf, readPdf } from './_pdf-source';
import type { AskPassword, DrawOptions, Original, Pages, RenderedPdf } from './types';

/**
 * Read a source file: an image as it is; a PDF has its password checked now (and asked for, if it
 * has one Volti doesn't know yet), once, and is otherwise read only when its pages or its PDF are wanted.
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

/**
 * An original's saved pages, by id, whether or not its file can be read: drawn only from the
 * page cache. Null when its page shapes aren't known or none of its pages is saved.
 */
export async function savedPages(id: string): Promise<Pages | null> {
  const [aspects, saved] = await Promise.all([knownAspects(id), hasSaved(id)]);
  if (!aspects || !saved) return null;
  const request = (page: number, pxWidth: number, o?: DrawOptions): DrawRequest =>
    ({ id, page, pxWidth, aspect: aspects[page - 1], crop: o?.crop, priority: o?.priority ?? 'now', signal: o?.signal });
  return {
    id,
    whole: false,
    aspects: async () => aspects,
    draw: (page, pxWidth, o) => drawPage(request(page, pxWidth, o)),
    // A page missing at the exact width is expected here: the stand-ins are what there is to show.
    async *drawProgressive(page, pxWidth, o) {
      let yielded = false;
      try {
        for await (const d of drawPageProgressive(request(page, pxWidth, o))) {
          yielded = true;
          yield d;
        }
      } catch (e) {
        if (!(e instanceof NotSaved && yielded)) throw e;
      }
    },
  };
}

/** Store an original's aspects, if they aren't as stored. */
async function storeAspects(id: string, aspects: number[]) {
  await _noteContents(id, { aspects });
}

/** page-cache's saveOffline, for originals: draws the page from the original's source. */
export async function savePageOffline(o: Original, page: OfflinePage, signal: AbortSignal): Promise<void> {
  if (!(o instanceof FileOriginal)) throw new NotSaved(`${o.id} can't be drawn`);
  return saveOffline({ id: o.id, source: o.source, page: page.page, pxWidth: page.pxWidth, aspect: page.aspect, priority: 'later', signal });
}

/** An original: its file's id, path, moving and removing, and itself as what reading it gives. */
class FileOriginal implements Original {
  readonly whole = true;
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
