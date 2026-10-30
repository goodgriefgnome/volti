// The data of a score: its cuts in played order, its archived cuts and its ink, as types, plus
// making a new score, fitting one to its original's pages, and a few measurements. Pure: no DOM, no storage. Editing is edits.ts, layout
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

/**
 * A score: what is shown of its original, as cuts in played order. Its id is its original's id; its
 * title is always its original's (`titleOf` its path), so it has none of its own.
 */
export interface Score {
  /** Not stored: taken from the key on loading. */
  id: string;
  /** The musical key, shown in the library. Nothing sets it yet. */
  key: string;
  /** The played order. */
  cuts: Cut[];
  /** Removed cuts that had their own ink; their markings stay in the ink record. */
  archived: Cut[];
  /**
   * The score's named excerpts, the only excerpts a score keeps; they follow edits to the cuts as
   * setlist entries do (scores/excerpts.ts). At most one name per excerpt, and none on the whole
   * score. Missing until one is named.
   */
  excerpts?: NamedExcerpt[];
  /** The size a symbol of scale 1 is placed at, in page widths: the one the last symbol edit implied. */
  symbolSize?: number;
  /** Text's size relative to the symbol size: the one the last text resize implied. */
  textScale?: number;
}

/** The symbol size of a score that has none set: 0.035 page widths (a 7 mm staff on an A4 page). */
export const DEFAULT_SYMBOL_SIZE = 0.035;

export const symbolSizeOf = (s: Score) => s.symbolSize ?? DEFAULT_SYMBOL_SIZE;

/** The text scale of a score that has none set. */
export const DEFAULT_TEXT_SCALE = 0.6;

export const textScaleOf = (s: Score) => s.textScale ?? DEFAULT_TEXT_SCALE;

/** A name on the cuts from `first` to `last`; a missing end is the score's start or end. */
export interface NamedExcerpt { first?: string; last?: string; name: string }

/** A score's ink: its markings by cut id, in the coordinates of the original's pages. */
export type ScoreInk = Record<string, Marking[]>;

/** A score and its ink, which every edit to the cuts keeps in step. */
export interface State { score: Score; ink: ScoreInk }

/** Height / width of each page of the original. A frame takes the shape of its first cut's page. */
export type Aspects = readonly number[];

/** Height / width of an A4 page: the shape a score that can't be opened is shown. */
export const A4 = 297 / 210;

/** Tolerance when comparing positions on a page or a frame. */
export const _EPS = 1e-6;

export const _newCutId = () => crypto.randomUUID();

export const _cutHeight = (c: Cut, aspects: Aspects) => (c.y1 - c.y0) * aspects[c.page];

/** The score of an original opened the first time: every page once, in order. */
export function newScore(id: string, aspects: Aspects): Score {
  return {
    id, key: '',
    cuts: aspects.map((_, page) => ({ id: _newCutId(), page, y0: 0, y1: 1 })),
    archived: [],
  };
}

/** Drop cuts of pages the original no longer has; a score left with nothing starts again from the pages. */
export function _forPages(s: State, aspects: Aspects): State {
  const ok = (c: { page: number }) => c.page < aspects.length;
  const score: Score = { ...s.score, cuts: s.score.cuts.filter(ok), archived: s.score.archived.filter(ok) };
  if (!score.cuts.length) score.cuts = newScore(score.id, aspects).cuts;
  return { ...s, score };
}
