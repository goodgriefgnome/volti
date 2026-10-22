// The data of a piece: its cuts in played order, its archived cuts and its ink, as types, plus
// making a new piece and a few measurements. Pure: no DOM, no storage. Editing is edits.ts, layout
// frames.ts, storage store.ts.

import type { Marking } from '../markings/model';

/** A horizontal band of one source page; y0 and y1 are fractions of the page height, 0 = top. */
export interface Cut {
  id: string;
  page: number;
  y0: number;
  y1: number;
  /** White space above, in page widths, used only when this cut starts a frame. */
  pad?: number;
  /** Someone has drawn or erased on this cut, so removing it archives it rather than deleting it. */
  ownInk?: boolean;
}

export interface Piece {
  id: string;
  sourceId: string;
  title: string;
  key: string;
  orientation: 'portrait' | 'landscape';
  /** The played order. */
  cuts: Cut[];
  /** Removed cuts that had their own ink; their markings stay in the ink record. */
  archived: Cut[];
}

/** A piece's ink: its markings by cut id, in source-page coordinates. */
export type PieceInk = Record<string, Marking[]>;

/** A piece and its ink, which every edit to the cuts keeps in step. */
export interface State { piece: Piece; ink: PieceInk }

/** Height / width of each source page. Frames take the shape of the first. */
export type Aspects = readonly number[];

/** Tolerance when comparing positions on a page or a frame. */
export const EPS = 1e-6;

export const newCutId = () => crypto.randomUUID();

export const frameHeight = (aspects: Aspects) => aspects[0];
export const cutHeight = (c: Cut, aspects: Aspects) => (c.y1 - c.y0) * aspects[c.page];
export const framesPerScreen = (piece: Piece) => (piece.orientation === 'landscape' ? 2 : 1);

/** A new file is one piece: every page once, in order. Landscape for portrait-shaped pages. */
export function newPiece(id: string, sourceId: string, title: string, aspects: Aspects): Piece {
  return {
    id, sourceId, title, key: '',
    orientation: aspects[0] >= 1 ? 'landscape' : 'portrait',
    cuts: aspects.map((_, page) => ({ id: newCutId(), page, y0: 0, y1: 1 })),
    archived: [],
  };
}
