// The types of the page cache: what it is asked to draw and gives back, and what it is given to
// draw from. It knows nothing about files; originals/ makes the PageSource.

/** A part of a page drawn `pxWidth` device pixels wide, in those pixels. */
export interface Crop { x: number; y: number; w: number; h: number }

export type Priority = 'now' | 'ahead' | 'later';

/** What draws an original's pages, for the cache. originals/ makes these; nothing else sees them. */
export interface PageSource {
  /** The bytes that have to be parsed to draw any of its pages: its file's size. */
  readonly size: number;
  /**
   * Draw page `page` (from 1) `pxWidth` device pixels wide, or `crop` of it. Rejects with a
   * DOMException named 'AbortError' once `signal` aborts.
   */
  draw(page: number, pxWidth: number, crop: Crop | undefined, signal: AbortSignal): Promise<HTMLCanvasElement>;
}

export interface DrawRequest {
  /** The original's id. */
  id: string;
  /** Where to draw it from; none when the original can't be read, so only saved pages can be had. */
  source?: PageSource;
  /** From 1. */
  page: number;
  /** The whole page's width, in device pixels. */
  pxWidth: number;
  /** The page's height / width. */
  aspect: number;
  crop?: Crop;
  priority: Priority;
  signal?: AbortSignal;
  /** Save the whole page as soon as it is had, whatever it would take to draw again: a page on the reader's screen, to show at once after a restart. */
  keep?: boolean;
}

export interface Drawn {
  /** The page, or the crop of it, as drawn at `pxWidth`. */
  canvas: HTMLCanvasElement;
  /** The whole page's width it was drawn at: scale by request.pxWidth / pxWidth to place it. */
  pxWidth: number;
  /** Equivalent to what was asked for (decision 2); false for a stand-in. */
  exact: boolean;
}

/** A page to keep offline, at exactly this width. */
export interface OfflinePage { page: number; pxWidth: number; aspect: number }

/** A page kept offline: a score's page (from 1), at a width. */
export interface OfflineKey { id: string; page: number; pxWidth: number }

/** Thrown when there is no source and nothing held or saved for the request. */
export class NotSaved extends Error { name = 'NotSaved'; }
