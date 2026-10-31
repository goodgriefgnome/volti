// The public types of originals/: source files and originals, what an original gives as a PDF, the
// state of the linked folder, passwords, removed files, and the errors thrown
// when a file can't be read for want of access or a password, or a folder can't be linked.

import type { Crop, Drawn, Priority } from '../page-cache/types';

/** What a draw may ask besides the page and its width. */
export interface DrawOptions { crop?: Crop; priority?: Priority; signal?: AbortSignal }

/** Bytes Volti can read as music: a PDF or an image. */
export interface SourceFile {
  /** The SHA-256 of the file's contents, in hex; also the id of the score made from it. */
  readonly id: string;
  /** Where it is in the library's root ("Masses/Latin/Mass in G.pdf"), or would go. */
  readonly path: string;
  /**
   * Rename it, or move it into another folder ('' at the top), or both, making the folders that
   * aren't there yet; its score stays, as its contents don't change. One held outside the library
   * is moved into it. Says why when it can't (a file of that name is there already); throws
   * NoAccess when the scores folder can't be changed.
   */
  move(path: string): Promise<string | null>;
  /** Move it out of the library, into Recently removed; or drop one held outside it. Throws NoAccess when the scores folder can't be changed. */
  remove(): Promise<void>;
  /**
   * Read it as music: its original. A PDF with a password not known yet asks `ask` for it, and
   * remembers it (without `ask`, it throws PasswordNotGiven); throws NoAccess when the scores
   * folder can't be read.
   */
  read(ask?: AskPassword): Promise<Original>;
  /** Whether it can be read now without asking for access to the scores folder. */
  canReadNow(): Promise<boolean>;
}

/** What can be read of an original: its page shapes, and its pages drawn. */
export interface Pages {
  readonly id: string;
  /** Each page's height / width, in order: as stored, else worked out by opening it, and stored. */
  aspects(): Promise<number[]>;
  /** Page `page` (from 1), `pxWidth` device pixels wide, through the page cache. Priority defaults to 'now'. */
  draw(page: number, pxWidth: number, options?: DrawOptions): Promise<Drawn>;
  /** As draw, with stand-ins first (page-cache's drawPageProgressive). */
  drawProgressive(page: number, pxWidth: number, options?: DrawOptions): AsyncIterable<Drawn>;
  /** False when only the pages saved in the page cache can be drawn. */
  readonly whole: boolean;
}

/**
 * A source file Volti has read: what a score is made from. It is counted: it is got once, and
 * closed once by whoever got it. The rules, with no exceptions:
 * 1. Whoever gets an original (`SourceFile.read()`, `Original.read()`, `openScore`) closes it,
 *    exactly once.
 * 2. A function given an original only borrows it: it never closes it, and its caller keeps it
 *    open until the function's promise settles.
 * 3. Keeping an original past one's own promise (in a field, or in a closure that runs later)
 *    means getting it again with `read()`, and closing that.
 */
export interface Original extends SourceFile, Pages {
  /** Done with it. Throws when it is closed more often than it was got; it can't be used after its last close. */
  close(): void;
  /** The same original, got once more: to be closed once more. */
  read(ask?: AskPassword): Promise<Original>;
  /** Its music as a PDF, for export (_pdf-source.ts, _image-source.ts). */
  pdf(): Promise<RenderedPdf>;
}

/** Whether a scores folder is linked, and whether this session may read it. */
export type FolderState =
  | { kind: 'none' }
  | { kind: 'ready'; name: string }
  | { kind: 'locked'; name: string }; // linked, but needs a tap to allow access this session

/** Ask for a PDF's password, saying whether the last one tried was wrong; null when it isn't given. */
export type AskPassword = (title: string, wrong: boolean) => Promise<string | null>;

/** Opening stopped because the PDF's password wasn't given. */
export class PasswordNotGiven extends Error {
  name = 'PasswordNotGiven';
}

/**
 * Why an original as a PDF has lost something of its music: its pages were drawn by pdf.js, as
 * its encryption isn't one pdf-decrypt knows (`encryption`) or pdf-lib can't read it
 * (`unreadable`); or, an image, it was put in as a JPEG of its own (`recompressed`).
 */
export type LossyReason = 'encryption' | 'unreadable' | 'recompressed';

/** An original's music as a PDF that pdf.js and pdf-lib can both read. */
export interface RenderedPdf {
  /** An unencrypted PDF that pdf-lib can read, new each time: pdf.js takes the bytes it is given. */
  bytes: Uint8Array;
  /** Why its music isn't as the file has it; none when it is. */
  lossyReason?: LossyReason;
}

/** The scores folder can't be read, or changed, as access to it isn't allowed. */
export class NoAccess extends Error {
  name = 'NoAccess';
}

/** The folder picker wouldn't give the folder chosen, as Android does for Download itself and the top of internal storage. */
export class FolderRefused extends Error {
  name = 'FolderRefused';
}

/** A removed file: its id, where it was in the library, and when it was removed (ms since 1970). */
export interface Removed { id: string; path: string; at: number }
