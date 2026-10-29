// Types used by several files in originals/ but not outside it: a source file that can give its
// bytes, what draws an original's pages, and what reading a file gives.

import type { Crop } from '../page-cache/types';
import type { RenderedPdf, SourceFile } from './types';

/** A source file's bytes, for reading what only originals/ reads from it. */
export interface Readable extends SourceFile { file(): Promise<File> }

/** An original's pages, open: pdf.js's document, or an image's bitmap. Pages are numbered from 1. */
export interface OpenPages {
  readonly pages: number;
  /** Page height / width. */
  aspect(num: number): Promise<number>;
  /** Draw a page `pxWidth` device pixels wide, or `crop` of it; stops when `signal` aborts. */
  draw(num: number, pxWidth: number, crop: Crop | undefined, signal: AbortSignal): Promise<HTMLCanvasElement>;
  /** Free the document or bitmap now. */
  close(): void;
}

/** What a file's bytes are, read as music: its pages to draw, and its music as a PDF. */
export interface Content {
  pages(): Promise<OpenPages>;
  pdf(): Promise<RenderedPdf>;
}
