// Types used by several files in originals/ but not outside it: a source file that can give its
// bytes, what draws an original's pages, and what reading a file gives.

import type { Crop } from '../page-cache/types';
import type { RenderedPdf, SourceFile } from './types';

/** What library-files.ts asks of a score filesystem's record of its files' ids, by path. */
export interface Ids {
  /** The id worked out before for the file at `path`, while it can be trusted. */
  known(path: string, file: File): string | undefined;
  /** The id of the file at `path`: the known one, else its contents hashed; noted for `save`. */
  id(path: string, file: File): Promise<string>;
  /** Note at once the id of a file at `path` whose contents are known. */
  remember(path: string, file: File, id: string): Promise<void>;
  /** Note at once that a file with id `id` is now at `to` (`file`), not at `from`. */
  moved(from: string, to: string, file: File, id: string): Promise<void>;
  /** Note at once that the file at `path` is gone. */
  forget(path: string): Promise<void>;
  /** After a full listing: keep the ids of the files seen, drop the rest. */
  save(): Promise<void>;
}

/** A source file's bytes, for reading what only originals/ reads from it. */
export interface Readable extends SourceFile { file(): Promise<File> }

/** An original's pages, open: pdf.js's document, or an image's bitmap. Pages are numbered from 1. */
export interface OpenPages {
  readonly pages: number;
  /** Page height / width. */
  aspect(num: number): Promise<number>;
  /** Draw a page `pxWidth` device pixels wide, or `crop` of it; stops when `signal` aborts. */
  draw(num: number, pxWidth: number, crop: Crop | undefined, signal: AbortSignal): Promise<HTMLCanvasElement>;
  destroy(): void;
}

/** What a file's bytes are, read as music: its pages to draw, and its music as a PDF. */
export interface Content {
  pages(): Promise<OpenPages>;
  pdf(): Promise<RenderedPdf>;
}
