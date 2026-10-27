// Types used by several files in originals/ but not outside it: a source file that can give its
// bytes, what draws an original's pages, and what reading a file gives.

import type { RenderedPdf, SourceFile } from './types';

/** A source file's bytes, for reading what only originals/ reads from it. */
export interface Readable extends SourceFile { file(): Promise<File> }

/** An original's pages, to draw. Pages are numbered from 1. */
export interface PageSource {
  readonly pages: number;
  /** Page height / width. */
  aspect(num: number): Promise<number>;
  /** Draw a page `width` device pixels wide. */
  draw(num: number, width: number): Promise<HTMLCanvasElement>;
  /** Draw a page `pageWidth` pixels wide, and cut `region` (in those pixels) out of it. */
  region(num: number, pageWidth: number, region: { x: number; y: number; w: number; h: number }): Promise<HTMLCanvasElement>;
  destroy(): void;
}

/** What a file's bytes are, read as music: its pages to draw, and its music as a PDF. */
export interface Content {
  pages(): Promise<PageSource>;
  pdf(): Promise<RenderedPdf>;
}
