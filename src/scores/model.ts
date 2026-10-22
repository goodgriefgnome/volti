// The data of a score: its cuts in played order, its archived cuts and its ink, as types, plus
// making a new score and a few measurements. Pure: no DOM, no storage. Editing is edits.ts, layout
// frames.ts, storage store.ts. The images the cuts are cut from come from the score's original
// (originals/).

import type { Marking } from '../markings/model';

/** A horizontal band of one page of the original; y0 and y1 are fractions of the page height, 0 = top. */
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

/** A score: what is shown of its original, as cuts in played order. Its id is its original's id. */
export interface Score {
  id: string;
  title: string;
  /** The musical key, shown in the library. Nothing sets it yet. */
  key: string;
  /** Not used yet; frames per screen still come from the toolbar's layout setting. */
  orientation: 'portrait' | 'landscape';
  /** The played order. */
  cuts: Cut[];
  /** Removed cuts that had their own ink; their markings stay in the ink record. */
  archived: Cut[];
}

/** A score's ink: its markings by cut id, in the coordinates of the original's pages. */
export type ScoreInk = Record<string, Marking[]>;

/** A score and its ink, which every edit to the cuts keeps in step. */
export interface State { score: Score; ink: ScoreInk }

/** Height / width of each page of the original. Frames take the shape of the first. */
export type Aspects = readonly number[];

/** Tolerance when comparing positions on a page or a frame. */
export const EPS = 1e-6;

export const newCutId = () => crypto.randomUUID();

export const frameHeight = (aspects: Aspects) => aspects[0];
export const cutHeight = (c: Cut, aspects: Aspects) => (c.y1 - c.y0) * aspects[c.page];
export const framesPerScreen = (score: Score) => (score.orientation === 'landscape' ? 2 : 1);

/** The score of an original opened the first time: every page once, in order. Landscape for portrait-shaped pages. */
export function newScore(id: string, title: string, aspects: Aspects): Score {
  return {
    id, title, key: '',
    orientation: aspects[0] >= 1 ? 'landscape' : 'portrait',
    cuts: aspects.map((_, page) => ({ id: newCutId(), page, y0: 0, y1: 1 })),
    archived: [],
  };
}
