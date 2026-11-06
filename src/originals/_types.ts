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

/**
 * What a root notes about a file to tell later whether it has changed, without reading it: a
 * handle root's size and modified time, say, or a crc32. Only its root reads what is in it. Flat,
 * so it can be stored as it is and compared field by field; never has a field called `kind`.
 */
export type Stamp = Readonly<Record<string, string | number>>;

/** Where an id is in a root: its path (the canonical one, if it is there more than once), and its root's stamp. */
export interface Found { path: string; stamp?: Stamp }

/** What the records hold for a root: each id's place there. */
export type Known = ReadonlyMap<string, Found>;

/** A change a scan found: `id` is at `found` now (new, moved, or restamped), or, without `found`, nowhere in the root any more. */
export interface Update { id: string; found?: Found }

/** One batch of what a scan says: its changes, in order, and how many new files are still to be hashed. */
export interface Updates { changes: Update[]; left: number }

/** Where a moved file is now, as the root spells its folder, with its stamp; or why it couldn't move. */
export type Moved =
  | { path: string; file: File; stamp?: Stamp; leftBehind?: true }  // leftBehind: copied, but the file at `from` couldn't be deleted
  | { caseOnly: true };                                               // only the case changes, and this root can't do that

/** How a removed file can be put back. */
export type UndeleteInfo =
  /** Its copy is in Volti's removed folder (OPFS removed/), kept at `copiedAt` (ms since 1970). */
  | { copiedAt: number }
  /** It is in a root's own bin; only that kind of root reads `binned`. */
  | { binned: Stamp };

/** A library root: files by path. */
export interface ScoreRoot {
  /** Whether it can be read now without asking. Never asks. */
  access(): Promise<'ready' | 'locked'>;
  /** Make sure it can be read, or changed too, asking where it isn't allowed yet (from a tap); throws NoAccess. */
  needAccess(mode: 'read' | 'readwrite'): Promise<void>;
  /** How what is in it differs from `known`, as it finds out: see "Scanning". */
  getUpdates(known: Known, signal: AbortSignal): AsyncIterable<Updates>;
  /** The file at `path`; `id`, when the caller knows it, lets a root that keeps copies by id read one without finding the path. */
  read(path: string, id?: string): Promise<File>;
  /** Whether the root keeps a copy of `id` it can read without access or a network. */
  kept(id: string): Promise<boolean>;
  /** Whether there is a file at `path` (as the root finds names: a folder that ignores case finds one in any case). */
  exists(path: string): Promise<boolean>;
  /** Write `data` at `path`, over a file there, making the folders on it; one that fails part way leaves nothing. Gives the file as written, and its stamp. */
  write(path: string, data: Blob): Promise<{ file: File; stamp?: Stamp }>;
  /** Move the file at `from` to `to`, making the folders on it. */
  move(from: string, to: string): Promise<Moved>;
  /**
   * Remove the file at `path`, whose id is `id`, from the root, and say how it can be put back: a
   * root with a bin of its own (Drive) puts it there and writes nothing; the others first copy it
   * into Volti's removed folder, so that failing part way loses nothing.
   */
  remove(path: string, id: string): Promise<UndeleteInfo>;
  /** Whether `undelete` can take this file out of the bin: it is in this root's bin. Never asks, and needs no network. */
  canUndelete(binned: Stamp): boolean;
  /** Take a file out of the root's bin, to `to`, making the folders on it; 'taken' when a file is there now. */
  undelete(binned: Stamp, to: string): Promise<Moved | 'taken'>;
}
